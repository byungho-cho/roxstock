import test from 'node:test';
import assert from 'node:assert/strict';
import evidence from './fixtures/dart-followup-evidence-20261021.json' with {type:'json'};
import {verifiedLegacyApiAbsence,verifiedPolicyPeriod} from './dart-followup-evidence.js';
test('57 operator-audited tasks import exactly 114 successful no-data responses without new API calls',()=>{
 assert.equal(evidence.financial.length,57);let responses=0;
 for(const item of evidence.financial){const task={id:BigInt(item.taskId),symbol:item.symbol,corpCode:item.corpCode,fiscalYear:item.year,reportCode:item.reportCode,updatedAt:new Date(item.expectedUpdatedAt),selectedReceiptNo:item.selectedReceiptNo,lastAttemptAt:null};const proof=verifiedLegacyApiAbsence(task);assert.ok(proof);responses+=proof.financialResponses.length;
 assert.equal(verifiedLegacyApiAbsence({...task,selectedReceiptNo:'20990101000000'}),undefined);assert.equal(verifiedLegacyApiAbsence({...task,updatedAt:new Date('2099-01-01')}),undefined);assert.equal(verifiedLegacyApiAbsence({...task,lastAttemptAt:new Date('2099-01-01')}),undefined);assert.equal(verifiedLegacyApiAbsence({...task,corpCode:'00000000'}),undefined);}
 assert.equal(responses,114);
});
test('only the 24 exact audited Theborn task identities and pre-listing periods qualify',()=>{
 assert.equal(evidence.policy.length,24);
 for(const item of evidence.policy){const task={id:BigInt(item.taskId),symbol:item.symbol,corpCode:item.corpCode,fiscalYear:item.year,reportCode:item.reportCode};assert.ok(verifiedPolicyPeriod(task));assert.equal(verifiedPolicyPeriod({...task,id:0n}),undefined);assert.ok(item.periodEnd<'2024-11-06');}
 assert.equal(evidence.policy.some(p=>p.year===2024&&p.period==='ANNUAL'),false);
});
