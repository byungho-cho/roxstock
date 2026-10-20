import test from 'node:test';
import assert from 'node:assert/strict';
import {dartProgress,dartDisplayStatus,dartIncludedTasks,dartPeriodEnd,missingDartReport,thebornPreListingTask} from './dart-task-status.js';
const now=new Date('2026-10-21T07:19:00+09:00');
const missing=(year:number,period:'ANNUAL'|'Q1'|'Q2'|'Q3',closingMonth:number|null,date=now)=>missingDartReport({now:date,year,period,closingMonth,monthEvidence:'validated annual disclosure periods'});
test('70 audited not-due cases: 34 December closings and March-closing 3S',()=>{
 let count=0;
 for(let i=0;i<34;i++)for(const period of ['Q3','ANNUAL'] as const){const result=missing(2026,period,12);assert.equal(result.status,'NOT_DUE');assert.ok(result.nextAttemptAt!>now);count++;}
 for(const period of ['Q2','Q3'] as const){assert.equal(missing(2026,period,3).status,'NOT_DUE');count++;}
 assert.equal(count,70);assert.equal(missing(2026,'Q2',3).diagnostics.periodEnd,'2026-09-30');assert.equal(missing(2026,'Q3',3).diagnostics.periodEnd,'2026-12-31');
});
test('calendar report year follows each closing month, including year boundaries',()=>{
 assert.equal(dartPeriodEnd(2026,'ANNUAL',3),'2026-03-31');assert.equal(dartPeriodEnd(2026,'Q1',3),'2026-06-30');
 assert.equal(dartPeriodEnd(2027,'Q1',12),'2027-03-31');assert.equal(dartPeriodEnd(2026,'Q3',6),'2026-03-31');
 assert.throws(()=>dartPeriodEnd(2026,'Q1',0));assert.equal(missing(2026,'Q3',null).status,'FAILED');
});
test('minimum submission periods do not invent extension/holiday deadlines; uncertain reports recheck',()=>{
 const result=missing(2026,'Q3',12,new Date('2026-11-16T12:00:00+09:00'));
 assert.equal(result.status,'FAILED');assert.equal(result.errorCode,'REVIEW_REQUIRED');assert.ok(result.nextAttemptAt);
 const confirmed=missingDartReport({now:new Date('2026-11-20T12:00:00+09:00'),year:2026,period:'Q3',closingMonth:12,monthEvidence:'verified',verifiedDeadline:{date:'2026-11-19',source:'company-specific verified extension'}});
 assert.equal(confirmed.status,'NO_FILING');assert.equal(confirmed.errorCode,'NO_FILING_CONFIRMED');
});
test('exclusions disappear from numerator, denominator and buckets; unverified rows/mappings stay incomplete',()=>{
 const row=(status:string,errorCode:string|null,n:number)=>({status,errorCode,_count:{_all:n}});
 const stats=dartProgress([row('SUCCESS',null,990),row('NOT_DUE','FILING_NOT_DUE',70),row('EXCLUDED','PRE_LISTING_POLICY_EXCLUDED',24),row('NOT_APPLICABLE','DART_CORP_CODE_NOT_MAPPED',13),row('NO_FILING','ROWS_NOT_PUBLISHED',57),row('FAILED','REVIEW_REQUIRED',1)]);
 assert.equal(stats.planned,1131);assert.equal(stats.currentTarget,1061);assert.equal(stats.completed,990);assert.equal(stats.reviewRequired,71);assert.equal(stats.byStatus.EXCLUDED,undefined);assert.equal(stats.complete,false);
 assert.equal(dartDisplayStatus('NOT_APPLICABLE','NOT_DART_LISTED_EQUITY'),'REVIEW_REQUIRED');
 assert.ok(dartIncludedTasks.NOT);
});
test('zero targets and all-not-due have no fabricated 100% rate',()=>{
 const empty=dartProgress([{status:'EXCLUDED',errorCode:null,_count:{_all:24}}]);assert.equal(empty.empty,true);assert.equal(empty.completionRate,null);assert.equal(empty.complete,false);
 const future=dartProgress([{status:'NOT_DUE',errorCode:null,_count:{_all:70}}]);assert.equal(future.allNotDue,true);assert.equal(future.completionRate,null);
 const done=dartProgress([{status:'SUCCESS',errorCode:null,_count:{_all:1}},{status:'NO_FILING',errorCode:'NO_FILING_CONFIRMED',_count:{_all:1}}]);assert.equal(done.completionRate,100);assert.equal(done.collectionSuccessRate,50);
});
test('Theborn policy is confined to the audited 24 periods and never the 2024 annual report',()=>{
 let n=0;for(let y=2015;y<=2026;y++)for(const p of ['ANNUAL','Q1','Q2','Q3'] as const)if(thebornPreListingTask('475560',y,p))n++;
 assert.equal(n,24);assert.equal(thebornPreListingTask('475560',2024,'ANNUAL'),false);assert.equal(thebornPreListingTask('005930',2023,'ANNUAL'),false);
});
