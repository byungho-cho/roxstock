import test from 'node:test';
import assert from 'node:assert/strict';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {newsWindow,newsQueryCursor,withinNewsWindow} from '@roxstock/shared/news/schedule';
import {collectStockNews} from './news-collector.js';
import {candidateKeys,type NewsCandidate} from '@roxstock/shared/news/policy';

const now=new Date('2026-10-24T04:00:00Z'),midnight=new Date('2026-10-23T15:00:00Z'),previous=new Date('2026-10-24T01:00:00Z');
test('today-only query starts at Seoul midnight and advances without a 72-hour overlap',()=>{
 assert.equal(+newsWindow('2026-10-19',null,now),+midnight);
 assert.equal(+newsWindow('2026-10-19',new Date('2026-10-22'),now),+midnight);
 assert.equal(+newsWindow('2026-10-19',previous,now),+previous);
 assert.equal(+newsWindow('2026-10-19',new Date(+now+1000),now),+now);
 const boundary=new Date('2026-10-24T15:00:00Z');
 assert.equal(+newsWindow('2026-10-19',now,boundary),+boundary);
});
test('query start covers the prior completion gap and failed attempts do not skip unqueried time',()=>{
 assert.equal(+newsQueryCursor({lastCheckedAt:new Date(+previous+180000),lastAttemptAt:previous,watermark:null})!,+previous);
 assert.equal(+newsQueryCursor({lastCheckedAt:previous,lastAttemptAt:now,watermark:null})!,+previous);
 assert.equal(newsQueryCursor(null),null);
});
test('time precision obeys the incremental boundary, while date-only sources stay within today',()=>{
 assert.equal(withinNewsWindow({publishedAt:new Date(+previous-1),publishedPrecision:'TIME'},previous,now),false);
 assert.equal(withinNewsWindow({publishedAt:previous,publishedPrecision:'TIME'},previous,now),true);
 assert.equal(withinNewsWindow({publishedAt:midnight,publishedPrecision:'DATE'},previous,now),true);
 assert.equal(withinNewsWindow({publishedAt:new Date(+midnight-1),publishedPrecision:'DATE'},previous,now),false);
 assert.equal(withinNewsWindow({publishedAt:new Date(+now+1),publishedPrecision:'TIME'},previous,now),false);
});
function fixture(prior:any){
 let owner='',stored=0,providerData:any,runData:any,stateData:any;
 const db:any={
  $executeRaw:async(_:any,...values:any[])=>{owner=values[1];return 1;},
  $queryRaw:async()=>[{owner_token:owner,valid:1}],
  $transaction:async(fn:any)=>fn(db),
  collectorLock:{deleteMany:async()=>({count:1})},
  stockNewsState:{upsert:async()=>({id:'stock-news',initialDate:'2026-10-19',initialCompletedAt:new Date('2026-10-19'),lastFinishedAt:previous,lastStatus:'PARTIAL'}),update:async({data}:any)=>{stateData=data;return {};}},
  stockNewsSchedule:{upsert:async()=>({intervalHours:3,startTime:'00:00',anchorAt:midnight,updatedAt:midnight,revision:1})},
  stockNewsSlot:{findFirst:async()=>null,findUnique:async()=>null,updateMany:async()=>({count:0}),upsert:async()=>({}),update:async()=>({}),findMany:async()=>[]},
  collectorRun:{updateMany:async()=>({count:0}),create:async()=>({id:1n}),update:async({data}:any)=>{runData=data;return {};},findMany:async()=>[]},
  collectorRunItem:{create:async()=>({})},
  buyTrade:{findMany:async()=>[]},
  security:{findMany:async()=>[{id:1n,symbol:'005930',name:'삼성전자',securityType:'STOCK',dartCorpMapping:null}]},
  stockNewsProviderState:{findUnique:async()=>prior,updateMany:async()=>({count:0}),upsert:async({update}:any)=>{providerData=update;return {}; }},
  stockNewsItem:{findMany:async()=>[],create:async()=>{stored++;return {id:10n};}},
  stockNewsSeen:{findMany:async({where}:any)=>where.key?prior.seen??[]:[],upsert:async()=>({})},
  stockNewsCandidate:{findMany:async({where}:any)=>{assert.equal(where.status,undefined,'must not revive deferred history');return [];},upsert:async()=>({})},
 };
 return {db:db as PrismaClient,get stored(){return stored;},get provider(){return providerData;},get run(){return runData;},get state(){return stateData;}};
}
const prior=()=>({slotKey:'old',lastCheckedAt:new Date(+previous+180000),lastAttemptAt:previous,watermark:new Date('2026-10-19'),attempts:1,gaps:[{from:'2026-10-18T15:00:00Z',to:'2026-10-19T12:00:00Z',reason:'OLD_GAP'}],diagnostics:{}});
const make=(precision:'TIME'|'DATE',at:Date):NewsCandidate=>({provider:'TEST',providerId:'1',title:'삼성전자 실적 발표',originalUrl:'https://www.hankyung.com/article/202610240001',sourceName:'test',publishedAt:at,publishedPrecision:precision,materialType:'REPORT',accessCondition:'FREE',summary:'공개 요약',summaryMethod:'PUBLIC_REPORT_ABSTRACT',securityIds:[1n],priority:3});
test('successful new query ignores historical gaps and records the query upper bound',async()=>{
 const f=fixture(prior());let actualFrom:Date|undefined;
 const result=await collectStockNews(f.db,{now,enrich:false,sources:[{id:'TEST',collect:async(_,from,to)=>{actualFrom=from;assert.equal(+to,+now);return {provider:'TEST',candidates:[make('TIME',new Date(+previous-1)),make('DATE',new Date(+midnight-1))],warnings:[],requests:1};}}]});
 assert.equal(+actualFrom!,+previous);assert.equal(result.status,'SUCCESS');assert.equal(f.stored,0);
 assert.deepEqual(f.provider.gaps,[]);assert.equal(f.provider.lastError,null);assert.equal(+f.provider.lastCheckedAt,+now);
 assert.equal(f.provider.diagnostics.windowPolicyVersion,3);
 assert.equal(f.run.metadata.providerResults[0].previousCoverageGaps.length,1);
});
test('failed current query remains a failure and retains its last confirmed cursor',async()=>{
 const f=fixture(prior());const result=await collectStockNews(f.db,{now,enrich:false,sources:[{id:'TEST',collect:async()=>({provider:'TEST',candidates:[],warnings:['NEWS_SOURCE_UNAVAILABLE'],requests:1,available:false})}]});
 assert.equal(result.status,'FAILED');assert.equal(f.provider.lastCheckedAt,undefined);assert.ok(f.provider.nextRetryAt);assert.equal(f.stored,0);
});
test('today date-only metadata is saved once, but previously observed date-only rows are not backfilled',async()=>{
 const row=make('DATE',midnight),f=fixture(prior());
 const sources=[{id:'TEST',collect:async()=>({provider:'TEST',candidates:[row],warnings:[],requests:1})}];
 await collectStockNews(f.db,{now,enrich:false,sources});assert.equal(f.stored,1);
 const old={...prior(),seen:[{key:candidateKeys(row).canonicalHash,status:'DEFERRED'}]},again=fixture(old);
 await collectStockNews(again.db,{now,enrich:false,sources});assert.equal(again.stored,0);
});

test('optional consensus failure is skipped without advancing its confirmed cursor or marking a provider success',async()=>{
 const f=fixture(prior());const result=await collectStockNews(f.db,{now,enrich:false,sources:[{id:'HANKYUNG_CONSENSUS',collect:async()=>({provider:'HANKYUNG_CONSENSUS',candidates:[],warnings:['REPORT_OPTIONAL_SKIPPED:SOURCE_HTTP_403'],requests:1,available:false})}]});
 assert.equal(result.status,'SUCCESS');assert.equal(f.provider.status,'SKIPPED');assert.equal(f.provider.lastCheckedAt,undefined);assert.equal(f.provider.lastSuccessAt,undefined);assert.equal(f.provider.watermark,undefined);assert.equal(f.provider.nextRetryAt,null);assert.equal(f.run.failureCount,0);assert.equal(f.stored,0);
});
test('unexpected report source errors remain failures rather than being silently skipped',async()=>{
 const f=fixture(prior());const result=await collectStockNews(f.db,{now,enrich:false,sources:[{id:'HANKYUNG_CONSENSUS',collect:async()=>{throw Error('UNEXPECTED_INTERNAL_ERROR');}}]});
 assert.equal(result.status,'FAILED');assert.equal(f.provider.status,'FAILED');
});

test('optional skip does not hide a required provider failure or claim a full successful check',async()=>{
 const f=fixture(prior());const result=await collectStockNews(f.db,{now,enrich:false,sources:[{id:'DART',collect:async()=>({provider:'DART',candidates:[],warnings:['NEWS_SOURCE_UNAVAILABLE'],requests:1,available:false})},{id:'HANKYUNG_CONSENSUS',collect:async()=>({provider:'HANKYUNG_CONSENSUS',candidates:[],warnings:['REPORT_OPTIONAL_SKIPPED:SOURCE_HTTP_403'],requests:1,available:false})}]});
 assert.equal(result.status,'FAILED');assert.equal(f.state.lastFullSuccessAt,undefined);assert.equal(f.state.lastCollectedAt,undefined);
});
test('healthy required providers with optional report skip keep a successful run without advancing full-check time',async()=>{
 const f=fixture(prior());const result=await collectStockNews(f.db,{now,enrich:false,sources:[{id:'DART',collect:async()=>({provider:'DART',candidates:[],warnings:[],requests:1})},{id:'HANKYUNG_CONSENSUS',collect:async()=>({provider:'HANKYUNG_CONSENSUS',candidates:[],warnings:['REPORT_OPTIONAL_SKIPPED:INVALID_REPORT_LIST'],requests:1,available:false})}]});
 assert.equal(result.status,'SUCCESS');assert.equal(f.state.lastFullSuccessAt,undefined);assert.equal(+f.state.lastCollectedAt,+now);assert.equal(f.run.failureCount,0);
});
