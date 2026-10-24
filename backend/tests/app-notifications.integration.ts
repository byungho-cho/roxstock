import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {PrismaClient} from '@roxstock/shared/prisma';
import {installAuth} from '../src/auth/guard.js';
import {loginSession,cookieNames} from '../src/auth/service.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {notificationRoutes} from '../src/notifications/routes.js';
import {adminUserRoutes} from '../src/routes/admin-users.js';
import {cashMutationRoutes} from '../src/routes/cash-mutations.js';
import {scanNotificationUser,deliverNotifications} from '../src/notifications/worker.js';

test('real DB: account policies, durable highest daily target, news deduplication, ownership, send fences and dividend idempotency',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);process.env.AUTH_PUBLIC_ORIGIN='https://fixture.invalid';
 const users=await Promise.all(['a','b','admin'].map((n,i)=>prisma.authUser.create({data:{email:`account-push-${randomUUID()}-${n}@example.invalid`,role:i===2?'ADMIN':'USER',verifiedAt:new Date()}})));
 const uid=users[0]!.id;
 const accounts=await Promise.all([uid,uid,users[1]!.id].map((userId,i)=>prisma.account.create({data:{userId,name:`fixture-${i}`,brokerName:'TEST',accountNumber:`123456789${i}`,isDefault:i!==1}})));
 const app=Fastify();installAuth(app);app.setErrorHandler((e,_r,reply)=>reply.code(e instanceof ApiError?e.statusCode:500).send({error:{message:e.message}}));await app.register(notificationRoutes,{prefix:'/api'});await app.register(adminUserRoutes,{prefix:'/api'});await app.register(cashMutationRoutes,{prefix:'/api'});
 const login=Fastify();login.get<{Params:{i:string}}>('/:i',async(req,reply)=>{await loginSession(users[Number(req.params.i)]!.id,true,reply);return {};});
 const headers=[];for(let i=0;i<users.length;i++){const r=await login.inject('/'+i);headers.push({cookie:r.cookies.map(c=>c.name+'='+c.value).join('; '),'x-csrf-token':r.cookies.find(c=>c.name===cookieNames.csrf)!.value,origin:'https://fixture.invalid','content-type':'application/json'});}
 const call=(i:number,url:string,method:any='GET',payload?:any)=>app.inject({url,method,headers:headers[i]!,...(payload?{payload}:{})});
 const settings=()=>call(0,'/api/notifications/settings');
 const patch=(index:number,key:string,value:boolean)=>call(0,'/api/notifications/settings/accounts/'+accounts[index]!.id,'PATCH',{[key]:value});
 const inbox=async()=> (await call(0,'/api/notifications/inbox')).json().data;
 const t=new Date();let security:any;let newsId:bigint|undefined;
 try{
  assert.equal((await app.inject('/api/notifications/settings')).statusCode,401);
  assert.equal((await call(0,'/api/admin/users')).statusCode,403);
  assert.equal((await call(2,'/api/admin/users')).statusCode,200);
  const admin=(await call(2,'/api/admin/users/'+uid)).json().data;assert.equal(admin.accounts[0].cashBalance,undefined);assert.equal(admin.passwordHash,undefined);
  let rows=(await settings()).json().data.accounts;assert.equal(rows.length,2);assert.ok(rows.every((a:any)=>!a.enabled&&!a.buyEnabled));
  assert.equal((await call(1,'/api/notifications/settings/accounts/'+accounts[0]!.id,'PATCH',{enabled:true})).statusCode,404);
  assert.equal((await call(0,'/api/notifications/settings/accounts/'+accounts[0]!.id,'PATCH',{enabled:true,userId:String(users[1]!.id)})).statusCode,400);
  for(const key of ['buyEnabled','sellEnabled','dividendEnabled','newsEnabled','targetEnabled'])assert.equal((await patch(0,key,true)).statusCode,200);
  assert.equal((await settings()).json().data.tradeEnabled,false);await patch(0,'enabled',true);assert.equal((await settings()).json().data.tradeEnabled,true);
  assert.equal((await call(0,'/api/notifications/eligibility?accountId='+accounts[0]!.id+'&kind=BUY')).json().data.allowed,true);assert.equal((await call(1,'/api/notifications/eligibility?accountId='+accounts[0]!.id+'&kind=BUY')).statusCode,404);
  await patch(0,'enabled',false);rows=(await settings()).json().data.accounts;assert.equal(rows.find((a:any)=>a.id===String(accounts[0]!.id)).buyEnabled,true);assert.equal(rows.find((a:any)=>a.id===String(accounts[1]!.id)).buyEnabled,false);await patch(0,'enabled',true);
  assert.equal((await call(0,'/api/notifications/settings','PUT',{targetEnabled:true,newsEnabled:true})).statusCode,409);
  const install=randomUUID();assert.equal((await call(0,'/api/notifications/devices','POST',{installationId:install,token:'t'.repeat(150)})).statusCode,409);
  const binding=(await call(0,'/api/notifications/devices','POST',{installationId:install,token:'t'.repeat(150),policyVersion:3})).json().data.binding;
  security=await prisma.security.create({data:{symbol:'N'+Date.now().toString().slice(-10),name:'fixture',marketType:'OTHER'}});
  for(const a of accounts.slice(0,2))await prisma.account.update({where:{id:a.id},data:{targetArrivalConditions:[{days:10,rate:'10'},{days:20,rate:'15'},{days:30,rate:'20'}]}});
  await prisma.buyTrade.create({data:{accountId:accounts[0]!.id,securityId:security.id,boughtAt:new Date(t.getTime()-86400000),quantity:2,unitPrice:100}});
  await prisma.buyTrade.create({data:{accountId:accounts[0]!.id,securityId:security.id,boughtAt:new Date(t.getTime()-86400000),quantity:1,unitPrice:200}});
  await prisma.buyTrade.create({data:{accountId:accounts[1]!.id,securityId:security.id,boughtAt:new Date(t.getTime()-86400000),quantity:1,unitPrice:100}});
  await prisma.marketPrice.create({data:{securityId:security.id,currentPrice:100,priceUpdatedAt:t}});
  await scanNotificationUser(prisma,uid,t);assert.equal((await inbox()).total,0);
  const price=async(value:number)=>prisma.marketPrice.update({where:{securityId:security.id},data:{currentPrice:value}});
  await price(110);await Promise.all([scanNotificationUser(prisma,uid,t),scanNotificationUser(prisma,uid,t)]);assert.equal((await inbox()).total,1);assert.match((await inbox()).rows[0].detail,/10%/);
  await price(115);await scanNotificationUser(prisma,uid,t);assert.equal((await inbox()).total,1);assert.match((await inbox()).rows[0].detail,/15%/);
  await price(120);await scanNotificationUser(prisma,uid,t);let pending=await inbox();assert.equal(pending.total,1);assert.match(pending.rows[0].detail,/20%/);
  assert.equal(await prisma.appTargetDailyMaximum.count({where:{userId:uid,accountId:accounts[0]!.id}}),1);
  assert.equal((await call(1,'/api/notifications/events/'+pending.rows[0].id)).statusCode,404);
  let sends=0;const send=async()=>{sends++;return 'SENT' as const;};await Promise.all([deliverNotifications(prisma,send,new Date(t.getTime()+10000)),deliverNotifications(prisma,send,new Date(t.getTime()+10000))]);assert.equal(sends,1);
  await price(105);await scanNotificationUser(prisma,uid,t);await price(120);await scanNotificationUser(prisma,uid,t);assert.equal((await inbox()).total,1);await deliverNotifications(prisma,send,new Date(t.getTime()+10000));assert.equal(sends,1);
  await patch(0,'enabled',false);assert.equal((await inbox()).total,0);await patch(0,'enabled',true);assert.equal((await inbox()).total,1);await scanNotificationUser(prisma,uid,t);await deliverNotifications(prisma,send,new Date(t.getTime()+10000));assert.equal(sends,1);
  await call(0,'/api/notifications/events/'+pending.rows[0].id+'/state','POST',{action:'dismiss'});await scanNotificationUser(prisma,uid,t);assert.equal((await inbox()).total,0);
  // Restarted/new Prisma clients use the same persistent ledger; the next KST day can notify again.
  const next=new Date(t.getTime()+86400000);await scanNotificationUser(prisma,uid,next);assert.equal((await inbox()).total,1);await scanNotificationUser(prisma,uid,next);assert.equal((await inbox()).total,1);
  const third=new Date(t.getTime()+172800000);await scanNotificationUser(prisma,uid,third);assert.equal((await inbox()).total,1);
  await patch(1,'targetEnabled',true);await patch(1,'newsEnabled',true);await patch(1,'enabled',true);const fourth=new Date(t.getTime()+259200000);await price(100);await scanNotificationUser(prisma,uid,fourth);await price(120);await scanNotificationUser(prisma,uid,fourth);pending=await inbox();assert.ok(pending.rows.some((e:any)=>e.accountId===String(accounts[1]!.id)));
  // News is displayed under both owned holding accounts but sent once per device.
  for(const e of pending.rows)await call(0,'/api/notifications/events/'+e.id+'/state','POST',{action:'dismiss'});
  const published=new Date(Date.now()+1000),newsNow=new Date(Date.now()+2000);
  const n=await prisma.stockNewsItem.create({data:{provider:'account-notification-fixture',providerId:randomUUID(),canonicalHash:randomUUID().replaceAll('-','').padEnd(64,'0'),fingerprint:randomUUID().replaceAll('-','').padEnd(64,'0'),title:'fixture',originalUrl:'https://example.invalid/news',sourceName:'fixture',publishedAt:published,collectedAt:published,materialType:'NEWS',priority:1,notificationSecurityIds:[String(security.id)],securities:{create:{securityId:security.id}}}});newsId=n.id;
  await Promise.all([scanNotificationUser(prisma,uid,newsNow),scanNotificationUser(prisma,uid,newsNow)]);pending=await inbox();assert.equal(pending.rows.filter((e:any)=>e.kind==='NEWS').length,2);
  const before=sends;await deliverNotifications(prisma,send,newsNow);assert.equal(sends-before,1);
  await patch(0,'newsEnabled',false);assert.equal((await inbox()).rows.filter((e:any)=>e.kind==='NEWS').length,1);await patch(0,'newsEnabled',true);assert.equal((await inbox()).rows.filter((e:any)=>e.kind==='NEWS').length,2);await deliverNotifications(prisma,send,newsNow);assert.equal(sends-before,1);
  const boundary=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate()+6,14,59,59));
  const beforeDays=await prisma.appTargetDailyMaximum.count({where:{userId:uid,accountId:accounts[0]!.id}});await scanNotificationUser(prisma,uid,boundary);await scanNotificationUser(prisma,uid,new Date(+boundary+1000));assert.equal(await prisma.appTargetDailyMaximum.count({where:{userId:uid,accountId:accounts[0]!.id}}),beforeDays+2);assert.equal((await inbox()).rows.filter((e:any)=>e.kind==='TARGET'&&e.accountId===String(accounts[0]!.id)).length,1);
  const restarted=new PrismaClient();try{const count=await prisma.appNotificationEvent.count({where:{userId:uid,kind:'TARGET'}});await scanNotificationUser(restarted,uid,new Date(+boundary+1000));assert.equal(await prisma.appNotificationEvent.count({where:{userId:uid,kind:'TARGET'}}),count);}finally{await restarted.$disconnect();}
  // Revocation fences any newly pending send.
  const eventId=randomUUID();await prisma.appNotificationEvent.create({data:{id:eventId,userId:uid,accountId:accounts[0]!.id,kind:'NEWS',epoch:0,identityKey:eventId}});await prisma.appPushDelivery.create({data:{eventId,deviceId:install,binding}});
  await prisma.authSession.updateMany({where:{userId:uid},data:{revokedAt:new Date()}});await deliverNotifications(prisma,send);assert.equal(sends-before,1);
  assert.equal((await call(0,'/api/notifications/settings')).statusCode,401);
  // Obtain a fresh login for the unchanged idempotent dividend path.
  const session=await login.inject('/0');headers[0]={cookie:session.cookies.map(c=>c.name+'='+c.value).join('; '),'x-csrf-token':session.cookies.find(c=>c.name===cookieNames.csrf)!.value,origin:'https://fixture.invalid','content-type':'application/json'};
  await prisma.cashTransaction.create({data:{accountId:accounts[0]!.id,transactionType:'DEPOSIT',transactionDate:new Date(),amount:1000,feeTaxAmount:0,balanceAfter:1000}});
  const input={requestId:'d'.repeat(64),accountId:String(accounts[0]!.id),securityId:String(security.id),receivedDate:'2026-10-24',grossAmount:'110',netAmount:'100',memo:null};
  const saves=await Promise.all([call(0,'/api/dividends','POST',input),call(0,'/api/dividends','POST',input)]);assert.ok(saves.every(r=>r.statusCode===201));assert.equal(saves[0]!.json().data.id,saves[1]!.json().data.id);assert.equal((await call(0,'/api/dividends','POST',{...input,netAmount:'99'})).statusCode,409);
 }finally{
  await app.close();await login.close();const ids=users.map(u=>u.id),accountIds=accounts.map(a=>a.id),events=await prisma.appNotificationEvent.findMany({where:{userId:{in:ids}},select:{id:true}});
  await prisma.appPushDelivery.deleteMany({where:{eventId:{in:events.map(e=>e.id)}}});await prisma.appNotificationEvent.deleteMany({where:{userId:{in:ids}}});await prisma.appPushDevice.deleteMany({where:{userId:{in:ids}}});await prisma.appTargetDailyMaximum.deleteMany({where:{userId:{in:ids}}});await prisma.accountNotificationPreference.deleteMany({where:{userId:{in:ids}}});await prisma.appTargetNotificationState.deleteMany({where:{userId:{in:ids}}});await prisma.appNotificationPreference.deleteMany({where:{userId:{in:ids}}});await prisma.adminUserReadAudit.deleteMany({where:{actorId:{in:ids}}});
  if(security){await prisma.dividend.deleteMany({where:{securityId:security.id}});await prisma.cashTransaction.deleteMany({where:{accountId:{in:accountIds}}});await prisma.tradeRequest.deleteMany({where:{accountId:{in:accountIds}}});await prisma.buyTrade.deleteMany({where:{securityId:security.id}});await prisma.marketPrice.deleteMany({where:{securityId:security.id}});if(newsId)await prisma.stockNewsItem.delete({where:{id:newsId}});await prisma.security.delete({where:{id:security.id}});}await prisma.account.deleteMany({where:{id:{in:accountIds}}});await prisma.authSession.deleteMany({where:{userId:{in:ids}}});await prisma.authUser.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();
 }
});
