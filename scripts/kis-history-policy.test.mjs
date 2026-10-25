import test from 'node:test';
import assert from 'node:assert/strict';
import {won,anchorCheck,stopCode,quarterExclusion} from './kis-history-policy.mjs';
test('old quarters require confirmed API unavailability; annuals and transport errors never auto-exclude',()=>{
 assert.equal(quarterExclusion({year:2022,period:'Q1',cfsEmpty:true,ofsEmpty:true}),'HISTORICAL_QUARTER_UNAVAILABLE');
 assert.equal(quarterExclusion({year:2023,period:'Q1',cfsEmpty:true,ofsEmpty:true}),null);
 assert.equal(quarterExclusion({year:2023,period:'Q1',annualVerified:true,cfsEmpty:true,ofsEmpty:true}),'QUARTER_SOURCE_NOT_PROVIDED');
 assert.equal(quarterExclusion({year:2020,period:'ANNUAL',cfsEmpty:true,ofsEmpty:true}),null);
 assert.equal(quarterExclusion({year:2020,period:'Q2',cfsEmpty:true,ofsEmpty:false}),null);
 assert.equal(quarterExclusion({year:2022,period:'Q3',noReport:true,noKisPeriod:true}),'HISTORICAL_QUARTER_UNAVAILABLE');
 assert.equal(quarterExclusion({year:2022,period:'Q3',noReport:true,noKisPeriod:false}),null);
});
test('rounded source units convert exactly without floating point',()=>{
  assert.equal(won('-1,234.5678'),'-123456780000');assert.equal(won('0'),'0');
  for(const x of ['',null,'NaN','1e5','1.12345'])assert.equal(won(x),null);
});
const values={totalAssets:'100000000',totalLiabilities:'200000000',totalEquity:'300000000',operatingProfitYtd:'400000000',netIncomeYtd:'500000000'};
const tables=[{mode:'1',endpoint:'balance-sheet',rows:[{stac_yymm:'202506',total_aset:'1',total_lblt:'2',total_cptl:'3'}]},{mode:'1',endpoint:'income-statement',rows:[{stac_yymm:'202506',bsop_prti:'4',thtr_ntin:'5'}]}];
test('historical half-year uses exact period, cumulative flows and unique rows',()=>{
  assert.equal(anchorCheck(values,tables,'2025-06-30','Q2').verified,true);
  assert.equal(anchorCheck(values,tables,'2025-09-30','Q3').verified,false);
  assert.equal(anchorCheck(values,tables,'2025-06-30','ANNUAL').verified,false);
  const duplicate=structuredClone(tables);duplicate[0].rows.push(duplicate[0].rows[0]);
  assert.equal(anchorCheck(values,duplicate,'2025-06-30','Q2').verified,false);
});
test('all five anchors required; conflicting and missing sources cannot verify',()=>{
  assert.equal(anchorCheck({...values,totalAssets:null},tables,'2025-06-30','Q2').verified,false);
  assert.equal(anchorCheck({...values,totalAssets:'150000001'},tables,'2025-06-30','Q2').verified,false);
  assert.equal(anchorCheck({...values,totalAssets:'150000000'},tables,'2025-06-30','Q2').verified,true);
});
test('quota, authentication and fencing failures halt campaign batch',()=>{
  for(const code of ['020','DAILY_CALL_LIMIT','KIS_RATE_LIMIT','KIS_AUTH_OR_PERMISSION_FAILED','FINANCIAL_LEASE_LOST','HISTORY_STOPPED'])assert.equal(stopCode(code),true);
  assert.equal(stopCode('DART_SOURCE_REVIEW'),false);
});
