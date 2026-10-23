import test from 'node:test';import assert from 'node:assert/strict';
import {periodBugEvents,safeBugCode,saveBugEvent} from './collection-bug-reports.js';
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
 for(const label of ['005930','005930:2020:11011','005930:2014:Q1','005930:2020:Q4','005930:2020:ANNUAL:private'])assert.equal(financialItemPeriod(label),undefined);
});


test('news collection diagnostics do not write bug reports while other collectors remain reportable',async()=>{
 const db={$transaction:async()=>{throw new Error('TRANSACTION_SENTINEL');}} as unknown as Parameters<typeof saveBugEvent>[0];
 const base={sourceKey:'news-policy-test',code:'COLLECTION_FAILED',severity:'ERROR' as const,summary:'fixture',observedAt:new Date()};
 for(const feature of ['stock-news','stock-news-summary'])assert.equal(await saveBugEvent(db,{...base,feature}),false);
 await assert.rejects(saveBugEvent(db,{...base,feature:'market-prices'}),/TRANSACTION_SENTINEL/);
});
