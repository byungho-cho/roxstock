import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {installAuth} from '../src/auth/guard.js';
import {loginSession,cookieNames} from '../src/auth/service.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {notificationRoutes} from '../src/notifications/routes.js';
import {adminUserRoutes} from '../src/routes/admin-users.js';
import {scanNotificationUser,deliverNotifications} from '../src/notifications/worker.js';
test('real DB: notification ownership, OFF fences, epochs, concurrency, news insertion scope, revoked sessions and admin projections',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);process.env.AUTH_PUBLIC_ORIGIN='https://fixture.invalid';
 const users=await Promise.all(['admin','a','b'].map((n,i)=>prisma.authUser.create({data:{email:`push-${randomUUID()}-${n}@example.invalid`,role:i===0?'ADMIN':'USER',verifiedAt:new Date()}})));
 const accounts=await Promise.all(users.map(u=>prisma.account.create({data:{userId:u.id,name:'fixture',brokerName:'TEST',accountNumber:'1234567890',isDefault:true}})));
 const app=Fastify();installAuth(app);app.setErrorHandler((e,_r,reply)=>reply.code(e instanceof ApiError?e.statusCode:500).send({error:{message:e.message}}));await app.register(notificationRoutes,{prefix:'/api'});await app.register(adminUserRoutes,{prefix:'/api'});
 // Obtain real sessions with a route on a separate fixture app (no authentication bypass in tested handlers).
 const login=Fastify();login.get<{Params:{i:string}}>('/:i',async(req,reply)=>{await loginSession(users[Number(req.params.i)]!.id,true,reply);return {};});
 const auth=[];for(let i=0;i<users.length;i++){const r=await login.inject('/'+i);const cookies=r.cookies.map(c=>c.name+'='+c.value).join('; '),csrf=r.cookies.find(c=>c.name===cookieNames.csrf)!.value;auth.push({cookie:cookies,'x-csrf-token':csrf,origin:'https://fixture.invalid','content-type':'application/json'});}
 const call=(i:number,url:string,method:any='GET',payload?:any)=>app.inject({url,method,headers:auth[i]!,...(payload?{payload}:{})});
 const uid=users[1]!.id;const now=new Date();let security:any;
 try{
  assert.equal((await app.inject('/api/admin/users')).statusCode,401);
  assert.equal((await call(1,'/api/admin/users')).statusCode,403);
  assert.equal((await call(1,'/api/admin/users/'+users[2]!.id)).statusCode,403);
  const list=(await call(0,'/api/admin/users')).json().data;assert.ok(list.items.some((r:any)=>r.id===String(uid)));assert.equal(list.items[0].passwordHash,undefined);
  const detail=(await call(0,'/api/admin/users/'+uid)).json().data;assert.equal(detail.accounts[0].accountNumber,'******7890');assert.equal(detail.createdAt,list.items.find((r:any)=>r.id===String(uid)).createdAt);assert.equal(detail.accounts[0].cashBalance,undefined);
  await prisma.authUser.update({where:{id:users[0]!.id},data:{role:'USER'}});assert.equal((await call(0,'/api/admin/users')).statusCode,403);
  assert.deepEqual((await call(1,'/api/notifications/settings')).json().data.targetEnabled,false);
  assert.equal((await call(1,'/api/notifications/settings','PUT',{targetEnabled:true,newsEnabled:true,userId:String(users[2]!.id)})).statusCode,400);
  assert.equal((await call(1,'/api/notifications/settings','PUT',{targetEnabled:true,newsEnabled:true})).statusCode,200);
  assert.equal((await call(2,'/api/notifications/settings')).json().data.newsEnabled,false);
  const install=randomUUID();const device=(await call(1,'/api/notifications/devices','POST',{installationId:install,token:'f'.repeat(150)})).json().data;assert.ok(device.binding);
  const eventId=randomUUID();await prisma.appNotificationEvent.create({data:{id:eventId,userId:uid,kind:'NEWS',identityKey:eventId,epoch:1}});await prisma.appPushDelivery.create({data:{eventId,deviceId:install,binding:device.binding}});
  assert.equal((await call(2,'/api/notifications/events/'+eventId)).statusCode,404);
  assert.equal((await call(1,'/api/notifications/events/'+eventId)).json().data.destination,'/detail/stock-news');
  await call(1,'/api/notifications/settings','PUT',{targetEnabled:true,newsEnabled:false});let sends=0;const sender=async()=>{sends++;return 'SENT' as const;};await deliverNotifications(prisma,sender);assert.equal(sends,0);
  await call(1,'/api/notifications/settings','PUT',{targetEnabled:true,newsEnabled:true});await scanNotificationUser(prisma,uid);assert.equal((await prisma.appNotificationPreference.findUniqueOrThrow({where:{userId:uid}})).targetBaseline,true);
  security=await prisma.security.create({data:{symbol:'P'+Date.now().toString().slice(-10),name:'fixture',marketType:'OTHER'}});await prisma.accountWatchlistItem.create({data:{accountId:accounts[1]!.id,securityId:security.id,listType:'WATCHLIST'}});
  const lot=await prisma.buyTrade.create({data:{accountId:accounts[1]!.id,securityId:security.id,boughtAt:new Date(Date.now()-86400000),quantity:1,unitPrice:100}});
  await prisma.marketPrice.create({data:{securityId:security.id,currentPrice:100,priceUpdatedAt:new Date()}});
  await scanNotificationUser(prisma,uid);assert.equal(await prisma.appNotificationEvent.count({where:{userId:uid,kind:'TARGET'}}),0);
  await prisma.marketPrice.update({where:{securityId:security.id},data:{currentPrice:110,priceUpdatedAt:new Date()}});
  await Promise.all([scanNotificationUser(prisma,uid),scanNotificationUser(prisma,uid)]);
  assert.equal(await prisma.appNotificationEvent.count({where:{userId:uid,kind:'TARGET'}}),1);
  await scanNotificationUser(prisma,uid);assert.equal(await prisma.appNotificationEvent.count({where:{userId:uid,kind:'TARGET'}}),1);
  // Cancel the pending target delivery while leaving news ON; the following send assertion isolates the news event.
  await call(1,'/api/notifications/settings','PUT',{targetEnabled:false,newsEnabled:true});

  const news=await prisma.stockNewsItem.create({data:{provider:'fixture',providerId:randomUUID(),canonicalHash:randomUUID().replaceAll('-','').padEnd(64,'0'),fingerprint:randomUUID().replaceAll('-','').padEnd(64,'0'),title:'fixture',originalUrl:'https://example.invalid/news',sourceName:'fixture',publishedAt:new Date(Date.now()+1000),collectedAt:new Date(Date.now()+1000),materialType:'NEWS',priority:1,notificationSecurityIds:[String(security.id)],securities:{create:{securityId:security.id}}}});
  await Promise.all([scanNotificationUser(prisma,uid),scanNotificationUser(prisma,uid)]);assert.equal(await prisma.appNotificationEvent.count({where:{userId:uid,identityKey:`${uid}:NEWS:${news.id}`}}),1);
  await prisma.stockNewsItem.update({where:{id:news.id},data:{title:'edited'}});await scanNotificationUser(prisma,uid);assert.equal(await prisma.appNotificationEvent.count({where:{userId:uid,identityKey:`${uid}:NEWS:${news.id}`}}),1);
  await Promise.all([deliverNotifications(prisma,sender),deliverNotifications(prisma,sender)]);assert.equal(sends,1);
  const event2=randomUUID();await prisma.appNotificationEvent.create({data:{id:event2,userId:uid,kind:'NEWS',identityKey:event2,epoch:3}});await prisma.appPushDelivery.create({data:{eventId:event2,deviceId:install,binding:device.binding}});await prisma.authSession.updateMany({where:{userId:uid},data:{revokedAt:new Date()}});await deliverNotifications(prisma,sender);assert.equal(sends,1);
  assert.equal(await prisma.adminUserReadAudit.count({where:{actorId:users[0]!.id}}),2);
 }finally{
  await app.close();await login.close();const ids=users.map(u=>u.id);const events=await prisma.appNotificationEvent.findMany({where:{userId:{in:ids}},select:{id:true}});await prisma.appPushDelivery.deleteMany({where:{eventId:{in:events.map(e=>e.id)}}});await prisma.appNotificationEvent.deleteMany({where:{userId:{in:ids}}});await prisma.appPushDevice.deleteMany({where:{userId:{in:ids}}});await prisma.appTargetNotificationState.deleteMany({where:{userId:{in:ids}}});await prisma.appNotificationPreference.deleteMany({where:{userId:{in:ids}}});await prisma.adminUserReadAudit.deleteMany({where:{actorId:{in:ids}}});if(security){await prisma.buyTrade.deleteMany({where:{securityId:security.id}});await prisma.marketPrice.deleteMany({where:{securityId:security.id}});await prisma.stockNewsItem.deleteMany({where:{provider:'fixture',securities:{some:{securityId:security.id}}}});await prisma.accountWatchlistItem.deleteMany({where:{securityId:security.id}});await prisma.security.delete({where:{id:security.id}});}await prisma.account.deleteMany({where:{id:{in:accounts.map(a=>a.id)}}});await prisma.authUser.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();
 }
});
