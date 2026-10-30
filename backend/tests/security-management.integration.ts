import {authContext} from '../src/auth/context.js';
import {collectPrices} from '../../collector/src/price-collector.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';import {buildApp} from '../src/auth/route-test-app.js';
import {withCollection,collectionFetch,collectionFeatures,CollectionExcluded,eligibleWhere} from '@roxstock/shared/collection/collection-policy';
import {PrismaCollectorRepository} from '../../collector/src/repository.js';
import {collectRealtimeCycle} from '../../collector/src/realtime-price-collector.js';
import {enqueueManualRefresh,parseManualRefresh} from '../../collector/src/dart-manual-refresh.js';
import {realtimePriceCache} from '../src/realtime/price-cache.js';
test('phase23 real MariaDB: master pages, provenance, code/history preservation, exclusion fencing, concurrency and deletion',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/,'Isolated CI DB only');
 const raw=new PrismaClient(),app=buildApp(),ids:bigint[]=[],runs:bigint[]=[];
 const admin={userId:1n,role:'ADMIN',sessionId:'phase23-isolated-admin',mustChangePassword:false};
 const account=await prisma.account.create({data:{name:'Phase23 isolated',brokerName:'CI',accountNumber:'phase23-isolated'}});
 const make=async(symbol:string,source='MANUAL')=>{const row=await prisma.security.create({data:{symbol,name:'Phase23 '+symbol,marketType:'OTHER',registrationSource:source}});ids.push(row.id);return row;};
 const patch=async(id:bigint,body:unknown,path='')=>{const r=await app.inject({method:'PATCH',url:`/api/security-management/${id}${path}`,payload:body as any});return r;};
 const policy=async(id:bigint,feature:string,excluded:boolean)=>{const r=await patch(id,{feature,excluded,confirmed:true},'/collection');assert.equal(r.statusCode,200,r.body);return r.json().data;};
 try{
  for(let i=0;i<105;i++)await make('X23'+String(i).padStart(3,'0'));
  let cursor:string|null=null,all:any[]=[];const pageCounts:number[]=[];
  do{const r=await app.inject('/api/security-management?query=Phase23'+(cursor?'&cursor='+cursor:''));assert.equal(r.statusCode,200,r.body);const p=r.json().data;pageCounts.push(p.rows.length);all.push(...p.rows);cursor=p.nextCursor;}while(cursor);
  assert.deepEqual(pageCounts,[50,50,5]);assert.equal(new Set(all.map(r=>r.id)).size,105);
  const manual=await make('X23990'),dart=await make('X23991','DART'),unknown=await make('X23992','UNKNOWN'),unused=await make('X23993');
  for(const s of [dart,unknown]){const denied=await patch(s.id,{symbol:'Z99990',confirmCodeChange:true});assert.equal(denied.statusCode,403,denied.body);assert.equal((await patch(s.id,{name:'Phase23 renamed '+s.symbol})).statusCode,200);}
  // v0.6 master switch: atomic whole-scope activation clears all local exclusions.
  await policy(manual.id,'consensus',true);await policy(manual.id,'ALL',true);
  let whole=await patch(manual.id,{feature:'ALL',excluded:false,allFeatures:true,confirmed:true},'/collection');assert.equal(whole.statusCode,200,whole.body);
  assert.equal(whole.json().data.collectionExcluded,false);assert.deepEqual(whole.json().data.excludedFeatures,[]);
  const revision=whole.json().data.collectionRevision;
  whole=await patch(manual.id,{feature:'ALL',excluded:true,allFeatures:true,confirmed:true},'/collection');assert.equal(whole.statusCode,200,whole.body);
  assert.equal(whole.json().data.collectionExcluded,true);assert.deepEqual(whole.json().data.excludedFeatures,[...collectionFeatures]);assert.equal(whole.json().data.collectionRevision,revision+1);
  assert.equal((await patch(manual.id,{feature:'ALL',excluded:true,allFeatures:true},'/collection')).statusCode,400);
  assert.equal((await patch(manual.id,{feature:'consensus',excluded:false,allFeatures:true},'/collection')).statusCode,400);
  // Opt-in individual activation behind ALL keeps the other effective OFF settings.
  const single=await patch(manual.id,{feature:'consensus',excluded:false,restoreGlobal:true},'/collection');
  assert.equal(single.statusCode,200,single.body);assert.equal(single.json().data.collectionExcluded,false);
  assert.deepEqual(single.json().data.excludedFeatures,collectionFeatures.filter(f=>f!=='consensus'));
  assert.equal((await patch(manual.id,{feature:'ALL',excluded:false,restoreGlobal:true},'/collection')).statusCode,400);
  assert.equal((await patch(manual.id,{feature:'consensus',excluded:true,restoreGlobal:true,confirmed:true},'/collection')).statusCode,400);
  await patch(manual.id,{feature:'ALL',excluded:false,allFeatures:true,confirmed:true},'/collection');
  // Inject a failure after the security UPDATE into a real MariaDB transaction.
  const beforeRollback=await raw.security.findUniqueOrThrow({where:{id:manual.id}});
  const transaction=prisma.$transaction;
  (prisma as any).$transaction=(work:any,options:any)=>transaction.call(prisma,async(tx:any)=>work(new Proxy(tx,{get(target,key){if(key==='dartBackfillTask')return {...target.dartBackfillTask,updateMany:async()=>{throw Error('phase24 injected write failure');}};return Reflect.get(target,key);}})),options);
  try{assert.equal((await patch(manual.id,{feature:'ALL',excluded:true,allFeatures:true,confirmed:true},'/collection')).statusCode,500);}
  finally{(prisma as any).$transaction=transaction;}
  const rolledBack=await raw.security.findUniqueOrThrow({where:{id:manual.id}});
  assert.equal(rolledBack.collectionRevision,beforeRollback.collectionRevision);assert.equal(rolledBack.collectionExcluded,false);assert.deepEqual(rolledBack.excludedFeatures,[]);
  // Concurrent whole updates cannot expose a partial global/feature state to readers.
  await Promise.all(Array.from({length:2},(_,i)=>patch(manual.id,{feature:'ALL',excluded:i%2===0,allFeatures:true,confirmed:true},'/collection').then(r=>assert.equal(r.statusCode,200,r.body))),
   (async()=>{for(let i=0;i<12;i++){const snapshot=await raw.security.findUniqueOrThrow({where:{id:manual.id}});assert.deepEqual(snapshot.excludedFeatures,snapshot.collectionExcluded?[...collectionFeatures]:[]);}})());
  await patch(manual.id,{feature:'ALL',excluded:false,allFeatures:true,confirmed:true},'/collection');
  await policy(manual.id,'consensus',true);await policy(manual.id,'ALL',false);
  assert.deepEqual((await prisma.security.findUnique({where:{id:manual.id}}))!.excludedFeatures,['consensus']);
  await patch(manual.id,{feature:'ALL',excluded:false,allFeatures:true,confirmed:true},'/collection');
  const oldPrice=await prisma.marketPrice.create({data:{securityId:manual.id,collectionSymbol:manual.symbol,currentPrice:'123',previousClosePrice:'120',priceUpdatedAt:new Date()}});
  const today=new Date();today.setUTCHours(0,0,0,0);
  await prisma.financialStatement.create({data:{securityId:manual.id,collectionSymbol:manual.symbol,fiscalYear:today.getUTCFullYear(),periodType:'ANNUAL',periodEndDate:new Date(Date.UTC(today.getUTCFullYear(),11,31)),netIncome:'999',operatingProfit:'20',totalAssets:'100',totalEquity:'200'}});
  await prisma.valuationMetric.create({data:{securityId:manual.id,collectionSymbol:manual.symbol,metricDate:today,eps:'33',bps:'10',per:'3'}});
  await prisma.securityFundamentals.create({data:{securityId:manual.id,collectionSymbol:manual.symbol,issuedShares:'100',treasuryShares:'25',controllingProfit:'999'}});
  const run=await prisma.collectorRun.create({data:{jobType:'realtime-selected-prices',provider:'phase23-ci',status:'PARTIAL',successCount:1,failureCount:1}});runs.push(run.id);
  await prisma.collectorRunItem.createMany({data:[{runId:run.id,securityId:manual.id,symbol:manual.symbol,status:'FAILED',message:'수집 오류 https://example.invalid/api?token=secret-value "password":"private"'},{runId:run.id,securityId:unused.id,symbol:unused.symbol,status:'SUCCESS'}]});
  const overview=(await app.inject('/api/collection/monitoring')).json().data.features.find((r:any)=>r.id==='realtime-prices');
  assert.equal(overview.recent.failed,1);assert.equal(overview.resultScope.runId,String(run.id));
  const failed=(await app.inject(`/api/collection/monitoring/realtime-prices/items?result=FAILED&runId=${run.id}`)).json().data;
  assert.equal(failed.rows.length,overview.recent.failed);assert.equal(failed.rows[0].security.id,String(manual.id));assert.doesNotMatch(failed.rows[0].reason,/example.invalid|secret-value|private/);
  const success=(await app.inject(`/api/collection/monitoring/realtime-prices/items?result=SUCCESS&runId=${run.id}`)).json().data;assert.equal(success.rows.length,overview.recent.success);
  // Each feature and ALL is checked before I/O; retained failures stay visible while excluded.
  let calls=0;
  const network=collectionFetch((async()=>{calls++;return Response.json({price:777});}) as typeof fetch);
  for(const feature of collectionFeatures){await policy(manual.id,feature,true);await assert.rejects(withCollection(prisma,manual.id,feature,()=>network('https://example.invalid')),CollectionExcluded);assert.equal((await prisma.security.findMany({where:{AND:[{id:manual.id},eligibleWhere(feature)]}})).length,0);await policy(manual.id,feature,false);}
  await policy(manual.id,'ALL',true);for(const f of collectionFeatures)await assert.rejects(withCollection(prisma,manual.id,f,()=>network('https://example.invalid')),CollectionExcluded);assert.equal(calls,0);
  const repository=new PrismaCollectorRepository(prisma);
  const provider={name:'phase23-ci',fetchPrice:async()=>{calls++;throw Error('Excluded provider must never be called');}};
  const batch=await collectPrices(repository,provider,{delayMs:0,lockTtlSeconds:30,symbols:[manual.symbol]});runs.push(batch.runId);assert.equal(batch.status,'SUCCESS');assert.equal(batch.success,0);assert.equal(batch.skipped,1);
  const cycle=await collectRealtimeCycle([manual],provider,new Map(),1,async()=>{},async()=>{},()=>{},repository.withTarget.bind(repository));assert.equal(cycle.results?.[0]?.status,'SKIPPED');assert.equal(calls,0);
  assert.equal((await prisma.collectorRunItem.count({where:{runId:run.id,status:'FAILED'}})),1);
  await assert.rejects(enqueueManualRefresh(prisma,manual.id,parseManualRefresh({fiscalYear:2025,period:'ANNUAL'})),{code:'COLLECTION_EXCLUDED'});
  await policy(manual.id,'ALL',false);
  // Capture an actual pending request; a concurrent code edit fences both the response and write.
  let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),pending=new Promise<void>(r=>release=r);
  const late=withCollection(prisma,manual.id,'market-prices',async()=>{
   await collectionFetch((async()=>{calls++;entered();await pending;return Response.json({price:777});}) as typeof fetch)('https://example.invalid');
   await prisma.marketPrice.update({where:{securityId:manual.id},data:{currentPrice:'777'}});
  });await started;
  const changed=await patch(manual.id,{symbol:' z99990 ',confirmCodeChange:true});assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().data.symbol,'Z99990');release();await assert.rejects(late,CollectionExcluded);
  assert.equal((await raw.marketPrice.findUnique({where:{securityId:manual.id}}))!.currentPrice.toString(),'123');assert.equal(await prisma.marketPrice.findUnique({where:{securityId:manual.id}}),null);
  const nested=await prisma.security.findUnique({where:{id:manual.id},include:{marketPrice:true}});assert.equal(nested!.marketPrice,null);
  const archived=await raw.securityCodeHistory.findFirst({where:{securityId:manual.id}});assert.equal((archived!.preservedData as any).marketPrice.currentPrice,'123');assert.equal(archived!.previousSymbol,manual.symbol);
  assert.equal((await patch(manual.id,{feature:'ALL',excluded:false},'/collection')).statusCode,409);
  assert.equal((await patch(manual.id,{feature:'ALL',excluded:false,allFeatures:true,confirmed:true},'/collection')).statusCode,409);
  for(const f of collectionFeatures)await assert.rejects(withCollection(prisma,manual.id,f,()=>network('https://example.invalid')),CollectionExcluded);assert.equal(calls,1);
  // The real broker rejects old code/revision and does not add it to SSE cache.
  const priorToken=process.env.COLLECTOR_INTERNAL_TOKEN;process.env.COLLECTOR_INTERNAL_TOKEN='phase23-ci-token';
  const broker=await app.inject({method:'POST',url:'/internal/realtime-prices',headers:{authorization:'Bearer phase23-ci-token'},payload:{prices:[{securityId:String(manual.id),collectionRevision:0,symbol:manual.symbol,name:manual.name,currentPrice:'777',previousClosePrice:null,observedAt:new Date().toISOString(),marketStatus:'OPEN'}]}});assert.equal(broker.statusCode,200);assert.equal(broker.json().data.accepted,0);assert.equal(realtimePriceCache.get(new Set([manual.symbol])).length,0);
  if(priorToken===undefined)delete process.env.COLLECTOR_INTERNAL_TOKEN;else process.env.COLLECTOR_INTERNAL_TOKEN=priorToken;
  // Manual price input remains permitted for Z99; old observed values are preserved in the archive.
  await prisma.buyTrade.create({data:{accountId:account.id,securityId:manual.id,boughtAt:new Date(),quantity:'1',unitPrice:'100'}});
  const blockedHeld=await authContext.run(admin,async()=>await app.inject({method:'DELETE',url:`/api/security-management/${manual.id}`,payload:{confirmed:true}}));assert.equal(blockedHeld.statusCode,409);assert.match(blockedHeld.json().error.message,/보유/);
  const manualPrice=await app.inject({method:'PATCH',url:`/api/securities/${manual.id}/price`,payload:{currentPrice:'456'}});assert.equal(manualPrice.statusCode,200,manualPrice.body);assert.equal((await prisma.marketPrice.findUnique({where:{securityId:manual.id}}))!.currentPrice.toString(),'456');assert.equal(manualPrice.json().data.previousClosePrice,null);
  const analysis=await app.inject({method:'PATCH',url:`/api/securities/${manual.id}/analysis`,payload:{assets:'1000',dividend:'3',issuedShares:'1000'}});assert.equal(analysis.statusCode,200,analysis.body);
  const statement=(await raw.financialStatement.findFirst({where:{securityId:manual.id}}))!;assert.equal(statement.totalAssets!.toString(),'1000');assert.equal(statement.netIncome,null);assert.equal(statement.operatingProfit,null);assert.equal(statement.totalEquity,null);
  const metric=(await raw.valuationMetric.findFirst({where:{securityId:manual.id}}))!;assert.equal(metric.dividendPerShare!.toString(),'3');assert.equal(metric.eps,null);assert.equal(metric.bps,null);
  const fundamentals=(await raw.securityFundamentals.findUnique({where:{securityId:manual.id}}))!;assert.equal(fundamentals.issuedShares!.toString(),'1000');assert.equal(fundamentals.treasuryShares,null);assert.equal(fundamentals.controllingProfit,null);assert.equal((archived!.preservedData as any).financialStatements[0].netIncome,'999');
  const snapshotAccounts=await repository.listActiveAccountsForSnapshot();assert.ok(snapshotAccounts.some(a=>a.id===account.id&&a.lots.some(l=>l.symbol==='Z99990')));
  await patch(manual.id,{symbol:'X23994',confirmCodeChange:true});
  // Exclude/reactivate without changing the code also invalidates an already issued token.
  const current=(await prisma.security.findUnique({where:{id:manual.id}}))!;await policy(manual.id,'market-prices',true);await policy(manual.id,'market-prices',false);
  await assert.rejects(withCollection(prisma,manual.id,'market-prices',()=>network('https://example.invalid'),current),CollectionExcluded);assert.equal(calls,1);
  // Two actual DB transactions competing for the same normalized code cannot both commit.
  const other=await make('X23995');const simultaneous=await Promise.all([patch(manual.id,{symbol:'x23996',confirmCodeChange:true}),patch(other.id,{symbol:' X23996 ',confirmCodeChange:true})]);assert.deepEqual(simultaneous.map(r=>r.statusCode).sort(),[200,409]);assert.equal(simultaneous.find(r=>r.statusCode===409)!.json().error.message,'이미 등록된 종목코드입니다.');assert.equal(await raw.security.count({where:{symbol:'X23996'}}),1);
  await prisma.accountWatchlistItem.create({data:{accountId:account.id,securityId:other.id,listType:'WATCHLIST'}});
  const denied=await authContext.run(admin,async()=>await app.inject({method:'DELETE',url:`/api/security-management/${other.id}`,payload:{confirmed:true}}));assert.equal(denied.statusCode,409);assert.match(denied.json().error.message,/관심/);assert.equal((await patch(other.id,{name:'Phase23 editable used stock'})).statusCode,200);
  const deleted=await authContext.run(admin,async()=>await app.inject({method:'DELETE',url:`/api/security-management/${unused.id}`,payload:{confirmed:true}}));assert.equal(deleted.statusCode,200);assert.equal((await raw.security.findUnique({where:{id:unused.id}}))!.isActive,false);assert.equal(await raw.collectorRunItem.count({where:{runId:run.id}}),2);
  console.log(JSON.stringify({phase:23,pages:pageCounts,featuresChecked:collectionFeatures,excludedExternalCalls:0,delayedRequests:1,lateWrites:0,oldBrokerDeliveries:0,historyRetained:true,concurrentCodeStatuses:simultaneous.map(r=>r.statusCode),actualDB:true,phase24:{wholeFeatureFlags:true,individualRestore:true,rollback:true,concurrentSnapshot:true,legacyAllPreservesFeatures:true}}));
 }finally{
  await raw.collectorRun.deleteMany({where:{id:{in:runs}}});await raw.buyTrade.deleteMany({where:{accountId:account.id}});await raw.accountWatchlistItem.deleteMany({where:{accountId:account.id}});await raw.financialStatement.deleteMany({where:{securityId:{in:ids}}});await raw.valuationMetric.deleteMany({where:{securityId:{in:ids}}});await raw.securityFundamentals.deleteMany({where:{securityId:{in:ids}}});await raw.marketPrice.deleteMany({where:{securityId:{in:ids}}});await raw.securityCodeHistory.deleteMany({where:{securityId:{in:ids}}});await raw.security.deleteMany({where:{id:{in:ids}}});await raw.account.delete({where:{id:account.id}});await app.close();await raw.$disconnect();await prisma.$disconnect();
 }
});
