import test from 'node:test';
import assert from 'node:assert/strict';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {collectStockNews} from '../../collector/src/news-collector.js';
import {reconcileReportIdentities} from '../../collector/src/news-report-identity.js';
import {PrismaCollectorRepository} from '../../collector/src/repository.js';
import {buildApp} from '../src/auth/route-test-app.js';
import type {NewsCandidate} from '@roxstock/shared/news/policy';
import {kstStart,seoulDay} from '@roxstock/shared/news/policy';
test('phase35 DB: per-slot retry isolation, per-run report cap without daily cap, deferred and legacy reconsideration, coalescing, settings and supplement once',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);
 const app=buildApp(),now=new Date(kstStart(seoulDay(new Date())).getTime()+6*3600000),account=await db.account.create({data:{name:'NEWS35',brokerName:'CI',cashBalance:'0'}}),security=await db.security.create({data:{symbol:'989351',name:'검증회사',marketType:'OTHER'}});
 let good=0,bad=0,fail=true;
 const candidate=(i:number,priority=1):NewsCandidate=>({provider:'TEST_NEWS35_GOOD',providerId:String(i),title:'검증회사 실적 전망 '+i,originalUrl:'https://www.hankyung.com/article/test35'+i,sourceName:'CI',publishedAt:new Date(now.getTime()-1000),publishedPrecision:'TIME',materialType:'REPORT',priority,accessCondition:'UNKNOWN',summary:null,summaryMethod:'NONE',securityIds:[security.id]});
 const sources=[{id:'TEST_NEWS35_GOOD',collect:async()=>{good++;return {provider:'TEST_NEWS35_GOOD',candidates:Array.from({length:15},(_,i)=>candidate(i)),warnings:[],requests:1};}},{id:'TEST_NEWS35_BAD',collect:async()=>{bad++;if(fail)throw Error('temporary');return {provider:'TEST_NEWS35_BAD',candidates:[],warnings:[],requests:1};}}];
 try{
  await db.accountWatchlistItem.create({data:{accountId:account.id,securityId:security.id,listType:'WATCHLIST'}});
  const legacy=(await import('@roxstock/shared/news/policy')).candidateKeys(candidate(13));await db.stockNewsSeen.create({data:{key:legacy.canonicalHash,firstSeenAt:now}});
  const results=await Promise.all([collectStockNews(db,{now,sources,enrich:false}),collectStockNews(db,{now,sources,enrich:false})]);
  const first=results.find(r=>'saved' in r)!;assert.equal(first.saved,5);assert.equal(first.status,'PARTIAL');assert.equal(good,1);assert.equal(bad,1);
  assert.equal(await db.stockNewsCandidate.count({where:{status:'DEFERRED'}}),10);
  assert.equal((await db.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}})).lastFullSuccessAt,null);
  fail=false;const retryAt=new Date(now.getTime()+16*60000),retried=await collectStockNews(db,{now:retryAt,sources,enrich:false});
  assert.equal(good,1);assert.equal(bad,2);assert.equal(retried.status,'SUCCESS');assert.equal(retried.saved,5);assert.equal(await db.stockNewsItem.count(),10);
  assert.ok(await db.stockNewsItem.findUnique({where:{canonicalHash:legacy.canonicalHash}}));
  assert.equal((await db.stockNewsSeen.findUniqueOrThrow({where:{key:legacy.canonicalHash}})).status,'STORED');
  const late=new Date(now.getTime()+10*3600000);await collectStockNews(db,{now:late,sources,enrich:false});const calls=good;await collectStockNews(db,{now:late,sources,enrich:false});assert.equal(good,calls);assert.equal(await db.stockNewsItem.count(),15);
  const supplement=await collectStockNews(db,{now:late,sources,enrich:false,manualDate:seoulDay(late)});assert.equal(supplement.saved,0);assert.equal(supplement.kind,'SUPPLEMENT');const manualCalls=good;await collectStockNews(db,{now:late,sources,enrich:false,manualDate:seoulDay(late)});assert.equal(good,manualCalls);
  assert.equal(await db.stockNewsSlot.count({where:{kind:'SUPPLEMENT'}}),1);
  const settings=await app.inject('/api/stock-news/settings');assert.equal(settings.statusCode,200);assert.equal(settings.json().data.intervalHours,3);
  for(const body of [{intervalHours:0,startTime:'06:00'},{intervalHours:5.5,startTime:'06:00'},{intervalHours:3,startTime:'24:00'}])assert.equal((await app.inject({method:'PUT',url:'/api/stock-news/settings',payload:body})).statusCode,400);
  const beforeRuns=await db.collectorRun.count({where:{jobType:'stock-news'}}),saved=await app.inject({method:'PUT',url:'/api/stock-news/settings',payload:{intervalHours:5,startTime:'06:17'}});assert.equal(saved.statusCode,200);assert.equal(saved.json().data.intervalHours,5);assert.equal(saved.json().data.startTime,'06:17');assert.ok(saved.json().data.nextAt);assert.equal(await db.collectorRun.count({where:{jobType:'stock-news'}}),beforeRuns);
  // Settings changes do not interrupt the lease or replace the in-flight schedule snapshot.
  let signalStarted!:()=>void,release!:()=>void;const started=new Promise<void>(r=>signalStarted=r),gate=new Promise<void>(r=>release=r);
  const future=new Date(now.getTime()+24*3600000),running=collectStockNews(db,{now:future,enrich:false,sources:[{id:'TEST_NEWS35_HOLD',collect:async()=>{signalStarted();await gate;return {provider:'TEST_NEWS35_HOLD',candidates:[],warnings:[],requests:1};}}]});
  await started;assert.equal((await db.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}})).lastStatus,'RUNNING');
  assert.equal((await app.inject({method:'PUT',url:'/api/stock-news/settings',payload:{intervalHours:1,startTime:'23:59'}})).statusCode,200);release();assert.equal((await running).status,'SUCCESS');assert.equal((await db.stockNewsSchedule.findUniqueOrThrow({where:{id:'stock-news'}})).intervalHours,1);
  const heldRun=await db.collectorRun.findFirstOrThrow({where:{jobType:'stock-news'},orderBy:{id:'desc'}});assert.equal((heldRun.metadata as any).intervalHours,5);
  // A candidate does not hide a coverage warning, advance the continuous watermark or schedule a futile retry.
  const fullSuccess=(await db.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}})).lastFullSuccessAt;
  const gapAt=new Date(now.getTime()+48*3600000),gapSource={id:'TEST_NEWS35_RSS',collect:async()=>({provider:'TEST_NEWS35_RSS',candidates:[{...candidate(99),provider:'TEST_NEWS35_RSS',publishedAt:new Date(gapAt.getTime()-1000)}],warnings:['FEED_FINANCE_WINDOW_LIMIT'],requests:1,gaps:[{from:now.toISOString(),to:future.toISOString(),section:'finance',reason:'RSS_RETENTION_LIMIT_NO_BACKFILL_ROUTE'}]})};
  const partial=await collectStockNews(db,{now:gapAt,enrich:false,sources:[gapSource]});assert.equal(partial.status,'PARTIAL');assert.equal(partial.saved,1);const coverage=await db.stockNewsProviderState.findUniqueOrThrow({where:{provider:'TEST_NEWS35_RSS'}});assert.equal(coverage.watermark,null);assert.ok(coverage.lastCheckedAt);assert.equal(coverage.nextRetryAt,null);assert.equal((coverage.gaps as any[]).length,1);assert.equal((await db.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}})).lastFullSuccessAt?.toISOString(),fullSuccess?.toISOString());
  // A later query-at timestamp is not confirmed coverage for non-RSS providers.
  await db.stockNewsProviderState.create({data:{provider:'TEST_NEWS35_CURSOR',watermark:now,lastCheckedAt:new Date(now.getTime()+5*86400000)}});
  let requestedFrom:Date|undefined;const cursorAt=new Date(now.getTime()+6*86400000);
  await collectStockNews(db,{now:cursorAt,enrich:false,sources:[{id:'TEST_NEWS35_CURSOR',collect:async(_targets,from)=>{requestedFrom=from;return {provider:'TEST_NEWS35_CURSOR',candidates:[],warnings:[],requests:1};}}]});
  assert.equal(requestedFrom?.toISOString(),kstStart(seoulDay(now)).toISOString());
  const latest=await db.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}});assert.ok(latest.lastAttemptAt);assert.ok(latest.lastFinishedAt);assert.ok(latest.lastFullSuccessAt);assert.ok(latest.lastNewStoredAt);
  console.log('NEWS35_DB_PROOF',JSON.stringify({dailyStored:15,deferredReconsidered:5,legacyReconsidered:true,goodProviderSkippedOnRetry:true,sameSlotOnce:true,missedSlotsCoalesced:true,supplementOnce:true,settingsValidated:true,settingsNoCollection:true,inflightSettingsPreserved:true,coverageWarningWithCandidate:true,continuousCursorNotAdvanced:true,noFutileCoverageRetry:true,confirmedCursorUsed:true}));
 }finally{
  await db.stockNewsSecurity.deleteMany({where:{securityId:security.id}});await db.stockNewsItem.deleteMany({where:{provider:{startsWith:'TEST_NEWS35'}}});await db.stockNewsCandidate.deleteMany();await db.stockNewsSlot.deleteMany();await db.stockNewsSchedule.deleteMany();await db.stockNewsState.deleteMany();await db.stockNewsSeen.deleteMany();await db.stockNewsProviderState.deleteMany({where:{provider:{startsWith:'TEST_NEWS35'}}});await db.collectorRun.deleteMany({where:{jobType:'stock-news'}});await db.collectorLock.deleteMany({where:{jobName:'stock-news'}});await db.accountWatchlistItem.deleteMany({where:{accountId:account.id}});await db.account.delete({where:{id:account.id}});await db.security.delete({where:{id:security.id}});await app.close();await db.$disconnect();
 }
});

test('explicit report identity repair preserves news/summary and valid relations, isolates accounts, locks and resumes without source calls',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);
 const app=buildApp(),repo=new PrismaCollectorRepository(db),stamp=new Date(),ids:bigint[]=[],accounts:bigint[]=[];
 const {hash}=await import('@roxstock/shared/news/policy');
 const key=hash('NEWS35_REPORT_IDENTITY_FIXTURE');
 try{
  const kt=await db.security.create({data:{symbol:'989352',name:'KT',marketType:'OTHER'}}),ktg=await db.security.create({data:{symbol:'989353',name:'KT&G',marketType:'OTHER'}});ids.push(kt.id,ktg.id);
  for(const security of [kt,ktg]){const a=await db.account.create({data:{name:'NEWS35_REPORT_SCOPE',brokerName:'CI',cashBalance:'0'}});accounts.push(a.id);await db.accountWatchlistItem.create({data:{accountId:a.id,securityId:security.id,listType:'WATCHLIST'}});}
  const item=await db.stockNewsItem.create({data:{provider:'HANKYUNG_CONSENSUS',providerId:'999989353',canonicalHash:key,fingerprint:key,title:'KT&G(989353) 실적 전망',originalUrl:'https://consensus.hankyung.com/analysis/downpdf?report_idx=999989353',sourceName:'CI',publishedAt:stamp,materialType:'REPORT',priority:1,accessCondition:'UNKNOWN',summary:'기존 유효 요약 보존',summaryMethod:'PUBLIC_REPORT_ABSTRACT',collectedAt:stamp,securities:{create:ids.map(securityId=>({securityId}))}}});
  await db.stockNewsCandidate.create({data:{canonicalHash:key,fingerprint:key,provider:'HANKYUNG_CONSENSUS',providerId:'999989353',payload:{title:item.title,originalUrl:item.originalUrl,securityIds:ids.map(String)},priority:1,publishedAt:stamp,expiresAt:new Date(stamp.getTime()+72*3600000),status:'DEFERRED',reason:'SELECTION_RANK',firstSeenAt:stamp,lastCheckedAt:stamp}});
  assert.equal((await app.inject('/api/accounts/'+accounts[0]+'/stock-news')).json().meta.total,1);
  assert.equal(await repo.acquireLock('stock-news','NEWS35_OTHER_OWNER',120),true);
  assert.equal((await reconcileReportIdentities(db)).status,'LOCKED');await repo.releaseLock('stock-news','NEWS35_OTHER_OWNER');
  const fixed=await reconcileReportIdentities(db);assert.equal(fixed.status,'SUCCESS');if(fixed.status!=='SUCCESS')throw Error('expected repair');assert.equal(fixed.relationsRemoved,1);assert.equal(fixed.candidatesCorrected,1);assert.equal(fixed.sourceCalls,0);
  const stored=await db.stockNewsItem.findUniqueOrThrow({where:{id:item.id},include:{securities:true}});assert.equal(stored.summary,'기존 유효 요약 보존');assert.equal(stored.collectedAt.toISOString(),stamp.toISOString());assert.deepEqual(stored.securities.map(r=>r.securityId),[ktg.id]);
  assert.deepEqual((await db.stockNewsCandidate.findUniqueOrThrow({where:{canonicalHash:key}})).payload,{title:item.title,originalUrl:item.originalUrl,securityIds:[String(ktg.id)]});
  assert.equal((await app.inject('/api/accounts/'+accounts[0]+'/stock-news')).json().meta.total,0);assert.equal((await app.inject('/api/accounts/'+accounts[1]+'/stock-news')).json().meta.total,1);
  const again=await reconcileReportIdentities(db);assert.equal(again.status,'SUCCESS');if(again.status!=='SUCCESS')throw Error('expected repeated repair');assert.equal(again.relationsRemoved,0);assert.equal(again.candidatesCorrected,0);
  assert.equal(await db.stockNewsSlot.count(),0);assert.equal(await db.stockNewsState.count(),0);
  console.log('NEWS_REPORT_IDENTITY_DB_PROOF',JSON.stringify({wrongRelationRemoved:1,validRelationPreserved:true,summaryAndCollectionTimePreserved:true,candidateCorrected:true,accountsIsolated:true,lockRespected:true,idempotent:true,sourceCalls:0,supplementNotRepeated:true}));
 }finally{
  await repo.releaseLock('stock-news','NEWS35_OTHER_OWNER');await db.stockNewsSecurity.deleteMany({where:{securityId:{in:ids}}});await db.stockNewsItem.deleteMany({where:{canonicalHash:key}});await db.stockNewsCandidate.deleteMany({where:{canonicalHash:key}});await db.collectorRun.deleteMany({where:{jobType:'stock-news-maintenance',provider:'REPORT_IDENTITY'}});await db.accountWatchlistItem.deleteMany({where:{accountId:{in:accounts}}});await db.account.deleteMany({where:{id:{in:accounts}}});await db.security.deleteMany({where:{id:{in:ids}}});await app.close();await db.$disconnect();
 }
});
