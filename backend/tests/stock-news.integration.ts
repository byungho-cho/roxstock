import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../src/app.js';
import {prisma} from '@roxstock/shared/lib/prisma';
import {hash,kstStart,seoulDay,candidateKeys,type NewsCandidate} from '@roxstock/shared/news/policy';
import {supplementNewsSummaries} from '../../collector/src/news-summary.js';
import {collectStockNews} from '../../collector/src/news-collector.js';

test('phase33 isolated DB: target union, single shared collection, partial/failure lifecycle, stored pages, snapshots and account isolation',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);
 const app=buildApp(),accounts=await Promise.all(['A','B'].map(n=>prisma.account.create({data:{name:'NEWS33 '+n,brokerName:'CI',cashBalance:'0'}})));
 const securities=await Promise.all(['989331','989332','989333'].map(symbol=>prisma.security.create({data:{symbol,name:'NEWS33 '+symbol,marketType:'OTHER'}})));
 const [a,b]=accounts,[s1,s2,s3]=securities;
 const now=new Date(),publishedAt=new Date(now.getTime()-1000),rows:NewsCandidate[]=Array.from({length:8},(_,i)=>({provider:'TEST_NEWS33',providerId:'collected-'+i,title:'검증 회사 실적 전망 '+i,originalUrl:'https://www.hankyung.com/article/testnews33'+i,sourceName:'검증 공개 메타데이터',publishedAt,publishedPrecision:'TIME',materialType:i%2?'REPORT':'ARTICLE',priority:i<2?2:1,accessCondition:'UNKNOWN',summary:null,summaryMethod:'NONE',securityIds:[s1.id]}));
 const nextDaily=(days:number)=>new Date(kstStart(seoulDay(new Date(now.getTime()+days*86400000))).getTime()+6*3600000);
 let calls=0;
 const source={id:'TEST_NEWS33',collect:async(targets:any[])=>{calls++;assert.equal(new Set(targets.map(t=>String(t.id))).size,targets.length);for(const s of securities)assert.ok(targets.some(t=>t.id===s.id));return {provider:'TEST_NEWS33',candidates:[...rows,{...rows[0]!,originalUrl:rows[0]!.originalUrl+'?utm_source=transfer'}],warnings:[],requests:1};}};
 const get=async(path:string,status=200)=>{const response=await app.inject('/api/'+path);assert.equal(response.statusCode,status,response.body);return response.json();};
 try{
  await prisma.accountWatchlistItem.createMany({data:[{accountId:a.id,securityId:s1.id,listType:'WATCHLIST'},{accountId:b.id,securityId:s1.id,listType:'WATCHLIST'},{accountId:b.id,securityId:s2.id,listType:'WATCHLIST'},{accountId:a.id,securityId:s3.id,listType:'WATCHLIST'}]});
  const buy=await prisma.buyTrade.create({data:{accountId:a.id,securityId:s1.id,boughtAt:new Date(now.getTime()-86400000),quantity:'1',unitPrice:'100'}});await prisma.sellTrade.create({data:{buyTradeId:buy.id,soldAt:now,quantity:'1',unitPrice:'110'}});
  const before=await get(`accounts/${a.id}/stock-news`);assert.equal(before.meta.total,0);assert.equal(before.meta.collection.status,'NOT_COLLECTED');
  const results=await Promise.all([collectStockNews(prisma,{now,enrich:false,sources:[source,{id:'TEST_NEWS33_FAIL',collect:async()=>{throw Error('source unavailable');}}]}),collectStockNews(prisma,{now,enrich:false,sources:[source,{id:'TEST_NEWS33_FAIL',collect:async()=>{throw Error('source unavailable');}}]})]);
  assert.equal(calls,1);const done=results.find(r=>'saved' in r)!;assert.equal(done.saved,5);assert.equal(done.status,'PARTIAL');assert.ok((done as any).duplicates>=1);
  await collectStockNews(prisma,{now,enrich:false,sources:[source]});assert.equal(calls,1);
  const interrupted=await prisma.collectorRun.create({data:{jobType:'stock-news',provider:'TEST_NEWS33',status:'RUNNING'}});await prisma.stockNewsState.update({where:{id:'stock-news'},data:{lastStatus:'RUNNING'}});await collectStockNews(prisma,{now,enrich:false,sources:[source]});assert.equal((await prisma.collectorRun.findUniqueOrThrow({where:{id:interrupted.id}})).status,'FAILED');assert.equal(calls,1);
  const saved=await prisma.stockNewsItem.findMany({where:{provider:'TEST_NEWS33'}});assert.equal(saved.length,5);assert.equal(new Set(saved.map(r=>r.canonicalHash)).size,5);
  const state=await prisma.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}});assert.ok(state.initialCompletedAt);assert.equal(state.initialDate,new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now));
  // A common item gains a verified newly relevant security without being stored twice.
  const added=await collectStockNews(prisma,{now:nextDaily(1),enrich:false,sources:[{id:'TEST_NEWS33',collect:async()=>({provider:'TEST_NEWS33',candidates:[{...rows[0]!,securityIds:[s1.id,s3.id]}],warnings:[],requests:1})}]});assert.equal(added.saved,3);assert.ok(await prisma.stockNewsSecurity.findUnique({where:{newsId_securityId:{newsId:saved.find(r=>r.providerId==='collected-0')!.id,securityId:s3.id}}}));
  // More than two pages with deterministic tied publication times; B-only news cannot leak to A.
  for(let i=0;i<26;i++){const c={...rows[0]!,providerId:'page-'+i,originalUrl:'https://www.hankyung.com/article/news33page'+i,title:'페이지 검증 실적 '+i,materialType:(i%3===0?'REPORT':i%3===1?'ARTICLE':'DISCLOSURE') as NewsCandidate['materialType'],priority:i<13?2:1,securityIds:[i===25?s2.id:s1.id]};await prisma.stockNewsItem.create({data:{provider:c.provider,providerId:c.providerId,...candidateKeys(c),title:c.title,originalUrl:c.originalUrl,sourceName:c.sourceName,publishedAt,publishedPrecision:'TIME',materialType:c.materialType,priority:c.priority,accessCondition:'UNKNOWN',collectedAt:now,securities:{create:c.securityIds.map(securityId=>({securityId}))}}});}
  const first=await get(`accounts/${a.id}/stock-news`);assert.equal(first.data.length,10);assert.equal(first.meta.total,33);assert.equal(first.meta.collection.status,'SUCCESS');
  const newest={...rows[0]!,providerId:'late',originalUrl:'https://www.hankyung.com/article/news33late',title:'늦게 추가한 실적 변경'};await prisma.stockNewsItem.create({data:{provider:newest.provider,providerId:newest.providerId,...candidateKeys(newest),title:newest.title,originalUrl:newest.originalUrl,sourceName:newest.sourceName,publishedAt,materialType:'ARTICLE',priority:2,accessCondition:'UNKNOWN',collectedAt:now,securities:{create:{securityId:s1.id}}}});
  let page=first;const all=[...page.data];while(page.meta.nextCursor){page=await get(`accounts/${a.id}/stock-news?${new URLSearchParams({snapshot:first.meta.snapshot,cursor:page.meta.nextCursor})}`);assert.ok(page.data.length<=10);all.push(...page.data);}
  assert.equal(all.length,33);assert.equal(new Set(all.map(r=>r.id)).size,33);assert.ok(all.every(r=>r.title!=='늦게 추가한 실적 변경'));
  const detail=await get(`accounts/${a.id}/stock-news/${first.data[0].id}?snapshot=${first.meta.snapshot}`);assert.equal(detail.meta.ordinal,1);assert.equal(detail.meta.total,33);assert.equal(detail.meta.previousId,null);assert.equal(detail.meta.nextId,first.data[1].id);
  const foreign=await prisma.stockNewsItem.findFirstOrThrow({where:{securities:{some:{securityId:s2.id}}}});await get(`accounts/${a.id}/stock-news/${foreign.id}`,404);await get(`accounts/${b.id}/stock-news?snapshot=${first.meta.snapshot}`,400);await get(`accounts/${a.id}/stock-news?type=REPORT&snapshot=${first.meta.snapshot}`,400);
  const report=await get(`accounts/${a.id}/stock-news?type=REPORT`);assert.ok(report.data.every((r:any)=>r.type==='REPORT'));assert.equal(report.meta.total,13);
  // GETs do not invoke any external collection.
  assert.equal(calls,1);
  await prisma.accountWatchlistItem.delete({where:{accountId_securityId:{accountId:a.id,securityId:s3.id}}});await get(`accounts/${a.id}/stock-news?snapshot=${first.meta.snapshot}`,409);
  const tomorrow=nextDaily(2),failed=await collectStockNews(prisma,{now:tomorrow,enrich:false,sources:[{id:'TEST_NEWS33_FAIL',collect:async()=>{throw Error('unavailable');}}]});assert.equal(failed.status,'FAILED');assert.equal((await prisma.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}})).lastCollectedAt?.toISOString(),nextDaily(1).toISOString());assert.ok(await prisma.stockNewsItem.count()>=32);
  // Holdings are current account remaining quantities, including multiple partly sold Lots.
  const holding1=await prisma.buyTrade.create({data:{accountId:a.id,securityId:s1.id,boughtAt:now,quantity:'2',unitPrice:'100'}});
  await prisma.sellTrade.create({data:{buyTradeId:holding1.id,soldAt:now,quantity:'1.5',unitPrice:'110'}});
  const holding2=await prisma.buyTrade.create({data:{accountId:a.id,securityId:s1.id,boughtAt:now,quantity:'0.5',unitPrice:'100'}});
  const held=await get(`accounts/${a.id}/stock-news`);assert.ok(held.data.every((r:any)=>r.isHeld));
  const notHeld=await get(`accounts/${b.id}/stock-news`);assert.ok(notHeld.data.every((r:any)=>!r.isHeld));
  assert.equal((await get(`accounts/${a.id}/stock-news/${held.data[0].id}`)).data.isHeld,true);
  await prisma.sellTrade.create({data:{buyTradeId:holding2.id,soldAt:now,quantity:'0.5',unitPrice:'110'}});
  assert.ok((await get(`accounts/${a.id}/stock-news`)).data.every((r:any)=>!r.isHeld));
  // Legacy pending rows remain preserved but can never trigger summary retries.
  const queued=await prisma.stockNewsItem.findMany({where:{provider:'TEST_NEWS33'},orderBy:{id:'asc'},take:6});
  assert.ok(queued.length>=6);
  assert.equal(queued[0]!.summaryStatus,'NO_DATA');assert.equal(queued[0]!.summaryAttempts,1);assert.equal(queued[0]!.summaryNextRetryAt,null);
  await prisma.stockNewsItem.update({where:{id:queued[5]!.id},data:{summary:'기존 공개 요약은 불필요하게 덮어쓰지 않습니다.',summaryStatus:'READY'}});
  await prisma.stockNewsItem.updateMany({where:{id:{in:queued.slice(0,5).map(r=>r.id)}},data:{summaryStatus:'PENDING'}});
  const beforeSummaries=await prisma.stockNewsItem.findMany({where:{id:{in:queued.map(r=>r.id)}},orderBy:{id:'asc'}});
  let summaryCalls=0;const extract=async()=>{summaryCalls++;throw Error('must not retry');};
  for(const elapsed of [0,1000,3601000,7202000,10803000])assert.equal((await supplementNewsSummaries(prisma,{now:new Date(now.getTime()+elapsed),extract})).status,'DISABLED');
  assert.equal(summaryCalls,0);
  assert.deepEqual(await prisma.stockNewsItem.findMany({where:{id:{in:queued.map(r=>r.id)}},orderBy:{id:'asc'}}),beforeSummaries);
  console.log('STOCK_NEWS_SUMMARY_INITIAL_ONLY_DB_PROOF',JSON.stringify({accountHoldings:true,belowOneNotHeld:true,summaryCalls,legacyPendingPreserved:true,existingSummaryPreserved:true,titleOnlySuccess:true}));
  await prisma.account.update({where:{id:a.id},data:{isActive:false}});await get(`accounts/${a.id}/stock-news`,404);
  console.log('STOCK_NEWS_DB_PROOF',JSON.stringify({sharedSourceCalls:calls,firstSaved:5,firstPage:10,snapshotTotal:33,unique:33,reportTotal:13,accountsIsolated:true,failedCollectionRetained:true,initialOnce:true,restartRecovery:true}));
 }finally{
  await prisma.stockNewsSecurity.deleteMany({where:{securityId:{in:securities.map(s=>s.id)}}});await prisma.stockNewsItem.deleteMany({where:{provider:'TEST_NEWS33'}});await prisma.stockNewsProviderState.deleteMany({where:{provider:{startsWith:'TEST_NEWS33'}}});await prisma.stockNewsCandidate.deleteMany();await prisma.stockNewsSlot.deleteMany();await prisma.stockNewsSchedule.deleteMany();await prisma.stockNewsState.deleteMany();await prisma.stockNewsSeen.deleteMany();await prisma.collectorRun.deleteMany({where:{jobType:{in:['stock-news','stock-news-summary']}}});await prisma.collectorLock.deleteMany({where:{jobName:'stock-news'}});
  const ids=accounts.map(a=>a.id);await prisma.sellTrade.deleteMany({where:{buyTrade:{accountId:{in:ids}}}});await prisma.buyTrade.deleteMany({where:{accountId:{in:ids}}});await prisma.accountWatchlistItem.deleteMany({where:{accountId:{in:ids}}});await prisma.account.deleteMany({where:{id:{in:ids}}});await prisma.security.deleteMany({where:{id:{in:securities.map(s=>s.id)}}});await app.close();await prisma.$disconnect();
 }
});
