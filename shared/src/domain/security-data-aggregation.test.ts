import test from 'node:test';import assert from 'node:assert/strict';
import {assessGroup,combineGroups,summarizeGroups,financialRequired,valueRequired,processingCounts,processingView,securityWorkKey,securityAggregationVersion,type WorkResult} from './security-data-aggregation.js';
const period='2025:ANNUAL',e={reason:'AUDITED_NOT_APPLICABLE',source:'OFFICIAL_REPORT',period,policyVersion:securityAggregationVersion};
const values=Object.fromEntries([...financialRequired,...valueRequired].map(k=>[k,'1'])),proof=Object.fromEntries(Object.keys(values).map(k=>[k,true]));
const group=(v=values,p=proof,na={},excluded:any=null)=>assessGroup(valueRequired,v,p,na,excluded,'PARTIAL');
test('core 6+5, not 26; missing evidence cannot become valid/null NA; financial and value filters share one row assessment',()=>{
 const f=assessGroup(financialRequired,values,proof,{}),v=group({...values,eps:null} as any);assert.equal(f.complete,true);assert.equal(v.complete,false);const row={groups:{financial:f,value:v,all:combineGroups(f,v)}};
 assert.equal(summarizeGroups([row],'financial').rate,100);assert.equal(summarizeGroups([row],'value').rate,0);assert.equal(summarizeGroups([row],'all').missing,1);
 assert.equal(group({...values,eps:null} as any,proof,{eps:{reason:'MISSING'}}).complete,false);
 assert.equal(group(values,{...proof,bps:false}).complete,false);assert.equal(group({...values,per:'-12'}).complete,false);
 assert.equal(group({...values,eps:'-1',bps:'-2',per:null,pbr:null} as any,proof,{per:{...e,reason:'EPS_NON_POSITIVE'},pbr:{...e,reason:'BPS_NON_POSITIVE'}}).complete,true);
});
test('unknown eligibility/disclosure and partial data stay in denominator; only scoped proof excludes; all-NA is not successful',()=>{
 const complete=group(),partial=group({...values,eps:null} as any),unknown={...partial,state:'DISCLOSURE_UNVERIFIED'},excluded=group(values,proof,{},e),waiting=group(values,proof,{}, {...e,reason:'FILING_NOT_DUE'});
 const rows=[complete,partial,unknown,excluded,waiting].map(g=>({groups:{all:g,financial:g,value:g}}));const s=summarizeGroups(rows,'all');assert.equal(s.target,3);assert.equal(s.complete,1);assert.equal(s.missing,2);assert.equal(s.waiting,1);assert.equal(s.excluded,1);
 const allNa=group({}, {},Object.fromEntries(valueRequired.map(k=>[k,e])));assert.equal(allNa.complete,false);assert.equal(allNa.applicable,false);assert.equal(summarizeGroups([{groups:{all:allNa,value:allNa,financial:allNa}}],'all').rate,null);
});
const work=(receiptNo:string,securityId:string,state:WorkResult['state'],divisionPolicy='CFS_THEN_OFS'):WorkResult=>{const w={receiptNo,securityId,state,divisionPolicy,reportPeriod:'2025.12'};return {...w,key:securityWorkKey(w)};};
test('one receipt can have multiple distinct processing jobs; retries replace an outcome, corrections use new receipts, withdrawals are excluded',()=>{
 const a=work('1','1','FAILED'),retry={...a,state:'SUCCESS' as const},b=work('1','2','PARTIAL'),c=work('2','1','EXCLUDED');
 const count=processingCounts([a,retry,b,c]);assert.equal(count.target,3);assert.equal(count.success,1);assert.equal(count.partial,1);assert.equal(count.failed,0);assert.equal(count.excluded,1);assert.equal(count.rate,50);assert.equal(count.rateDenominator,2);
 assert.notEqual(work('1','1','SUCCESS','CFS_ONLY').key,work('1','1','SUCCESS','OFS_ONLY').key);
 assert.equal(processingCounts([work('1','1','PENDING'),work('2','2','PROCESSING')]).rate,null);assert.equal(processingCounts([c]).rate,null);
 assert.equal(count.target,count.success+count.partial+count.failed+count.pending+count.processing+count.excluded);
});
test('zero targets distinguish completed empty/duplicate queries, failed/partial lookups, no history and unknown legacy; timestamps never fabricate a stored success',()=>{
 const start='2026-10-28T02:00:00Z',stored='2026-10-27T02:00:00Z',cursor={lastCompletedAt:start,coverageFrom:'20261028'},run=(status:string,discovery:any,workItems:WorkResult[]=[])=>({id:'1',status,startedAt:start,finishedAt:start,metadata:{workItems,discovery}});
 assert.equal(processingView(null,cursor,stored).message,'실행 이력 없음');
 const empty=processingView(run('SKIPPED',{status:'COMPLETE',found:0}),cursor,stored);assert.equal(empty.message,'조회 완료 · 신규 수집 대상 없음');assert.equal(empty.counts.rate,null);assert.equal(empty.lastStoredAt,stored);assert.equal(empty.lastQueryCompletedAt,'2026-10-28T02:00:00.000Z');
 assert.equal(processingView(run('SKIPPED',{status:'COMPLETE',found:5,created:0}),cursor).message,'조회 완료 · 추가 반영 대상 없음');
 assert.equal(processingView(run('FAILED',{status:'FAILED',found:0}),cursor).message,'공시 조회 실패');assert.equal(processingView(run('PARTIAL',{status:'PARTIAL',found:2}),cursor).state,'QUERY_PARTIAL');
 assert.equal(processingView({id:'1',status:'SKIPPED',metadata:{counts:{target:0}}},cursor).state,'UNKNOWN');
 const failed=processingView(run('FAILED',{status:'FAILED',found:0,resumePoint:{fromDate:'20261028',throughDate:'20261028',page:2}}),cursor);assert.equal(failed.discovery.checkpoint,null);assert.equal(failed.discovery.resumePoint.page,2);
 const checked=processingView(run('SKIPPED',{status:'COMPLETE',found:0,checkpoint:{fromDate:'20261028',throughDate:'20261028',page:3},resumePoint:{fromDate:'20261028',throughDate:'20261028',page:1}}),cursor);assert.equal(checked.discovery.checkpoint.page,3);assert.equal(checked.discovery.resumePoint.page,1);
 const p=processingView(run('PARTIAL',{status:'COMPLETE',found:1},[work('1','1','PARTIAL'),work('1','2','SUCCESS')]),cursor);assert.equal(p.discoveredReceipts,1);assert.equal(p.counts.target,2);assert.equal(p.counts.partial,1);assert.equal(p.counts.rate,50);
});
