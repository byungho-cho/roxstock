import test from 'node:test';
import assert from 'node:assert/strict';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {collectStockNews} from '../../collector/src/news-collector.js';
import {buildApp} from '../src/app.js';
import type {NewsCandidate} from '@roxstock/shared/news/policy';
import {kstStart,seoulDay} from '@roxstock/shared/news/policy';
test('phase35 DB: per-slot retry isolation, daily cap, deferred and legacy reconsideration, coalescing, settings and supplement once',async()=>{
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
  const late=new Date(now.getTime()+10*3600000);await collectStockNews(db,{now:late,sources,enrich:false});const calls=good;await collectStockNews(db,{now:late,sources,enrich:false});assert.equal(good,calls);assert.equal(await db.stockNewsItem.count(),10);
  const supplement=await collectStockNews(db,{now:late,sources,enrich:false,manualDate:seoulDay(late)});assert.equal(supplement.saved,0);assert.equal(supplement.kind,'SUPPLEMENT');const manualCalls=good;await collectStockNews(db,{now:late,sources,enrich:false,manualDate:seoulDay(late)});assert.equal(good,manualCalls);
  assert.equal(await db.stockNewsSlot.count({where:{kind:'SUPPLEMENT'}}),1);
  const settings=await app.inject('/api/stock-news/settings');assert.equal(settings.statusCode,200);assert.equal(settings.json().data.intervalHours,3);
  for(const body of [{intervalHours:0,startTime:'06:00'},{intervalHours:5.5,startTime:'06:00'},{intervalHours:3,startTime:'24:00'}])assert.equal((await app.inject({method:'PUT',url:'/api/stock-news/settings',payload:body})).statusCode,400);
  const beforeRuns=await db.collectorRun.count({where:{jobType:'stock-news'}}),saved=await app.inject({method:'PUT',url:'/api/stock-news/settings',payload:{intervalHours:5,startTime:'06:17'}});assert.equal(saved.statusCode,200);assert.equal(saved.json().data.intervalHours,5);assert.equal(saved.json().data.startTime,'06:17');assert.ok(saved.json().data.nextAt);assert.equal(await db.collectorRun.count({where:{jobType:'stock-news'}}),beforeRuns);
  const latest=await db.stockNewsState.findUniqueOrThrow({where:{id:'stock-news'}});assert.ok(latest.lastAttemptAt);assert.ok(latest.lastFinishedAt);assert.ok(latest.lastFullSuccessAt);assert.ok(latest.lastNewStoredAt);
  console.log('NEWS35_DB_PROOF',JSON.stringify({dailyStored:10,deferredReconsidered:5,legacyReconsidered:true,goodProviderSkippedOnRetry:true,sameSlotOnce:true,missedSlotsCoalesced:true,supplementOnce:true,settingsValidated:true,settingsNoCollection:true}));
 }finally{
  await db.stockNewsSecurity.deleteMany({where:{securityId:security.id}});await db.stockNewsItem.deleteMany({where:{provider:{startsWith:'TEST_NEWS35'}}});await db.stockNewsCandidate.deleteMany();await db.stockNewsSlot.deleteMany();await db.stockNewsSchedule.deleteMany();await db.stockNewsState.deleteMany();await db.stockNewsSeen.deleteMany();await db.stockNewsProviderState.deleteMany({where:{provider:{startsWith:'TEST_NEWS35'}}});await db.collectorRun.deleteMany({where:{jobType:'stock-news'}});await db.collectorLock.deleteMany({where:{jobName:'stock-news'}});await db.accountWatchlistItem.deleteMany({where:{accountId:account.id}});await db.account.delete({where:{id:account.id}});await db.security.delete({where:{id:security.id}});await app.close();await db.$disconnect();
 }
});
