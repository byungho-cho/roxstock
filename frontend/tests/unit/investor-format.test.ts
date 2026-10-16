import test from 'node:test';
import assert from 'node:assert/strict';
import {investorValue} from '../../src/pages/investor/InvestorHistoryCard.tsx';

test('investor amounts use millions without losing integer precision or inventing missing values',()=>{
 assert.equal(investorValue(null,'amount'),'—');
 assert.equal(investorValue('0','amount',true),'0');
 assert.equal(investorValue('-3200000000','amount',true),'-3,200');
 assert.equal(investorValue('1235000','amount',true),'+1.24');
 assert.equal(investorValue('9007199254740993','amount',true),'+9,007,199,254.74');
 assert.equal(investorValue('9007199254740993','quantity',true),'+9,007,199,254,740,993');
});
