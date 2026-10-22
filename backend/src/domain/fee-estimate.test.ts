import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@roxstock/shared/prisma';
import {weightedFee} from './fee-estimate.js';
const d=(s:string)=>new Prisma.Decimal(s);
test('weighted sums, 0/1/2/3 history, explicit zero and ledger four decimal rounding',()=>{
 assert.equal(weightedFee(d('1000'),[]),null);
 assert.deepEqual(weightedFee(d('1000'),[{amount:d('100'),feeTaxAmount:d('0')}]),{amount:'0',count:1});
 const rows=[{amount:d('100'),feeTaxAmount:d('1')},{amount:d('900'),feeTaxAmount:d('18')}];
 assert.deepEqual(weightedFee(d('10000'),rows),{amount:'190',count:2});
 assert.deepEqual(weightedFee(d('1'),[...rows,{amount:d('2000'),feeTaxAmount:d('2')}]),{amount:'0.007',count:3});
 assert.deepEqual(weightedFee(d('1'),[{amount:d('3'),feeTaxAmount:d('1')}]),{amount:'0.3333',count:1});
});
