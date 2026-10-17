import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshOutcome} from './refreshOutcome.js';
const result=(valuation:string,dart='SKIPPED')=>({status:'SUCCESS',tasks:{dart:{state:dart},valuation:{state:valuation}}});
test('supplement completion distinguishes unavailable inputs from actual failures',()=>{
  const outcome=refreshOutcome({status:'PARTIAL',refreshMode:'SUPPLEMENT',results:[...Array.from({length:5},()=>result('SUCCESS')),...Array.from({length:7},()=>result('PARTIAL'))]});
  assert.deepEqual(outcome,{completed:5,missing:7,valuationFailed:0,disclosureFailed:0,severity:'info',title:'보완 수집 완료'});
});
test('real valuation failures and interrupted jobs retain warning presentation',()=>{
  assert.equal(refreshOutcome({status:'PARTIAL',refreshMode:'SUPPLEMENT',results:[result('FAILED')]}).severity,'warning');
  assert.equal(refreshOutcome({status:'PARTIAL',terminalCode:'TIMEOUT',results:[result('SUCCESS')]}).title,'일부 처리 후 종료');
  assert.equal(refreshOutcome({status:'FAILED',results:[result('FAILED','FAILED')]}).severity,'error');
});
