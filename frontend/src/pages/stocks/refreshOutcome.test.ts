import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshOutcome} from './refreshOutcome.js';
const result=(valuation:string,dart='SKIPPED')=>({status:'SUCCESS',tasks:{dart:{state:dart},valuation:{state:valuation}}});
test('missing or failed supplements count as unsuccessful reports without double counting',()=>{
 const outcome=refreshOutcome({status:'PARTIAL',refreshMode:'SUPPLEMENT',results:[...Array.from({length:2},()=>result('SUCCESS')),...Array.from({length:9},()=>result('PARTIAL')),result('FAILED','FAILED')]});
 assert.equal(outcome.completed,2);assert.equal(outcome.failed,1);assert.equal(outcome.missing,9);assert.equal(outcome.tone,'warning');
});
test('all completed reports are green; all unsuccessful reports are neutral',()=>{
 assert.equal(refreshOutcome({status:'SUCCESS',results:[result('SUCCESS','SUCCESS')]}).tone,'success');
 for(const state of ['PARTIAL','UNAVAILABLE'])assert.equal(refreshOutcome({status:'PARTIAL',refreshMode:'SUPPLEMENT',results:[result(state)]}).tone,'warning');
 assert.equal(refreshOutcome({status:'FAILED',refreshMode:'SUPPLEMENT',results:[result('FAILED')]}).tone,'neutral');
 assert.equal(refreshOutcome({status:'FAILED',results:[]}).tone,'neutral');
});
test('full refresh includes failed disclosures; timeouts cannot show complete success',()=>{
 assert.equal(refreshOutcome({status:'PARTIAL',results:[result('SUCCESS','FAILED')]}).failed,1);
 assert.equal(refreshOutcome({status:'PARTIAL',terminalCode:'TIMEOUT',results:[result('SUCCESS','SUCCESS')]}).tone,'warning');
});
