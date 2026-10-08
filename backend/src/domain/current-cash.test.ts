import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma} from '../generated/prisma/index.js';
import {cashBasis} from './current-cash.js';
import {calculateSnapshot} from '../collector/snapshot-collector.js';
test('zero is an explicit available ledger value; unknown cash never creates a zero snapshot',()=>{
 const zero=cashBasis({id:1n,balanceAfter:new Prisma.Decimal(0),updatedAt:new Date()});assert.equal(zero.status,'AVAILABLE');assert.equal(zero.balance?.toString(),'0');assert.equal(cashBasis(null).status,'NO_TRANSACTIONS');assert.equal(cashBasis({id:1n,balanceAfter:null,updatedAt:new Date()}).status,'BALANCE_MISSING');
 assert.deepEqual(calculateSnapshot({id:1n,name:'unknown',cashBalance:null,lots:[]}),{missingSymbols:['CURRENT_CASH_MISSING']});assert.equal(calculateSnapshot({id:1n,name:'zero',cashBalance:'0',lots:[]}).value?.totalAssetValue,'0');
});
