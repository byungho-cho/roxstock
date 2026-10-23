import test from 'node:test';
import assert from 'node:assert/strict';
import {ceilWonCost,cashDifference} from './cashData';
test('exact KRW cost, preserving other decimal fields and invalid/empty input',()=>{
 for(const [value,expected] of [['155.7649','156'],['155.0000','155'],['0','0'],['',''],['-1','-1'],['999999999999999.0001','1000000000000000']])assert.equal(ceilWonCost(value!),expected);
 assert.equal(cashDifference('1000',ceilWonCost('155.7649')),'844');
 assert.equal(cashDifference('1000.1234','155'),'845.1234');
});
