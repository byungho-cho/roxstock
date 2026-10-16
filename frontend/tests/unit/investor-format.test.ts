import test from 'node:test';
import assert from 'node:assert/strict';
import {investorValue,investorDailyValue,investorDailyUnit} from '../../src/pages/investor/InvestorHistoryCard.tsx';

test('investor amounts use millions without losing integer precision or inventing missing values',()=>{
 assert.equal(investorValue(null,'amount'),'—');
 assert.equal(investorValue('0','amount',true),'0');
 assert.equal(investorValue('-3200000000','amount',true),'-3,200');
 assert.equal(investorValue('1235000','amount',true),'+1.24');
 assert.equal(investorValue('9007199254740993','amount',true),'+9,007,199,254.74');
 assert.equal(investorValue('9007199254740993','quantity',true),'+9,007,199,254,740,993');
});

test('daily values use adaptive units without losing market quantity scale',()=>{
 assert.equal(investorDailyValue(null,'amount'),'—');
 assert.equal(investorDailyValue('100000000','amount'),'+1');
 assert.equal(investorDailyUnit('100000000','amount'),'억원');
 assert.equal(investorDailyValue('-123456789','amount'),'-1.23');
 assert.equal(investorDailyValue('123456','quantity'),'+12.35');
 assert.equal(investorDailyUnit('123456','quantity'),'만주');
 assert.equal(investorDailyValue('100000','quantity',true),'+1');
 assert.equal(investorDailyUnit('100000','quantity',true),'억주');
 assert.equal(investorDailyValue('-123.45','quantity',true),'-12.35');
});
