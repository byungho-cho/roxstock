import test from 'node:test';import assert from 'node:assert/strict';
import {periodBugEvents,safeBugCode,saveBugEvent,reconcileBugReportsPage} from './collection-bug-reports.js';
const row={securityId:1n,fiscalYear:2021,periodType:'ANNUAL',status:'PARTIAL',values:{eps:'-10',bps:'10',per:'-5',pbr:'2',roe:'-1'},reasons:{},supplemental:{collectionAttempt:{at:new Date().toISOString(),source:'TEST'}},attempts:1,updatedAt:new Date()};
test('negative ratios and known non-applicable ratios do not create bug reports',()=>{assert.deepEqual(periodBugEvents(row),[]);assert.deepEqual(periodBugEvents({...row,values:{...row.values,eps:'0',per:null}}),[]);assert.deepEqual(periodBugEvents({...row,values:{...row.values,per:null}}),[]);});
test('missing historical basis is grouped by metric/code without raw provider content',()=>{const events=periodBugEvents({...row,values:{...row.values,per:'-5',pbr:null},reasons:{pbr:'보통주 기준 일치 미확인'}});assert.equal(events.length,1);assert.equal(events[0]!.code,'PERIOD_PRICE_BASIS_UNCONFIRMED');assert.equal(events[0]!.metric,'pbr');assert.equal(safeBugCode('https://secret.invalid?api_key=private'),'COLLECTION_FAILED');assert.equal(safeBugCode('Bearer private-token'),'COLLECTION_FAILED');assert.equal(safeBugCode('KIS_PRICE_RATE_LIMIT'),'KIS_PRICE_RATE_LIMIT');});
import {collectionFailureDetails} from './collection-bug-reports.js';
test('source validation review is warning and groups by the original diagnostic reason',()=>{
 const a=collectionFailureDetails({diagnostics:{originalCode:'DART_SOURCE_REVIEW',validationResult:'CLOSING_MONTH_CHANGED'},message:'REVIEW_REQUIRED: hidden raw'});
 const b=collectionFailureDetails({diagnostics:{originalCode:'DART_SOURCE_REVIEW',validationResult:'MULTIPLE_ANNUAL_PERIODS'},message:null});
 assert.equal(a.severity,'WARNING');assert.equal(b.severity,'WARNING');assert.notEqual(a.code,b.code);
 assert.equal(collectionFailureDetails({diagnostics:{originalCode:'DATABASE_ERROR'},message:'DATABASE_ERROR: private'}).severity,'ERROR');
 assert.deepEqual(collectionFailureDetails({diagnostics:null,message:'NO_FUNDAMENTAL_DATA'}),{code:'KIS_FUNDAMENTAL_NO_DATA',severity:'WARNING',summary:'추가 재무지표 원천 미제공 · 자료 확인 대기'});
 assert.equal(collectionFailureDetails({diagnostics:null,message:'재무제표 실패 · MANUAL_COLLECTION_ERROR'}).code,'MANUAL_COLLECTION_ERROR');
 assert.doesNotMatch(JSON.stringify(collectionFailureDetails({diagnostics:{},message:'https://secret.invalid?token=private'})),/secret.invalid|token=private/);
});
test('a bare legacy review marker remains unresolved review; explicit storage failures take precedence',()=>{
 assert.equal(collectionFailureDetails({message:'REVIEW_REQUIRED',diagnostics:null}).code,'SOURCE_REVIEW_REQUIRED');
 assert.equal(collectionFailureDetails({message:'REVIEW_REQUIRED',diagnostics:null}).severity,'WARNING');
 assert.equal(collectionFailureDetails({message:'REVIEW_REQUIRED',diagnostics:{originalCode:'DATABASE_ERROR'}}).severity,'ERROR');
 assert.equal(collectionFailureDetails({message:'HTTP_ERROR: REVIEW_REQUIRED',diagnostics:null}).severity,'ERROR');
});
test('all financial metric codes reconcile only against a newer stored value or a verified normal nonpositive denominator',async()=>{
 for(const [metric,values,code,expected]of [
  ['per',{eps:'10',per:'2'},'KRX_ROLLOUT_NOT_VALIDATED','METRIC_FILLED'],
  ['pbr',{bps:'20',pbr:'1'},'HISTORICAL_PRICE_COMMUNICATION','METRIC_FILLED'],
  ['per',{eps:'-2',per:null},'PERIOD_PER_MISSING','NON_POSITIVE_DENOMINATOR_NOT_APPLICABLE'],
  ['pbr',{bps:'0',pbr:null},'PERIOD_PBR_MISSING','ZERO_DENOMINATOR_NOT_APPLICABLE'],
  ['per',{eps:'2',per:null},'PERIOD_PER_MISSING',undefined],
 ] as const){
  let resolution:string|undefined,query:any;const current={updatedAt:new Date('2026-10-27'),values,supplemental:{collectionAttempt:{at:'2026-10-27'}},provenance:{},status:'PARTIAL'};
  const event={eventKey:'a'.repeat(64),reportId:1n,securityId:1n,fiscalYear:2025,periodType:'ANNUAL',observedAt:new Date('2026-10-26'),metric,report:{code}};
  const security={symbol:'005930',codeRevision:0};let db:any;db={security:{findUnique:async()=>security},collectionBugOccurrence:{findMany:async(q:any)=>{query=q;return [event];},count:async()=>0,updateMany:async(q:any)=>{resolution=q.data.resolution;return {count:1};}},periodValuation:{findUnique:async()=>current},collectionBugReport:{updateMany:async()=>({count:1})},$queryRaw:async()=>[],$transaction:async(fn:any)=>fn(db)};
  await reconcileBugReportsPage(db);assert.equal(resolution,expected);assert.ok(query.where.OR.some((q:any)=>q.report?.feature==='dart-financial-statements'&&q.metric.in.includes(metric)));
  resolution=undefined;current.updatedAt=new Date('2026-10-25');await reconcileBugReportsPage(db);assert.equal(resolution,undefined);
  current.updatedAt=new Date('2026-10-27');security.codeRevision=1;await reconcileBugReportsPage(db);assert.equal(resolution,undefined);
 }
});
test('fiscal-duration review is one explicit warning rather than five missing-metric errors',()=>{
 const events=periodBugEvents({...row,provenance:{calculationState:'FISCAL_DURATION_REVIEW_REQUIRED'},values:{eps:null,bps:null,per:null,pbr:null,roe:null}});assert.equal(events.length,1);assert.equal(events[0]!.code,'DART_REVIEW_FISCAL_DURATION_UNVERIFIED');assert.equal(events[0]!.severity,'WARNING');
});
test('unattempted shares/price work is pending, not a bug; dependent ratios do not repeat upstream gaps',()=>{
 const missing={...row,values:{eps:null,bps:null,per:null,pbr:null,roe:null}};
 assert.deepEqual(periodBugEvents({...missing,supplemental:{}}),[]);
 assert.deepEqual(periodBugEvents({...missing,supplemental:{},provenance:{calculationState:'FISCAL_DURATION_REVIEW_REQUIRED'}}),[]);
 assert.deepEqual(periodBugEvents({...missing,supplemental:{kisAnnual:{}}}).map(e=>e.metric),['eps']);
 assert.deepEqual(periodBugEvents(missing).map(e=>e.metric),['eps','bps','roe']);
});

test('financial task periods reject ambiguous or malformed item labels',async()=>{
 const {financialItemPeriod}=await import('./collection-bug-reports.js');
 assert.deepEqual(financialItemPeriod('005930:2020:ANNUAL'),{symbol:'005930',fiscalYear:2020,periodType:'ANNUAL'});
 for(const [code,periodType]of [['11011','ANNUAL'],['11013','Q1'],['11012','Q2'],['11014','Q3']])assert.deepEqual(financialItemPeriod('005930:2020:'+code),{symbol:'005930',fiscalYear:2020,periodType});
 for(const label of ['005930','005930:2020:11016','005930:2014:Q1','005930:2020:Q4','005930:2020:ANNUAL:private'])assert.equal(financialItemPeriod(label),undefined);
});


test('news collection diagnostics do not write bug reports while other collectors remain reportable',async()=>{
 const db={collectionBugReportingWindow:{findUnique:async()=>null},$transaction:async()=>{throw new Error('TRANSACTION_SENTINEL');}} as unknown as Parameters<typeof saveBugEvent>[0];
 const base={sourceKey:'news-policy-test',code:'COLLECTION_FAILED',severity:'ERROR' as const,summary:'fixture',observedAt:new Date()};
 for(const feature of ['stock-news','stock-news-summary'])assert.equal(await saveBugEvent(db,{...base,feature}),false);
 await assert.rejects(saveBugEvent(db,{...base,feature:'market-prices'}),/TRANSACTION_SENTINEL/);
});
