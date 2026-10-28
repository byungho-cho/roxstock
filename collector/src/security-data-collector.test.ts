import test from 'node:test';import assert from 'node:assert/strict';
import {optionalNaverAnnual,discoveryWindowEnd,nextDiscoveryWindow,latestPeriodicReport,receiptWithinCoverage} from './security-data-collector.js';
import type {DartReport} from './dart-provider.js';
test('announcement-year discovery includes prior-year annual filings, respects ninety-day query bounds and overlaps only after catch-up',()=>{
 assert.equal(discoveryWindowEnd('20260101','20261027'),'20260331');
 let from='20260101',through=discoveryWindowEnd(from,'20261027'),loops=0;
 while(through<'20261027'){const next=nextDiscoveryWindow(through,'20261027');assert.equal(next.caughtUp,false);assert.ok(next.fromDate>through);from=next.fromDate;through=next.throughDate;assert.ok(++loops<5);}
 assert.equal(nextDiscoveryWindow(through,'20261027').fromDate,'20261025');assert.equal(nextDiscoveryWindow(through,'20261027').caughtUp,true);
 assert.equal(discoveryWindowEnd('20240101','20241027'),'20240330');
});
test('current-only discovery clamps overlap to its persistent start and filters by announcement date, not fiscal year',()=>{
 assert.equal(nextDiscoveryWindow('20261028','20261028','20261028').fromDate,'20261028');
 assert.equal(nextDiscoveryWindow('20261029','20261029','20261028').fromDate,'20261028');
 assert.equal(nextDiscoveryWindow('20270101','20270101','20261028').fromDate,'20261230');
 assert.equal(receiptWithinCoverage('20261027','20261028','20261028'),false);
 assert.equal(receiptWithinCoverage('20261028','20261028','20261028'),true);
 assert.equal(receiptWithinCoverage('20261029','20261028','20261028'),false);
 assert.equal(receiptWithinCoverage(undefined,'20261028','20261028'),false);
});
test('bootstrap selects the latest annual separately from interim reports, rather than collecting every missing quarter',()=>{
 const report=(receiptNo:string,periodType:string,end:string)=>({receiptNo,periodType,selection:{periodEndDate:end},withdrawn:false}) as DartReport;
 const annual=report('1','ANNUAL','2025-12-31'),q1=report('2','Q1','2026-03-31'),q2=report('3','Q2','2026-06-30');
 assert.equal(latestPeriodicReport(annual,[annual,q1,q2]),annual);assert.equal(latestPeriodicReport(q1,[annual,q1,q2]),q2);assert.equal(latestPeriodicReport(q1,[annual,q1,{...q2,withdrawn:true}]),q1);
});


test('optional NAVER table absence is recorded without throwing; real failures remain failures',async()=>{
 const {NaverAnnualError}=await import('./naver-annual.js');
 const provider=(code:string)=>({annual:async()=>{throw new NaverAnnualError(code);}}) as any;
 const errors:Record<string,string>={};assert.deepEqual(await optionalNaverAnnual(provider('NAVER_ANNUAL_TABLE_MISSING'),'900120',6,errors),[]);assert.equal(errors.NAVER_ANNUAL,'NAVER_ANNUAL_TABLE_MISSING');
 for(const code of ['NAVER_COMMUNICATION','NAVER_AUTH','NAVER_ANNUAL_BASIS_MISSING'])await assert.rejects(optionalNaverAnnual(provider(code),'900120',6,{}),{code});
});
