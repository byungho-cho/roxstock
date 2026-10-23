import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@roxstock/shared/prisma';
import {weightedFee} from './fee-estimate.js';
const d=(s:string)=>new Prisma.Decimal(s);
test('weighted sums, 0/1/2/3 history, explicit zero and final KRW ceiling',()=>{
 assert.equal(weightedFee(d('1000'),[]),null);
 assert.deepEqual(weightedFee(d('1000'),[{amount:d('100'),feeTaxAmount:d('0')}]),{amount:'0',count:1});
 const rows=[{amount:d('100'),feeTaxAmount:d('1')},{amount:d('900'),feeTaxAmount:d('18')}];
 assert.deepEqual(weightedFee(d('10000'),rows),{amount:'190',count:2});
 assert.deepEqual(weightedFee(d('1'),[...rows,{amount:d('2000'),feeTaxAmount:d('2')}]),{amount:'1',count:3});
 assert.deepEqual(weightedFee(d('1'),[{amount:d('3'),feeTaxAmount:d('1')}]),{amount:'1',count:1});
});

test('ceil only final weighted amount, including exact integers and tiny fractions',()=>{
 for(const [amount,cost,total,expected] of [['100','155.7649','100','156'],['100','155.0000','100','155'],['1','0','3','0'],['1','0.0001','999999','1'],['99999999999999','0.001','1','100000000000']]){
  assert.equal(weightedFee(d(amount!),[{amount:d(total!),feeTaxAmount:d(cost!)}])!.amount,expected);
 }
});
