import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import type {LiveQuote} from '@roxstock/shared/domain/live-quotes';
import {buildApp} from '../src/app.js';
import {passwordHash,randomToken} from '../src/auth/crypto.js';
import {KisLiveService,marketOpen} from '../src/realtime/kis-live.js';
import {LivePriceAlerts} from '../src/realtime/live-price-alerts.js';

test('real DB/auth: private conditions, boundary ledger, restart, pause, concurrency, quotas and history',async()=>{
 const url=new URL(process.env.DATABASE_URL!);
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/roxstock_live_alert_test','dedicated disposable local DB required');
 process.env.AUTH_PUBLIC_ORIGIN='http://127.0.0.1:3000';process.env.KIS_LIVE_ENABLED='false';process.env.KIS_ENABLED='false';
 const db=new PrismaClient(),app=buildApp(),live=new KisLiveService(false),suffix=randomToken().slice(0,10),password='Abc12345!';
 let engine=new LivePriceAlerts(db,live);
 const users=await Promise.all(['ADMIN','USER'].map(async role=>db.authUser.create({data:{email:`price-${suffix}-${role}@example.invalid`,role,verifiedAt:new Date(),passwordHash:await passwordHash(password)}})));
 const securities=await Promise.all(Array.from({length:42},(_,i)=>db.security.create({data:{symbol:String(986700+i),name:`가격 알림 검증 ${i}`,marketType:'KOSPI'}})));
 const headers=await Promise.all(users.map(async u=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:process.env.AUTH_PUBLIC_ORIGIN},payload:{email:u.email,password}});assert.equal(r.statusCode,200,r.body);const cookie=(r.headers['set-cookie'] as string[]).map(v=>v.split(';')[0]).join('; ');return {cookie,origin:process.env.AUTH_PUBLIC_ORIGIN!,'x-csrf-token':/rox_csrf=([^;]+)/.exec(cookie)![1]!};}));
 const request=async(method:'GET'|'POST'|'PATCH'|'DELETE',path='',payload?:unknown,user=0,status=200)=>{const r=await app.inject({method,url:'/api/live-quotes/alerts'+path,headers:headers[user],...(payload===undefined?{}:{payload})});assert.equal(r.statusCode,status,r.body);return r.json().data;};
 const sid=String(securities[0]!.id),body={securityId:sid,market:'KRX',direction:'BELOW',amount:'19000'};
 const events=()=>db.livePriceAlertEvent.findMany({where:{userId:users[0]!.id},orderBy:{id:'asc'}});
 const nextDay=new Date(Date.now()+86400000);nextDay.setUTCHours(0,1,0,0);while(!marketOpen('KRX',nextDay))nextDay.setUTCDate(nextDay.getUTCDate()+1);
 let clock=+nextDay,sequence=0;
 const tick=(price:number,patch:Partial<LiveQuote>={})=>{clock+=1000;return {market:'KRX',symbol:securities[0]!.symbol,price,change:price-20000,rate:(price-20000)/200,source:'KIS',observedAt:new Date(clock).toISOString(),receivedAt:clock,sequence:String(++sequence),...patch} as LiveQuote;};
 const send=async(price:number,patch:Partial<LiveQuote>={})=>{const q=tick(price,patch);await engine.process(q,new Date(clock));return q;};
 try{
  assert.equal((await app.inject({url:'/api/live-quotes/alerts'})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/live-quotes/alerts',headers:{...headers[0],'x-csrf-token':'wrong'},payload:body})).statusCode,403);
  for(const amount of ['0','-5','1.5','NaN'])await request('POST','',{...body,amount},0,400);
  const {id:conditionId}=await request('POST','',body,0,201);
  await request('POST','',body,0,409);
  await request('PATCH','/'+conditionId,{version:1,enabled:false,pause:'30m'},0,400);await request('PATCH','/'+conditionId,{version:1,enabled:false,market:'TOTAL'},0,400);
  assert.equal((await request('GET','',undefined,1)).conditions.length,0);
  await request('PATCH','/'+conditionId,{version:1,enabled:false},1,404);
  await request('DELETE','/'+conditionId,{version:1},1,404);
  assert.equal((await events()).length,0,'saving a condition never evaluates a stored price');
  await engine.reload();
  await send(18000,{source:'REST_SEED' as LiveQuote['source']});await send(18000,{halted:true});await send(18000,{observedAt:new Date(clock-10000).toISOString()});
  assert.equal((await events()).length,0,'no alert for cache, halt or delayed frames');
  await send(19100);await send(19000);const first=(await events())[0]!;
  await send(18000);await send(19100);await send(19000);
  const pending=await request('GET');assert.equal(pending.unreadCount,1);assert.equal(pending.events[0].price,'19000');assert.equal(pending.events[0].observedAt,first.observedAt.toISOString());
  await request('POST','/acknowledge',{eventIds:[String(first.id)]},1);await request('POST','/acknowledge',{securityId:sid},1);assert.equal((await request('GET')).unreadCount,1);
  await request('POST','/acknowledge',{eventIds:[String(first.id)]});await send(18000);assert.equal((await request('GET')).unreadCount,0);
  await engine.close();engine=new LivePriceAlerts(db,live);await engine.reload();
  await send(18000);assert.equal((await request('GET')).unreadCount,0,'restart must not reset the inside latch');
  await send(19100);await send(19000);assert.equal((await request('GET')).unreadCount,1);assert.equal((await events()).length,2,'acknowledged history remains');
  const beforeRace=(await events()).length;await send(19100);
  const second=new LivePriceAlerts(db,live);await second.reload();const q=tick(19000);await Promise.all([engine.process(q,new Date(clock)),second.process(q,new Date(clock))]);await second.close();
  assert.equal((await events()).length,beforeRace,'an existing pending event is immutable across workers');
  let data=await request('GET'),condition=data.conditions[0];
  await request('PATCH','/'+conditionId,{version:condition.version,enabled:false});await request('PATCH','/'+conditionId,{version:condition.version,enabled:true},0,409);
  await engine.reload();await request('POST','/acknowledge',{eventIds:data.events.map((e:any)=>e.id)});await send(19100);await send(19000);assert.equal((await request('GET')).unreadCount,0);
  condition=(await request('GET')).conditions[0];await request('PATCH','/'+conditionId,{version:condition.version,enabled:true});await engine.reload();
  assert.equal((await request('GET')).unreadCount,0);await send(19000);assert.equal((await request('GET')).unreadCount,0,'enable preserves the latch and never evaluates cache');
  await send(19100);
  const until=new Date(clock+3600000);await db.livePriceAlert.update({where:{id:BigInt(conditionId)},data:{pausedUntil:until,eligibleAfter:until}});await engine.reload();
  await send(18000);assert.equal((await request('GET')).unreadCount,0);
  clock=+until+1000;await send(18000);assert.equal((await request('GET')).unreadCount,1,'only a fresh post-expiry tick resumes comparison');
  condition=(await request('GET')).conditions[0];
  for(const pause of ['30m','1h','2h','3h','day']){const start=Date.now();await request('PATCH','/'+conditionId,{version:condition.version,pause});condition=(await request('GET')).conditions[0];const end=Date.parse(condition.pausedUntil);if(pause==='day')assert.equal(new Date(end+9*3600000).toISOString().slice(11,19),'00:00:00');else assert.ok(end>start);}
  await request('PATCH','/'+conditionId,{version:condition.version,pause:'10m'},0,400);
  const variants=await Promise.all([request('POST','',{...body,amount:'18001'},0,201),request('POST','',{...body,amount:'18002'},0,201)]);assert.equal(variants.length,2);
  // Same security, different market: separate condition and frozen event provenance.
  await request('POST','',{...body,market:'TOTAL'},0,201);await engine.reload();await send(18000,{market:'TOTAL'});data=await request('GET');assert.ok(data.events.some((e:any)=>e.market==='TOTAL'));await request('POST','/acknowledge',{securityId:sid});assert.equal((await request('GET')).unreadCount,0);
  condition=data.conditions.find((c:any)=>c.id===conditionId);await request('DELETE','/'+conditionId,{version:condition.version});assert.ok(!(await request('GET')).conditions.some((c:any)=>c.id===conditionId));assert.ok((await events()).some(e=>e.acknowledgedAt),'deletion retains reached history');
  await request('POST','',body,0,201);
  // Shared session budget is enforced, not the user display-list limit of 50.
  for(let i=1;i<=39;i++)await request('POST','',{...body,securityId:String(securities[i]!.id)},0,201);
  await request('POST','',{...body,securityId:String(securities[40]!.id)},0,409);
  const b=await request('POST','',{...body,securityId:sid,amount:'19900'},1,201);assert.ok(b.id);assert.equal((await request('GET','',undefined,1)).conditions.length,1);assert.equal((await request('GET','',undefined,1)).monitor.monitoring,1);
  assert.equal((await db.livePriceAlert.findMany({where:{userId:users[0]!.id,deletedAt:null}})).length,43);
 }finally{
  await engine.close();await live.close();await app.close();
  await db.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await db.security.deleteMany({where:{id:{in:securities.map(s=>s.id)}}});await db.$disconnect();await prisma.$disconnect();
 }
});
