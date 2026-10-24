import {randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {defaultTargetConditions,evaluateTargetLots,seoulDate,validateTargetConditions,type TargetCondition} from '../domain/target-arrival.js';
import {effective,ensureNotificationAccounts} from './accounts.js';
import {pushConfigured,sendPush} from './fcm.js';
type Tx=Prisma.TransactionClient;
async function deliveries(tx:Tx,userId:bigint,eventId:string){
 const devices=await tx.appPushDevice.findMany({where:{userId},take:100,select:{id:true,binding:true}});
 for(const d of devices)await tx.appPushDelivery.upsert({where:{eventId_deviceId:{eventId,deviceId:d.id}},create:{eventId,deviceId:d.id,binding:d.binding},update:{}});
}
export async function scanNotificationUser(db:PrismaClient,userId:bigint,now=new Date()){
 await ensureNotificationAccounts(db,userId);
 await db.$transaction(async tx=>{
  // Settings, scans, and sends share this lock across processes.
  await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${userId} FOR UPDATE`;
  const p=await tx.appNotificationPreference.findUniqueOrThrow({where:{userId}});
  const accounts=await tx.account.findMany({where:{userId,isActive:true},orderBy:[{isDefault:'desc'},{displayOrder:'asc'},{id:'asc'}],select:{id:true,targetArrivalConditions:true}});
  const preferences=await tx.accountNotificationPreference.findMany({where:{userId}});
  const settings=new Map(preferences.map(p=>[String(p.accountId),p]));
  // Advance while OFF too; timestamp fences prevent historical news replay.
  const news=await tx.stockNewsItem.findMany({where:{id:{gt:p.newsCursor}},orderBy:{id:'asc'},take:100,select:{id:true,title:true,collectedAt:true,publishedAt:true,notificationSecurityIds:true,securities:{select:{securityId:true,security:{select:{name:true}}}}}});
  for(const n of news){
   if(!Array.isArray(n.notificationSecurityIds))continue;
   const sources=n.securities.filter(s=>(n.notificationSecurityIds as string[]).includes(String(s.securityId)));
   let pushEvent:string|undefined;
   for(const a of accounts){
    const preference=settings.get(String(a.id));
    if(!effective(preference,'NEWS')||!preference||n.collectedAt<=preference.newsEnabledAt||n.publishedAt<=preference.newsEnabledAt)continue;
    const lots=await tx.buyTrade.findMany({where:{accountId:a.id,securityId:{in:sources.map(s=>s.securityId)}},select:{securityId:true,quantity:true,sellTrades:{select:{quantity:true}}}});
    const held=new Set(lots.filter(l=>l.quantity.minus(l.sellTrades.reduce((v,s)=>v.plus(s.quantity),new Prisma.Decimal(0))).gt(0)).map(l=>String(l.securityId)));
    const names=sources.filter(s=>held.has(String(s.securityId))).map(s=>s.security.name);if(!names.length)continue;
    const key=`${userId}:NEWS:${n.id}:${a.id}`;
    const e=await tx.appNotificationEvent.upsert({where:{identityKey:key},create:{id:randomUUID(),userId,accountId:a.id,newsId:n.id,kind:'NEWS',identityKey:key,epoch:0,title:names.join(' · ').slice(0,160),detail:n.title.slice(0,500),createdAt:now},update:{}});
    pushEvent??=e.id;
   }
   // Separate inbox rows, one system notification per user/article/device.
   if(pushEvent)await deliveries(tx,userId,pushEvent);
  }
  if(news.length)await tx.appNotificationPreference.update({where:{userId},data:{newsCursor:news.at(-1)!.id}});
  const day=seoulDate(now);
  for(const a of accounts){
   const preference=settings.get(String(a.id));if(!preference)continue;
   let conditions:TargetCondition[];try{conditions=a.targetArrivalConditions===null?defaultTargetConditions:validateTargetConditions(a.targetArrivalConditions);}catch{continue;}
   const lots=await tx.buyTrade.findMany({where:{accountId:a.id},include:{sellTrades:{select:{quantity:true}},security:{select:{symbol:true,name:true,marketPrice:{select:{currentPrice:true,priceUpdatedAt:true}}}}}});
   const maxima=new Map<string,{securityId:bigint;name:string;condition:TargetCondition}>();
   for(const lot of lots)for(const condition of conditions){
    const result=evaluateTargetLots([{id:String(lot.id),securityId:String(lot.securityId),symbol:lot.security.symbol,name:lot.security.name,boughtAt:lot.boughtAt,quantity:lot.quantity.toString(),soldQuantities:lot.sellTrades.map(s=>s.quantity.toString()),unitPrice:lot.unitPrice.toString(),currentPrice:lot.security.marketPrice?.currentPrice.toString()??null,priceUpdatedAt:lot.security.marketPrice?.priceUpdatedAt??null}],[condition],now);
    if(!result.data.length)continue;
    const key=String(lot.securityId),prior=maxima.get(key);
    if(!prior||new Prisma.Decimal(condition.rate).gt(prior.condition.rate))maxima.set(key,{securityId:lot.securityId,name:lot.security.name,condition});
   }
   for(const {securityId,name,condition} of maxima.values()){
    const identity={userId,accountId:a.id,securityId,day};
    const prior=await tx.appTargetDailyMaximum.findUnique({where:{userId_accountId_securityId_day:identity}});
    if(prior&&prior.rate.gte(condition.rate))continue;
    await tx.appTargetDailyMaximum.upsert({where:{userId_accountId_securityId_day:identity},create:{...identity,rate:condition.rate},update:{rate:condition.rate}});
    // OFF and first-enable baselines acknowledge current thresholds without dispatch.
    if(!effective(preference,'TARGET')||!preference.targetBaseline)continue;
    const previous=await tx.appNotificationEvent.findMany({where:{userId,accountId:a.id,securityId,kind:'TARGET',readAt:null,dismissedAt:null},select:{id:true}});
    await tx.appPushDelivery.updateMany({where:{eventId:{in:previous.map(e=>e.id)},status:'PENDING'},data:{status:'CANCELLED',errorCode:'HIGHER_TARGET'}});
    await tx.appNotificationEvent.updateMany({where:{id:{in:previous.map(e=>e.id)}},data:{dismissedAt:now}});
    const e=await tx.appNotificationEvent.create({data:{id:randomUUID(),userId,accountId:a.id,securityId,targetRate:condition.rate,kind:'TARGET',identityKey:`${userId}:TARGETMAX:${a.id}:${securityId}:${day}:${condition.rate}`,epoch:0,title:name,detail:`${condition.days}일 이내 · ${condition.rate}% 목표 도래`,createdAt:now}});
    await deliveries(tx,userId,e.id);
   }
   if(effective(preference,'TARGET')&&!preference.targetBaseline)await tx.accountNotificationPreference.update({where:{userId_accountId:{userId,accountId:a.id}},data:{targetBaseline:true}});
  }
 },{timeout:60000});
}
export async function deliverNotifications(db:PrismaClient,send=sendPush,now=new Date()){
 if(send===sendPush&&!pushConfigured())return;
 const batch=await db.appPushDelivery.findMany({where:{status:'PENDING',nextAttemptAt:{lte:now}},orderBy:[{nextAttemptAt:'asc'},{id:'asc'}],take:50,select:{id:true,eventId:true}});
 for(const item of batch){
  const original=await db.appNotificationEvent.findUnique({where:{id:item.eventId}});if(!original)continue;
  await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${original.userId} FOR UPDATE`;
   const d=await tx.appPushDelivery.findUnique({where:{id:item.id}});if(!d||d.status!=='PENDING'||d.nextAttemptAt>now)return;
   const e=await tx.appNotificationEvent.findUniqueOrThrow({where:{id:item.eventId}});
   const preference=e.accountId?await tx.accountNotificationPreference.findUnique({where:{userId_accountId:{userId:e.userId,accountId:e.accountId}}}):null;
   const account=e.accountId?await tx.account.findFirst({where:{id:e.accountId,userId:e.userId,isActive:true},select:{id:true}}):null;
   const device=await tx.appPushDevice.findUnique({where:{id:d.deviceId}});
   const session=device?await tx.authSession.findFirst({where:{id:device.sessionId,userId:e.userId,revokedAt:null,expiresAt:{gt:new Date()},user:{verifiedAt:{not:null},mustChangePassword:false}},select:{id:true}}):null;
   if(e.readAt||e.dismissedAt||!account||!effective(preference,e.kind)||!device||device.policyVersion<3||device.userId!==e.userId||device.binding!==d.binding||!session||now.getTime()-e.createdAt.getTime()>600000){await tx.appPushDelivery.update({where:{id:d.id},data:{status:'CANCELLED',errorCode:'DISABLED_OR_EXPIRED'}});return;}
   const outcome=await send(device.token,{eventId:e.id,kind:e.kind,accountId:String(e.accountId),securityId:String(e.securityId??e.newsId??e.id),targetRate:e.targetRate?.toString()??'',targetDay:seoulDate(e.createdAt),binding:device.binding,expiresAt:String(e.createdAt.getTime()+600000)});
   if(outcome==='INVALID')await tx.appPushDevice.deleteMany({where:{id:device.id,binding:device.binding}});
   const attempts=d.attempts+1;await tx.appPushDelivery.update({where:{id:d.id},data:{attempts,status:outcome==='SENT'?'SENT':outcome==='INVALID'||attempts>=5?'FAILED':'PENDING',sentAt:outcome==='SENT'?new Date():null,errorCode:outcome==='SENT'?null:outcome,nextAttemptAt:new Date(now.getTime()+Math.min(300,2**attempts*10)*1000)}});
  },{timeout:30000});
 }
}
export function startNotificationWorker(db:PrismaClient,onError:()=>void){
 let busy=false,stopped=false,cursor=0n;
 const tick=async()=>{if(busy||stopped)return;busy=true;try{
  const users=await db.appNotificationPreference.findMany({where:{userId:{gt:cursor}},select:{userId:true},orderBy:{userId:'asc'},take:20});
  for(const u of users){if(stopped)break;await scanNotificationUser(db,u.userId);cursor=u.userId;}if(users.length<20)cursor=0n;
  await deliverNotifications(db);
 }catch{onError();}finally{busy=false;}};
 const timer=setInterval(()=>void tick(),60000);timer.unref();void tick();return async()=>{stopped=true;clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,50));};
}
