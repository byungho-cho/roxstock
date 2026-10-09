import assert from 'node:assert/strict';import test from 'node:test';
import {buildApp} from '../src/app.js';
import {prisma as db} from '../src/lib/prisma.js';import {deleteEmptyAccount} from '../src/domain/account-delete.js';import {accountConnections} from '../src/domain/account-connections.js';import {Prisma} from '../src/generated/prisma/index.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_phase15_test'))throw Error('Isolated phase15 database required');
const tx=<T>(work:(t:Prisma.TransactionClient)=>Promise<T>)=>db.$transaction(work,{isolationLevel:'Serializable',timeout:10000});
test('empty account deletion, default transfer, last account, FK concurrent insert protection',async()=>{
 try{
 const app=buildApp();
 try {
  const payload={name:'API test',brokerName:'API broker',accountNumber:'123-456'};
  for(const accountNumber of ['', ' - ', null])assert.equal((await app.inject({method:'POST',url:'/api/accounts',payload:{...payload,accountNumber}})).statusCode,400);
  const created=await app.inject({method:'POST',url:'/api/accounts',payload});assert.equal(created.statusCode,201);const apiId=created.json().data.id;
  assert.equal((await app.inject({method:'POST',url:'/api/accounts',payload:{...payload,accountNumber:'123 456'}})).statusCode,409);
  assert.equal((await app.inject({method:'PATCH',url:'/api/accounts/'+apiId,payload:{accountNumber:'123456'}})).statusCode,200);
  assert.equal((await app.inject({method:'PATCH',url:'/api/accounts/'+apiId,payload:{accountNumber:' - '}})).statusCode,400);
  assert.equal((await db.account.findUniqueOrThrow({where:{id:BigInt(apiId)}})).normalizedAccountNumber,'123456');
  await db.cashTransaction.create({data:{accountId:BigInt(apiId),transactionType:'DEPOSIT',transactionDate:new Date(),amount:100,balanceAfter:100}});
  await db.tradeRequest.create({data:{accountId:BigInt(apiId),requestId:'phase15-test',operation:'BUY',requestHash:'0'.repeat(64),response:{}}});
  assert.equal((await app.inject({method:'DELETE',url:'/api/accounts/'+apiId})).statusCode,409);
  process.env.ENABLE_ACCOUNT_DATA_RESET='true';
  assert.equal((await app.inject({method:'POST',url:'/api/accounts/'+apiId+'/reset',payload:{confirmation:'wrong'}})).statusCode,400);
  // A late failure after earlier deletes must roll the whole reset back.
  await db.$executeRawUnsafe("CREATE TRIGGER phase15_reset_failure BEFORE DELETE ON cash_transactions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated rollback test'");
  try {
   assert.equal((await app.inject({method:'POST',url:'/api/accounts/'+apiId+'/reset',payload:{confirmation:payload.name}})).statusCode,500);
   assert.equal(await db.tradeRequest.count({where:{accountId:BigInt(apiId)}}),1);
   assert.equal(await db.cashTransaction.count({where:{accountId:BigInt(apiId)}}),1);
  } finally {await db.$executeRawUnsafe('DROP TRIGGER phase15_reset_failure');}
  assert.equal((await app.inject({method:'POST',url:'/api/accounts/'+apiId+'/reset',payload:{confirmation:payload.name}})).statusCode,200);
  assert.equal((await app.inject({method:'GET',url:'/api/accounts/'+apiId+'/data-state'})).json().data.hasData,false);
  assert.equal((await app.inject({method:'DELETE',url:'/api/accounts/'+apiId})).statusCode,200);
  assert.equal((await app.inject({method:'DELETE',url:'/api/accounts/'+apiId})).statusCode,404);
  assert.equal((await app.inject({method:'DELETE',url:'/api/accounts/invalid'})).statusCode,400);
 } finally {await app.close();}
 const create=(name:string,isDefault=false)=>db.account.create({data:{name,brokerName:'TEST',accountNumber:name,normalizedAccountNumber:name,isDefault}});
 const a=await create('phase15-a',true),b=await create('phase15-b');
 await db.cashTransaction.create({data:{accountId:a.id,transactionType:'DEPOSIT',transactionDate:new Date(),amount:100,balanceAfter:100}});
 assert.equal((await accountConnections(db,a.id)).hasData,true);
 await assert.rejects(tx(t=>deleteEmptyAccount(t,a.id)),(e:any)=>e.code==='ACCOUNT_HAS_DATA');
 assert.ok(await db.account.findUnique({where:{id:a.id}}));
 await db.cashTransaction.deleteMany({where:{accountId:a.id}});
 const result=await tx(t=>deleteEmptyAccount(t,a.id));assert.equal(result.nextAccountId,String(b.id));assert.equal((await db.account.findUniqueOrThrow({where:{id:b.id}})).isDefault,true);
 const c=await create('phase15-c');let release!:()=>void,locked!:()=>void;const hold=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>locked=r);
 const deleting=tx(async t=>{await t.$queryRaw`SELECT id FROM accounts WHERE id = ${c.id} FOR UPDATE`;locked();await hold;return deleteEmptyAccount(t,c.id)});await ready;
 const insert=db.cashTransaction.create({data:{accountId:c.id,transactionType:'DEPOSIT',transactionDate:new Date(),amount:1,balanceAfter:1}}).then(()=>({ok:true}),()=>({ok:false}));await new Promise(r=>setTimeout(r,50));release();await deleting;assert.equal((await insert).ok,false);
 const d=await create('phase15-d');await db.cashTransaction.create({data:{accountId:d.id,transactionType:'DEPOSIT',transactionDate:new Date(),amount:1,balanceAfter:1}});await assert.rejects(tx(t=>deleteEmptyAccount(t,d.id)));await db.cashTransaction.deleteMany({where:{accountId:d.id}});await tx(t=>deleteEmptyAccount(t,d.id));
 assert.equal((await tx(t=>deleteEmptyAccount(t,b.id))).nextAccountId,null);assert.equal(await db.account.count(),0);
 }finally{await db.$disconnect();}
});
