import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {installAuth} from '../src/auth/guard.js';
import {loginSession,cookieNames} from '../src/auth/service.js';
import {cashRoutes} from '../src/routes/cash.js';
import {cashMutationRoutes} from '../src/routes/cash-mutations.js';

test('authenticated fee history and settlement preserve scope, confirmed provenance and one existing trade',async()=>{
 assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
 process.env.AUTH_PUBLIC_ORIGIN='https://fixture.invalid';
 const users=await Promise.all([0,1].map(()=>db.authUser.create({data:{email:`fee-${randomUUID()}@example.invalid`,verifiedAt:new Date()}})));
 const accounts=await Promise.all([users[0]!,users[0]!,users[1]!].map(u=>db.account.create({data:{userId:u.id,name:'fee fixture',brokerName:'TEST',cashBalance:1000000}})));
 const securities=await Promise.all([{marketType:'KOSPI',securityType:'STOCK'},{marketType:'KOSDAQ',securityType:'STOCK'},{marketType:'KOSPI',securityType:'ETF'}].map(s=>db.security.create({data:{...s as any,symbol:'F'+randomUUID().slice(0,10),name:'fee fixture'}})));
 const app=Fastify();installAuth(app);app.setErrorHandler((e,_r,reply)=>reply.code(e instanceof ApiError?e.statusCode:500).send({error:{code:e instanceof ApiError?e.code:'INTERNAL',message:e.message}}));await app.register(cashRoutes,{prefix:'/api'});await app.register(cashMutationRoutes,{prefix:'/api'});
 const login=Fastify();login.get('/',async(_r,reply)=>{await loginSession(users[0]!.id,true,reply);return {};});
 const r=await login.inject('/');const headers={cookie:r.cookies.map(c=>c.name+'='+c.value).join('; '),'x-csrf-token':r.cookies.find(c=>c.name===cookieNames.csrf)!.value,origin:'https://fixture.invalid','content-type':'application/json'};
 const aid=accounts[0]!.id;
 async function seed(day:number,amount:number,cost:number,status='CONFIRMED',accountId=aid,security=securities[0]!,side:'BUY'|'SELL'='BUY'){
  const date=new Date(`2026-10-${String(day).padStart(2,'0')}T03:00:00Z`);
  const buy=await db.buyTrade.create({data:{accountId,securityId:security.id,boughtAt:date,quantity:1,unitPrice:amount}});
  const sell=side==='SELL'?await db.sellTrade.create({data:{buyTradeId:buy.id,soldAt:date,quantity:1,unitPrice:amount}}):null;
  return db.cashTransaction.create({data:{accountId,transactionType:side,...(sell?{sellTradeId:sell.id}:{buyTradeId:buy.id}),transactionDate:date,createdAt:date,amount,feeTaxAmount:cost,feeTaxStatus:status,balanceAfter:1000000-cost}});
 }
 try{
  // Current ID is newer than prior rows, as in normal ledger writes.
  const oldest=await seed(9,1000,999);
  const zero=await seed(10,1000,0);
  const prior2=await seed(11,1000,10);
  const prior3=await seed(12,3000,60);
  await seed(13,1000,999,'ESTIMATED');await seed(14,1000,888,'UNKNOWN');
  await seed(15,1000,777,'CONFIRMED',accounts[1]!.id);const wrongLink=await seed(15,1000,777,'CONFIRMED',accounts[1]!.id);await db.cashTransaction.update({where:{id:wrongLink.id},data:{accountId:aid}});await seed(16,1000,666,'CONFIRMED',accounts[2]!.id);
  await seed(17,1000,555,'CONFIRMED',aid,securities[1]!);await seed(18,1000,444,'CONFIRMED',aid,securities[2]!);await seed(19,1000,333,'CONFIRMED',aid,securities[0]!,'SELL');
  const invalidAmount=await seed(20,1000,1);await db.cashTransaction.update({where:{id:invalidAmount.id},data:{amount:999}});
  await seed(20,0,0);await seed(21,1000,2000);
  const orphan=await seed(21,1000,1);await db.cashTransaction.update({where:{id:orphan.id},data:{buyTradeId:null}});
  const future=await seed(25,1000,1);await db.cashTransaction.update({where:{id:future.id},data:{createdAt:new Date('2026-10-21T03:00:00Z')}});
  const current=await seed(22,100000,0,'UNKNOWN');
  const url=`/api/accounts/${aid}/cash-transactions/${current.id}/fee-estimate`;
  const estimate=async()=>{const res=await app.inject({url,headers});assert.equal(res.statusCode,200,res.body);return res.json().data;};
  assert.deepEqual(await estimate(),{amount:'1400',count:3});
  await db.cashTransaction.update({where:{id:oldest.id},data:{feeTaxStatus:'UNKNOWN'}});
  await db.cashTransaction.update({where:{id:prior3.id},data:{feeTaxStatus:'UNKNOWN'}});assert.deepEqual(await estimate(),{amount:'500',count:2});
  await db.cashTransaction.update({where:{id:prior2.id},data:{feeTaxStatus:'UNKNOWN'}});assert.deepEqual(await estimate(),{amount:'0',count:1});
  await db.cashTransaction.update({where:{id:zero.id},data:{feeTaxStatus:'UNKNOWN'}});assert.equal(await estimate(),null);
  await db.cashTransaction.updateMany({where:{id:{in:[zero.id,prior2.id,prior3.id]}},data:{feeTaxStatus:'CONFIRMED'}});
  await db.cashTransaction.update({where:{id:current.id},data:{feeTaxAmount:9}});assert.equal(await estimate(),null,'preserve legacy actual-looking costs with unknown provenance');await db.cashTransaction.update({where:{id:current.id},data:{feeTaxAmount:0}});
  const beforeCount=await db.buyTrade.count({where:{accountId:aid}});
  const patch=(body:any)=>app.inject({method:'PATCH',url:`/api/cash-transactions/${current.id}`,headers,payload:{accountId:String(aid),...body}});
  const body={feeTaxAmount:'1400',feeTaxStatus:'ESTIMATED',feeTaxBasisCount:3,balanceAfter:'998600'};
  assert.equal((await patch(body)).statusCode,200);assert.equal((await patch(body)).statusCode,200);
  assert.equal((await db.account.findUniqueOrThrow({where:{id:aid}})).cashBalance.toString(),'998600');assert.equal(await db.buyTrade.count({where:{accountId:aid}}),beforeCount);
  assert.equal((await db.cashTransaction.findUniqueOrThrow({where:{id:current.id}})).feeTaxStatus,'ESTIMATED');
  const next=await seed(23,100000,0,'UNKNOWN');const nextRes=await app.inject({url:`/api/accounts/${aid}/cash-transactions/${next.id}/fee-estimate`,headers});assert.deepEqual(nextRes.json().data,{amount:'1400',count:3},'unconfirmed estimate excluded');
  assert.equal((await patch({...body,feeTaxStatus:'CONFIRMED'})).statusCode,200);assert.equal(await estimate(),null,'confirmed cost never overwritten');
  assert.equal((await app.inject({url:`/api/accounts/${accounts[2]!.id}/cash-transactions/${current.id}/fee-estimate`,headers})).statusCode,404);
  assert.equal((await app.inject({url:`/api/accounts/${accounts[1]!.id}/cash-transactions/${current.id}/fee-estimate`,headers})).statusCode,404);
  const sellCurrent=await seed(24,10000,0,'UNKNOWN',aid,securities[0]!,'SELL');const sellRes=await app.inject({url:`/api/accounts/${aid}/cash-transactions/${sellCurrent.id}/fee-estimate`,headers});assert.deepEqual(sellRes.json().data,{amount:'3330',count:1});
  const count=await db.buyTrade.count({where:{accountId:aid}});const unchanged=await db.cashTransaction.findUniqueOrThrow({where:{id:current.id}});const unchangedBalance=await db.account.findUniqueOrThrow({where:{id:aid}});for(const status of ['UNKNOWN','ESTIMATED','CONFIRMED']){const invalid=await patch({feeTaxStatus:status,feeTaxAmount:'-1'});assert.equal(invalid.statusCode,400);assert.equal((await db.cashTransaction.findUniqueOrThrow({where:{id:current.id}})).feeTaxAmount.toString(),unchanged.feeTaxAmount.toString());assert.equal((await db.account.findUniqueOrThrow({where:{id:aid}})).cashBalance.toString(),unchangedBalance.cashBalance.toString());}assert.equal(await db.buyTrade.count({where:{accountId:aid}}),count);
 }finally{
  const ids=accounts.map(a=>a.id);await db.cashTransaction.deleteMany({where:{accountId:{in:ids}}});await db.sellTrade.deleteMany({where:{buyTrade:{accountId:{in:ids}}}});await db.buyTrade.deleteMany({where:{accountId:{in:ids}}});await db.account.deleteMany({where:{id:{in:ids}}});await db.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await db.security.deleteMany({where:{id:{in:securities.map(s=>s.id)}}});await app.close();await login.close();await db.$disconnect();
 }
});
