import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma} from '../generated/prisma/index.js';
import {prisma} from '../lib/prisma.js';
import {buildApp} from '../app.js';
const d=(v:number)=>new Prisma.Decimal(v);
for(const type of ['DEPOSIT','WITHDRAWAL','BUY','SELL','DIVIDEND'] as const){
 test(`${type}: past cash edit and latest delete preserve account, snapshots and source trades`,async()=>{
  const original=prisma.$transaction;let stored:any,deleted=false,latest=3n;let order:any;
  const cash={id:2n,accountId:1n,transactionType:type,amount:d(100),feeTaxAmount:d(10),balanceAfter:d(900),transactionDate:new Date(),memo:null,dividend:type==='DIVIDEND'?{id:3n,securityId:4n,grossAmount:d(110)}:null};
  // Deliberately provide no account/snapshot/buyLot/sellTrade update method: any recalculation fails.
  const tx={cashTransaction:{findUnique:async()=>deleted?null:cash,findFirst:async(args:any)=>{order=args;return{id:latest};},update:async(args:any)=>{stored=args.data;},delete:async()=>{deleted=true;}},account:{findUnique:async()=>({isActive:true,cashBalance:d(1000)})},security:{findUnique:async()=>({isActive:true})},dividend:{update:async()=>({}),delete:async()=>({})}};
  prisma.$transaction=(async(fn:any)=>fn(tx)) as any;const app=buildApp();
  try{
    const edit=await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{memo:'과거 수정',...(type==='BUY'||type==='SELL'?{balanceAfter:'880',feeTaxAmount:'20'}:{})}});
    assert.equal(edit.statusCode,200,edit.body);assert.equal(edit.json().data.cashBalanceAdjusted,false);assert.equal(stored.amount.toString(),'100');assert.equal(stored.balanceAfter.toString(),type==='BUY'||type==='SELL'?'880':'900');
    assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/2'})).statusCode,409);
    assert.deepEqual(order,{where:{accountId:1n},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    latest=2n;const result=await app.inject({method:'DELETE',url:'/api/cash-transactions/2'});assert.equal(result.statusCode,200,result.body);assert.equal(result.json().data.cashBalanceAdjusted,false);assert.equal(deleted,true);
    assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/2'})).statusCode,404);
  }finally{await app.close();prisma.$transaction=original;}
 });
}
test('cash edit rejects empty, negative and malformed explicit balances or taxes',async()=>{
 const original=prisma.$transaction;
 const tx={cashTransaction:{findUnique:async()=>({id:2n,accountId:1n,transactionType:'BUY',amount:d(100),feeTaxAmount:d(10),balanceAfter:d(900),transactionDate:new Date(),memo:null})},account:{findUnique:async()=>({isActive:true})}};
 prisma.$transaction=(async(fn:any)=>fn(tx)) as any;const app=buildApp();try{
  for(const field of ['feeTaxAmount','balanceAfter'])for(const value of ['','-1','NaN'])assert.equal((await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{[field]:value}})).statusCode,400);
 }finally{await app.close();prisma.$transaction=original;}
});
