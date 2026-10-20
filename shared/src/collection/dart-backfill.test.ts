import test from 'node:test';
import assert from 'node:assert/strict';
import {dartWorkerStatus,dartTaskPeriodScope,dartAutomaticWork} from './dart-backfill.js';

const now=new Date('2026-10-21T04:00:00+09:00');
const worker={now,configured:true,stateExists:true,quotaBlocked:false,automaticWindow:true,runStatus:'SUCCESS'};
test('zero API calls do not imply delay when the automatic worker just completed a cycle',()=>{
  assert.equal(dartWorkerStatus({...worker,workerDates:[new Date(now.getTime()-10_000)]}),'OK');
  assert.equal(dartWorkerStatus({...worker,runStatus:'RUNNING',workerDates:[now]}),'RUNNING');
  assert.equal(dartWorkerStatus({...worker,workerDates:[new Date(now.getTime()-180_000)]}),'DELAYED');
});
test('schedule and quota waiting remain distinct from missing or failed workers',()=>{
  assert.equal(dartWorkerStatus({...worker,automaticWindow:false,workerDates:[]}),'WAITING');
  assert.equal(dartWorkerStatus({...worker,quotaBlocked:true,workerDates:[]}),'WAITING');
  assert.equal(dartWorkerStatus({...worker,runStatus:'FAILED',workerDates:[now]}),'FAILED');
  assert.equal(dartWorkerStatus({...worker,runStatus:'PARTIAL',workerDates:[now]}),'PARTIAL');
  assert.equal(dartWorkerStatus({...worker,configured:false,workerDates:[now]}),'NOT_CONFIGURED');
});
test('period scope uses Seoul year, preserves annual history and excludes older quarterly tasks',()=>{
  const scope=dartTaskPeriodScope(new Date('2026-12-31T16:00:00Z'));
  assert.deepEqual(scope.fiscalYear,{gte:2015,lte:2027});
  assert.deepEqual(scope.AND,[{OR:[{periodType:'ANNUAL'},{fiscalYear:{gte:2020}}]}]);
  const work=dartAutomaticWork(now);
  assert.deepEqual(work.OR,[{status:{in:['PENDING','PROCESSING']}},{status:'FAILED',OR:[{errorCode:null},{errorCode:{not:'REVIEW_REQUIRED'}}]}]);
});
