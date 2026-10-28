import test from 'node:test';
import assert from 'node:assert/strict';
import {completedQuarters,editableCurrentPeriod,protectManualWrite,securityDataFields,validateManualNumber,validateSecurityDataBasis,securityDataUnit} from './security-data.js';
test('completed four calendar quarters use Seoul time and cross the year boundary',()=>{
 assert.deepEqual(completedQuarters(new Date('2026-03-31T15:00:00Z')).map(q=>[q.year,q.quarter]),[[2025,2],[2025,3],[2025,4],[2026,1]]);
 assert.equal(completedQuarters(new Date('2026-10-27T00:00:00Z')).at(-1)?.quarter,3);
 assert.equal(editableCurrentPeriod(2024,'ANNUAL',new Date('2026-10-27')),false);
});

test('manual basis stays period-local, validates real fiscal duration and survives automatic replacement without numeric edits',()=>{
 const b={receiptNo:null,fsDivision:'CFS',periodStart:'2025-04-01',periodEnd:'2026-03-31',currency:'USD',amountMultiplier:'1',shareClass:'COMMON',kind:'ACTUAL'};
 assert.deepEqual(validateSecurityDataBasis(b,2025,4),b);
 for(const bad of [{periodEnd:'2026-02-30'},{periodStart:'2026-03-30'},{currency:'XXX'},{amountMultiplier:'100000000'}])assert.throws(()=>validateSecurityDataBasis({...b,...bad},2025,4));
 assert.throws(()=>validateSecurityDataBasis(b,2026,2));
 assert.deepEqual(protectManualWrite({supplemental:{manualBasis:b,manualEditRevision:1}},{supplemental:{accounts:{}}}).supplemental.manualBasis,b);
 assert.equal(securityDataUnit('eps','USD'),'USD');assert.equal(securityDataUnit('eps','KRW'),'원');assert.equal(securityDataUnit('per',null),'배');assert.equal(securityDataUnit('issuedShares','USD'),'주');assert.equal(securityDataUnit('roe',null),'%');
 for(const key of ['eps','bps','roe','netIncomeYtd','totalEquity','operatingCashFlowYtd'])assert.equal(validateManualNumber(key,'-1.5'),'-1.5');
 for(const key of ['per','pbr','dividendPerShare','totalAssets','totalLiabilities'])assert.throws(()=>validateManualNumber(key,'-1'));
});
test('26 fields have explicit modes, no identifiers and no writes to derived fields',()=>{
 assert.equal(securityDataFields.length,26);assert.equal(new Set(securityDataFields.map(f=>f[0])).size,26);
 assert.equal(validateManualNumber('eps','0'),'0');assert.equal(validateManualNumber('roe','-12.3456'),'-12.3456');
 for(const f of ['marketCap','outstandingShares','dividendYield','openingEquity','securityId','source'])assert.throws(()=>validateManualNumber(f,'100'));
 for(const v of ['NaN','Infinity','1e6','1,000','1.23456',''])assert.throws(()=>validateManualNumber('eps',v));
 assert.throws(()=>validateManualNumber('issuedShares','-1'));assert.throws(()=>validateManualNumber('treasuryShares','1.5'));
});
test('automatic full replacement preserves manual zero, negative values, financial overrides and records conflicts',()=>{
 const previous={supplemental:{manualFields:{eps:{value:'0'},roe:{value:'-3'},totalAssets:{value:'50'}},manualEditRevision:2}};
 const result=protectManualWrite(previous,{values:{eps:'100',roe:'9',bps:'400'},supplemental:{accounts:{receiptNo:'new'}},provenance:{source:'DART',perMetric:{eps:{source:'DART'}}}});
 assert.equal(result.values.eps,'0');assert.equal(result.values.roe,'-3');assert.equal(result.values.bps,'400');assert.equal(result.provenance.perMetric.eps.source,'MANUAL');assert.equal(result.supplemental.manualFields.totalAssets.value,'50');assert.equal(result.supplemental.manualConflict.reason,'AUTOMATIC_VALUE_CONFLICT_MANUAL_PRESERVED');
 assert.deepEqual(previous.supplemental.manualFields.eps,{value:'0'});
});
test('only a new explicit manual revision permits a second edit; a stale automatic copy cannot unlock protection',()=>{
 const previous={supplemental:{manualFields:{eps:{value:'4'}},manualEditRevision:1}};
 assert.equal(protectManualWrite(previous,{values:{eps:'7'},supplemental:{manualEditRevision:1}}).values.eps,'4');
 assert.equal(protectManualWrite(previous,{values:{eps:'8'},supplemental:{manualEditRevision:2,manualFields:{eps:{value:'8'}}}}).values.eps,'8');
});

test('new result projection preserves partial collection and unresolved separately from provider errors',async()=>{
 const {publicSecurityDataResult}=await import('./security-data.js');
 assert.deepEqual(publicSecurityDataResult({phase:'SECURITY_DATA',outcome:'UNRESOLVED',partial:true,financialStored:true,fiscalYear:2026,periodType:'Q2',receiptNo:'20260814000001',secret:'must-not-leak',raw:{}}),{outcome:'UNRESOLVED',partial:true,financialStored:true,fiscalYear:2026,periodType:'Q2',receiptNo:'20260814000001'});
 assert.equal(publicSecurityDataResult({phase:'MANUAL',outcome:'FAILED'}),null);
 assert.equal(publicSecurityDataResult({phase:'SECURITY_DATA',outcome:'invalid'}),null);
});
