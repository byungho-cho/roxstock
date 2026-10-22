import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {installAuth} from '../src/auth/guard.js';
import {loginSession,cookieNames} from '../src/auth/service.js';
import {tradeRoutes} from '../src/routes/trades.js';
import {portfolioRoutes} from '../src/routes/portfolio.js';
import {authContext} from '../src/auth/context.js';
import {serializable} from '../src/lib/transaction.js';

test('authenticated buys see uncommitted parent, preserve ownership, rollback and idempotency',async()=>{
 const target=new URL(process.env.DATABASE_URL!);assert.ok(['127.0.0.1','localhost'].includes(target.hostname));
 process.env.AUTH_PUBLIC_ORIGIN='https://fixture.invalid';
 const users=await Promise.all([0,1].map(()=>db.authUser.create({data:{email:`buy-${randomUUID()}@example.invalid`,verifiedAt:new Date()}})));
 const accounts=await Promise.all(users.map(user=>db.account.create({data:{userId:user.id,name:'isolated-buy-test',brokerName:'TEST',accountNumber:randomUUID(),cashBalance:10000000}})));
 const securities=await Promise.all([0,1].map(()=>db.security.create({data:{symbol:'B'+randomUUID().replaceAll('-','').slice(0,10),name:'authenticated-buy-fixture',marketType:'OTHER'}})));
 const app=Fastify();installAuth(app);app.setErrorHandler((e,_r,reply)=>reply.code(e instanceof ApiError?e.statusCode:500).send({error:{code:e instanceof ApiError?e.code:'INTERNAL_SERVER_ERROR',message:e.message}}));await app.register(tradeRoutes,{prefix:'/api'});await app.register(portfolioRoutes,{prefix:'/api'});
 const login=Fastify();login.get<{Params:{i:string}}>('/:i',async(req,reply)=>{await loginSession(users[Number(req.params.i)]!.id,true,reply);return {};});
 const auth=[];for(let i=0;i<users.length;i++){const r=await login.inject('/'+i);auth.push({cookie:r.cookies.map(c=>c.name+'='+c.value).join('; '),'x-csrf-token':r.cookies.find(c=>c.name===cookieNames.csrf)!.value,origin:'https://fixture.invalid','content-type':'application/json'});}
 const accountId=accounts[0]!.id,aid=String(accountId),securityId=String(securities[0]!.id);
 const call=(payload:Record<string,unknown>)=>app.inject({method:'POST',url:'/api/buy-trades',headers:auth[0]!,payload});
 const input={accountId:aid,securityId,boughtAt:'2026-10-22T03:00:00Z',quantity:'5',unitPrice:'300000',feeTaxAmount:'0'};
 const snapshot=async()=>({buys:await db.buyTrade.count({where:{accountId}}),cash:await db.cashTransaction.count({where:{accountId}}),requests:await db.tradeRequest.count({where:{accountId}}),balance:(await db.account.findUniqueOrThrow({where:{id:accountId}})).cashBalance.toString()});
 try{
  await db.cashTransaction.create({data:{accountId,transactionType:'DEPOSIT',transactionDate:new Date('2026-10-21'),amount:10000000,balanceAfter:10000000}});
  const before=await snapshot();
  const first=await call({...input,requestId:randomUUID()});
  if(first.statusCode!==201){assert.deepEqual(await snapshot(),before,'failed buy must roll back new lot, ledger, request and balance');}
  assert.equal(first.statusCode,201,first.body);const firstId=first.json().data.id;assert.ok(first.json().data.cashTransactionId);
  assert.equal((await db.cashTransaction.findUniqueOrThrow({where:{id:BigInt(first.json().data.cashTransactionId)}})).buyTradeId,BigInt(firstId));
  // Existing security additional buy: manual UUID carries no notification or Lot identifier.
  const second=await call({...input,quantity:'5',unitPrice:'400000',requestId:randomUUID()});assert.equal(second.statusCode,201,second.body);
  const holding=(await app.inject({url:`/api/accounts/${aid}/holdings`,headers:auth[0]!})).json().data.find((s:any)=>s.securityId===securityId);
  assert.equal(Number(holding.quantity),10);assert.equal(Number(holding.averagePurchasePrice),350000);assert.equal((await snapshot()).balance,'6500000');
  // Notification-origin IDs use the same request contract; retry/concurrency must not double debit.
  const notice={...input,securityId:String(securities[1]!.id),quantity:'1',unitPrice:'100',requestId:'a'.repeat(64)};
  const replies=await Promise.all([call(notice),call(notice)]);assert.ok(replies.every(r=>r.statusCode===201),replies.map(r=>r.body).join());assert.equal(replies[0]!.json().data.id,replies[1]!.json().data.id);
  assert.equal(await db.buyTrade.count({where:{accountId,securityId:securities[1]!.id}}),1);
  assert.equal((await call({...input,securityId:String(securities[1]!.id),quantity:'1',unitPrice:'200'})).statusCode,201,'legacy manual buy requires no notification or request ID');
  const foreign=await db.buyTrade.create({data:{accountId:accounts[1]!.id,securityId:securities[0]!.id,boughtAt:new Date(),quantity:1,unitPrice:100}});
  await assert.rejects(authContext.run({userId:users[0]!.id,role:'USER',sessionId:'fixture',mustChangePassword:false},()=>serializable(tx=>tx.cashTransaction.create({data:{accountId,buyTradeId:foreign.id,transactionType:'BUY',transactionDate:new Date(),amount:100,balanceAfter:1}}))),{code:'NOT_FOUND'});
  const stable=await snapshot();assert.equal((await call({...input,requestId:randomUUID(),quantity:'999999'})).statusCode,409);assert.deepEqual(await snapshot(),stable);
  assert.equal((await call({...input,accountId:String(accounts[1]!.id),requestId:randomUUID()})).statusCode,404);assert.deepEqual(await snapshot(),stable);
  assert.equal((await call({...notice,unitPrice:'101'})).statusCode,409);assert.deepEqual(await snapshot(),stable);
  // Fail after both writes in the same production serializable helper, not just input validation.
  await assert.rejects(authContext.run({userId:users[0]!.id,role:'USER',sessionId:'fixture',mustChangePassword:false},()=>serializable(async tx=>{
   const lot=await tx.buyTrade.create({data:{accountId,securityId:securities[0]!.id,boughtAt:new Date(),quantity:1,unitPrice:100}});
   await tx.account.update({where:{id:accountId},data:{cashBalance:1}});
   await tx.cashTransaction.create({data:{accountId,buyTradeId:lot.id,transactionType:'BUY',transactionDate:new Date(),amount:100,balanceAfter:1}});
   throw new Error('fixture failure after writes');
  })),/fixture failure after writes/);assert.deepEqual(await snapshot(),stable);
  console.log('AUTHENTICATED_BUY: first/additional/notice/concurrent/owner/rollback verified');
 }finally{
  await db.cashTransaction.deleteMany({where:{accountId:{in:accounts.map(a=>a.id)}}});await db.tradeRequest.deleteMany({where:{accountId:{in:accounts.map(a=>a.id)}}});await db.buyTrade.deleteMany({where:{accountId:{in:accounts.map(a=>a.id)}}});await db.account.deleteMany({where:{id:{in:accounts.map(a=>a.id)}}});await db.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await db.security.deleteMany({where:{id:{in:securities.map(s=>s.id)}}});await app.close();await login.close();await db.$disconnect();
 }
});
