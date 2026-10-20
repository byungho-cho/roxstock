import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {authContext} from '../src/auth/context.js';
import {collectionStatusRoutes} from '../src/routes/collection-status.js';
test('DART task detail uses each authenticated priority scope and keeps exclusions outside normal counts',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);
 const users=await Promise.all(['a','b'].map(n=>prisma.authUser.create({data:{email:`dart-scope-${Date.now()}-${n}@example.invalid`,passwordHash:'test-only',role:'ADMIN',verifiedAt:new Date()}})));
 const stocks=await Promise.all(['991231','991232'].map(symbol=>prisma.security.create({data:{symbol,name:'DART scope fixture',securityType:'STOCK',marketType:'OTHER'}})));
 const accounts=await Promise.all(users.map(user=>prisma.account.create({data:{userId:user.id,name:'scope fixture',brokerName:'TEST'}})));
 const app=Fastify();app.addHook('onRequest',(request,_reply,done)=>{const n=request.headers['x-test-owner']==='b'?1:0;authContext.run({userId:users[n]!.id,role:'ADMIN',sessionId:'isolated-fixture',mustChangePassword:false},done);});
 await app.register(collectionStatusRoutes,{prefix:'/api'});
 try{
  for(let i=0;i<2;i++){
   await prisma.dartCorpMapping.create({data:{securityId:stocks[i]!.id,corpCode:`0099123${i+1}`,stockCode:stocks[i]!.symbol,collectionSymbol:stocks[i]!.symbol,corpName:"scope fixture",syncedAt:new Date()}});
   await prisma.accountWatchlistItem.create({data:{accountId:accounts[i]!.id,securityId:stocks[i]!.id,listType:'WATCHLIST'}});
   await prisma.dartBackfillTask.createMany({data:[{securityId:stocks[i]!.id,fiscalYear:2025,reportCode:'11011',periodType:'ANNUAL',status:'NOT_DUE',nextAttemptAt:new Date('2027-01-01')},{securityId:stocks[i]!.id,fiscalYear:2024,reportCode:'11011',periodType:'ANNUAL',status:'EXCLUDED',errorCode:'PRE_LISTING_POLICY_EXCLUDED',errorMessage:'상장 전 수집 제외'}]});
  }
  for(const [index,owner] of ['a','b'].entries())for(const status of ['NOT_DUE','EXCLUDED']){
   const r=await app.inject({url:`/api/collection/dart/tasks?status=${status}&scope=priority`,headers:{'x-test-owner':owner}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.total,1);assert.deepEqual(r.json().data.items.map((v:any)=>v.symbol),[stocks[index]!.symbol]);assert.equal(r.json().data.nextOffset,null);
  }
  assert.equal((await app.inject('/api/collection/dart/tasks?status=ALL')).statusCode,400);
  assert.equal((await app.inject('/api/collection/dart/tasks?status=SUCCESS&offset=-1')).statusCode,400);
 }finally{
  await app.close();await prisma.accountWatchlistItem.deleteMany({where:{accountId:{in:accounts.map(a=>a.id)}}});await prisma.account.deleteMany({where:{id:{in:accounts.map(a=>a.id)}}});await prisma.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await prisma.security.deleteMany({where:{id:{in:stocks.map(s=>s.id)}}});await prisma.$disconnect();
 }
});
