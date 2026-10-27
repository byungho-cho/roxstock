import test from 'node:test';import assert from 'node:assert/strict';
import {discoveryWindowEnd,nextDiscoveryWindow,latestPeriodicReport} from './security-data-collector.js';
import type {DartReport} from './dart-provider.js';
test('announcement-year discovery includes prior-year annual filings, respects ninety-day query bounds and overlaps only after catch-up',()=>{
 assert.equal(discoveryWindowEnd('20260101','20261027'),'20260331');
 let from='20260101',through=discoveryWindowEnd(from,'20261027'),loops=0;
 while(through<'20261027'){const next=nextDiscoveryWindow(through,'20261027');assert.equal(next.caughtUp,false);assert.ok(next.fromDate>through);from=next.fromDate;through=next.throughDate;assert.ok(++loops<5);}
 assert.equal(nextDiscoveryWindow(through,'20261027').fromDate,'20261025');assert.equal(nextDiscoveryWindow(through,'20261027').caughtUp,true);
 assert.equal(discoveryWindowEnd('20240101','20241027'),'20240330');
});
test('bootstrap selects the latest annual separately from interim reports, rather than collecting every missing quarter',()=>{
 const report=(receiptNo:string,periodType:string,end:string)=>({receiptNo,periodType,selection:{periodEndDate:end},withdrawn:false}) as DartReport;
 const annual=report('1','ANNUAL','2025-12-31'),q1=report('2','Q1','2026-03-31'),q2=report('3','Q2','2026-06-30');
 assert.equal(latestPeriodicReport(annual,[annual,q1,q2]),annual);assert.equal(latestPeriodicReport(q1,[annual,q1,q2]),q2);assert.equal(latestPeriodicReport(q1,[annual,q1,{...q2,withdrawn:true}]),q1);
});
