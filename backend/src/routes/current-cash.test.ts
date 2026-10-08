import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
import { buildApp } from '../app.js';
import { serializable } from '../lib/transaction.js';
import { readCurrentCash } from '../domain/current-cash.js';
const d=(v:number)=>new Prisma.Decimal(v);
test('accounts, period-independent overview, dashboard and portfolio agree on account latest; no stored balance fallback',async()=>{
 const methods:any[]=[];function mock(target:any,name:string,value:any){methods.push([target,name,target[name]]);target[name]=value;}
 let missing=false,empty=false,fail=false;const now=new Date();
 const entry=(accountId:bigint)=>({id:accountId*10n,accountId,transactionType:'DEPOSIT',createdAt:now,updatedAt:now,transactionDate:new Date('2000-01-01'),amount:d(100),feeTaxAmount:d(0),balanceAfter:missing?null:d(Number(accountId)*100),memo:null,dividend:null});
 const account=(id:bigint)=>({id,name:`계좌${id}`,brokerName:'증권',cashBalance:d(99999),isActive:true,createdAt:now,updatedAt:now,cashTransactions:empty?[]:[entry(id)],buyTrades:[]});
 mock(prisma.account,'findMany',async(args:any)=>{assert.deepEqual(args.include.cashTransactions.orderBy,[{createdAt:'desc'},{id:'desc'}]);assert.equal(args.include.cashTransactions.take,1);return [account(1n),account(2n)];});
 mock(prisma.account,'findUnique',async(args:any)=>{if(args.include){assert.deepEqual(args.include.cashTransactions.orderBy,[{createdAt:'desc'},{id:'desc'}]);assert.equal(args.include.cashTransactions.take,1);}return account(args.where.id);});
 mock(prisma.cashTransaction,'findMany',async(args:any)=>{if(fail)throw new Error('query failed');assert.deepEqual(args.where,{accountId:args.where.accountId});assert.deepEqual(args.orderBy,[{createdAt:'desc'},{id:'desc'}]);return empty?[]:[entry(args.where.accountId)];});
 mock(prisma.cashTransaction,'groupBy',async()=>[]);mock(prisma.cashTransaction,'aggregate',async()=>({_sum:{feeTaxAmount:d(0)}}));mock(prisma.dividend,'aggregate',async()=>({_sum:{grossAmount:d(0),netAmount:d(0)}}));mock(prisma.dailyAccountSnapshot,'findUnique',async()=>null);
 const app=buildApp();try{
  for(const state of ['available','missing','empty']){
   missing=state==='missing';empty=state==='empty';const list=await app.inject('/api/accounts');assert.equal(list.statusCode,200,list.body);
   for(const id of [1,2]){
    const expected=state==='available'?String(id*100):null;
    assert.equal(list.json().data[id-1].cashBalance,expected);
    const cash=await app.inject(`/api/accounts/${id}/cash-overview?year=2020&month=2`);assert.equal(cash.statusCode,200,cash.body);assert.equal(cash.json().data.account.currentBalance,expected);assert.equal(cash.json().data.account.latestTransactionId,state==='empty'?null:String(id*10));
    const dashboard=await app.inject(`/api/accounts/${id}/dashboard`);assert.equal(dashboard.statusCode,200,dashboard.body);assert.equal(dashboard.json().data.cashBalance,expected);assert.equal(dashboard.json().data.totalAssetValue,expected);
    assert.equal((await app.inject(`/api/accounts/${id}/holdings`)).statusCode,200);
   }
  }
  fail=true;assert.equal((await app.inject('/api/accounts/1/cash-overview')).statusCode,500);
 }finally{await app.close();for(const [target,name,original] of methods)target[name]=original;}
});
test('serialization conflict retries entire transaction and re-reads changed latest basis',async()=>{
 const original=prisma.$transaction;let attempts=0;
 prisma.$transaction=(async(fn:any)=>{attempts++;const basis=await fn({cashTransaction:{findFirst:async()=>({id:BigInt(attempts),balanceAfter:d(attempts*100),updatedAt:new Date()})}});if(attempts===1)throw new Prisma.PrismaClientKnownRequestError('conflict',{code:'P2034',clientVersion:'test'});return basis;}) as any;
 try{const result=await serializable(tx=>readCurrentCash(tx,1n));assert.equal(attempts,2);assert.equal(result.transactionId,'2');assert.equal(result.balance?.toString(),'200');}finally{prisma.$transaction=original;}
});

test('MariaDB raw lock conflicts retry rolled-back work; unrelated raw errors do not retry',async()=>{
 const original=prisma.$transaction;
 try{for(const sqlCode of ['1020','1213','1205','1146']){
  let attempts=0;prisma.$transaction=(async()=>{attempts++;if(attempts===1)throw new Prisma.PrismaClientKnownRequestError('raw query failure',{code:'P2010',clientVersion:'test',meta:{code:sqlCode}});return 'ok';}) as any;
  if(sqlCode==='1146'){await assert.rejects(serializable(async()=>''));assert.equal(attempts,1);}else{assert.equal(await serializable(async()=>''),'ok');assert.equal(attempts,2);}
 }}finally{prisma.$transaction=original;}
});
