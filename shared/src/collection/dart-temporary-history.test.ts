import test from 'node:test';import assert from 'node:assert/strict';import{temporaryDartHistory,dartWorkerStatus}from'./dart-backfill.js';
test('explicit temporary BACKFILL preserves completion history and pauses current collection only',()=>{
 assert.equal(temporaryDartHistory({phase:'BACKFILL',backfillCompletedAt:new Date()}),true);
 assert.equal(temporaryDartHistory({phase:'BACKFILL',backfillCompletedAt:null}),false);
 assert.equal(temporaryDartHistory({phase:'CURRENT',backfillCompletedAt:new Date()}),false);
});
test('expected batch gap waits without inventing success or masking actual failure',()=>{
 const input={now:new Date('2026-10-25T01:03:00Z'),configured:true,stateExists:true,quotaBlocked:false,automaticWindow:true,workerDates:[new Date('2026-10-25T01:00:00Z')],nextBatchAt:new Date('2026-10-25T01:05:00Z')};
 assert.equal(dartWorkerStatus({...input,runStatus:'SUCCESS'}),'WAITING');
 assert.equal(dartWorkerStatus({...input,runStatus:'PARTIAL'}),'PARTIAL');
 assert.equal(dartWorkerStatus({...input,now:new Date('2026-10-25T01:08:00Z'),runStatus:'SUCCESS'}),'DELAYED');
});
