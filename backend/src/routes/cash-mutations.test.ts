import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma} from '../generated/prisma/index.js';
import {prisma} from '../lib/prisma.js';
import {buildApp} from '../app.js';
const d=(v:number)=>new Prisma.Decimal(v);
for(const [type,delta] of [['DEPOSIT',100],['WITHDRAWAL',-100],['BUY',-110],['SELL',90],['DIVIDEND',100]] as const){
 test(`${type}: latest cash deletion reverses balance without touching original trades`,async()=>{
  const original=prisma.$transaction;let balance=1000;let deleted=false;
  const cash={id:2n,accountId:1n,transactionType:type,amount:d(100),feeTaxAmount:d(10),dividend:type==='DIVIDEND'?{id:3n}:null};
  const tx={cashTransaction:{findUnique:async()=>cash,findFirst:async()=>({id:2n}),delete:async()=>{deleted=true;}},account:{findUnique:async()=>({isActive:true,cashBalance:d(balance)}),update:async(args:any)=>{balance=Number(args.data.cashBalance);}},dividend:{delete:async()=>({})}};
  prisma.$transaction=(async(fn:any)=>fn(tx)) as any;const app=buildApp();try{const r=await app.inject({method:'DELETE',url:'/api/cash-transactions/2'});assert.equal(r.statusCode,200,r.body);assert.equal(balance,1000-delta);assert.equal(deleted,true);assert.equal(r.json().data.cashBalanceAdjusted,true);}finally{await app.close();prisma.$transaction=original;}
 });
}
test('older cash entry and repeated deletion do not change balance',async()=>{
 const original=prisma.$transaction;let exists=true,latest=3n,updates=0;
 const tx={cashTransaction:{findUnique:async()=>exists?{id:2n,accountId:1n,transactionType:'BUY',amount:d(100),feeTaxAmount:d(0)}:null,findFirst:async()=>({id:latest}),delete:async()=>{exists=false;}},account:{findUnique:async()=>({isActive:true,cashBalance:d(1000)}),update:async()=>{updates++;}}};
 prisma.$transaction=(async(fn:any)=>fn(tx)) as any;const app=buildApp();try{assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/2'})).statusCode,409);assert.equal(updates,0);latest=2n;assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/2'})).statusCode,200);assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/2'})).statusCode,404);assert.equal(updates,1);}finally{await app.close();prisma.$transaction=original;}
});
test('latest buy cash edit applies difference and preserves fee and original trade',async()=>{
 const original=prisma.$transaction;let balance=1000;let stored:any;
 const tx={cashTransaction:{findUnique:async()=>({id:2n,accountId:1n,transactionType:'BUY',amount:d(100),feeTaxAmount:d(10),transactionDate:new Date(),memo:null}),findFirst:async()=>({id:2n}),update:async(args:any)=>{stored=args.data;}},account:{findUnique:async()=>({isActive:true,cashBalance:d(balance)}),update:async(args:any)=>{balance=Number(args.data.cashBalance);}}};
 prisma.$transaction=(async(fn:any)=>fn(tx)) as any;const app=buildApp();try{const r=await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{amount:'140'}});assert.equal(r.statusCode,200,r.body);assert.equal(balance,960);assert.equal(stored.amount.toString(),'140');assert.equal(stored.balanceAfter.toString(),'960');}finally{await app.close();prisma.$transaction=original;}
});
