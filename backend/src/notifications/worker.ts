import {randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {defaultTargetConditions,evaluateTargetLots,validateTargetConditions} from '../domain/target-arrival.js';
import {targetTransition} from './policy.js';
import {pushConfigured,sendPush} from './fcm.js';
type Tx=Prisma.TransactionClient;
async function event(tx:Tx,uid:bigint,kind:string,key:string,epoch:number){
 const e=await tx.appNotificationEvent.upsert({where:{identityKey:key},create:{id:randomUUID(),userId:uid,kind,identityKey:key,epoch},update:{}});
 const devices=await tx.appPushDevice.findMany({where:{userId:uid},take:100,select:{id:true,binding:true}});
 for(const d of devices)await tx.appPushDelivery.upsert({where:{eventId_deviceId:{eventId:e.id,deviceId:d.id}},create:{eventId:e.id,deviceId:d.id,binding:d.binding},update:{}});
}
export async function scanNotificationUser(db:PrismaClient,userId:bigint,now=new Date()){
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${userId} FOR UPDATE`;
  const p=await tx.appNotificationPreference.findUnique({where:{userId}});if(!p)return;
  if(p.newsEnabled){
   const items=await tx.stockNewsItem.findMany({where:{id:{gt:p.newsCursor}},orderBy:{id:'asc'},take:100,select:{id:true,collectedAt:true,publishedAt:true,notificationSecurityIds:true,securities:{where:{security:{OR:[{buyTrades:{some:{account:{userId,isActive:true}}}},{accountWatchlistItems:{some:{listType:'WATCHLIST',account:{userId,isActive:true}}}}]}},select:{securityId:true}}}});
   for(const n of items)if(Array.isArray(n.notificationSecurityIds)&&n.securities.some(s=>(n.notificationSecurityIds as string[]).includes(String(s.securityId)))&&p.newsEnabledAt&&n.collectedAt>p.newsEnabledAt&&n.publishedAt>p.newsEnabledAt)await event(tx,userId,'NEWS',`${userId}:NEWS:${n.id}`,p.newsEpoch);
   if(items.length)await tx.appNotificationPreference.update({where:{userId},data:{newsCursor:items.at(-1)!.id}});
  }
  if(p.targetEnabled){
   let cursor=0n;
   for(;;){
    const rows=await tx.buyTrade.findMany({where:{id:{gt:cursor},account:{userId,isActive:true}},orderBy:{id:'asc'},take:100,include:{sellTrades:{select:{quantity:true}},account:{select:{targetArrivalConditions:true}},security:{select:{symbol:true,name:true,marketPrice:{select:{currentPrice:true,priceUpdatedAt:true}}}}}});
    for(const r of rows){
     let conditions;try{conditions=r.account.targetArrivalConditions===null?defaultTargetConditions:validateTargetConditions(r.account.targetArrivalConditions);}catch{continue;}
     const result=evaluateTargetLots([{id:String(r.id),securityId:String(r.securityId),symbol:r.security.symbol,name:r.security.name,boughtAt:r.boughtAt,quantity:r.quantity.toString(),soldQuantities:r.sellTrades.map(s=>s.quantity.toString()),unitPrice:r.unitPrice.toString(),currentPrice:r.security.marketPrice?.currentPrice.toString()??null,priceUpdatedAt:r.security.marketPrice?.priceUpdatedAt??null}],conditions,now);
     if(result.unavailable.length){
      if(!p.targetBaseline)await tx.appTargetNotificationState.upsert({where:{userId_lotId:{userId,lotId:r.id}},create:{userId,lotId:r.id,epoch:p.targetEpoch,matched:false,falseSince:null,lastObservedAt:now},update:{epoch:p.targetEpoch,matched:false,falseSince:null,lastObservedAt:now}});
      continue;
     } // Unknown quotes never rearm an existing event.
     const previous=await tx.appTargetNotificationState.findUnique({where:{userId_lotId:{userId,lotId:r.id}}});
     const next=targetTransition(previous?.epoch===p.targetEpoch?previous:null,result.data.length>0,!p.targetBaseline,now);
     const {fire,...state}=next;await tx.appTargetNotificationState.upsert({where:{userId_lotId:{userId,lotId:r.id}},create:{userId,lotId:r.id,epoch:p.targetEpoch,...state},update:{epoch:p.targetEpoch,...state}});
     if(fire)await event(tx,userId,'TARGET',`${userId}:TARGET:${p.targetEpoch}:${r.id}:${state.generation}`,p.targetEpoch);
    }
    if(rows.length<100)break;cursor=rows.at(-1)!.id;
   }
   if(!p.targetBaseline)await tx.appNotificationPreference.update({where:{userId},data:{targetBaseline:true}});
  }
 },{timeout:60000});
}
export async function deliverNotifications(db:PrismaClient,send=sendPush,now=new Date()){
 if(send===sendPush&&!pushConfigured())return;
 const batch=await db.appPushDelivery.findMany({where:{status:'PENDING',nextAttemptAt:{lte:now}},orderBy:[{nextAttemptAt:'asc'},{id:'asc'}],take:50,select:{id:true,eventId:true}});
 for(const item of batch){
  const e=await db.appNotificationEvent.findUnique({where:{id:item.eventId}});if(!e)continue;
  await db.$transaction(async tx=>{
   // Same lock as settings updates: OFF cannot race a send already in progress.
   await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${e.userId} FOR UPDATE`;
   const d=await tx.appPushDelivery.findUnique({where:{id:item.id}});if(!d||d.status!=='PENDING'||d.nextAttemptAt>now)return;
   const p=await tx.appNotificationPreference.findUnique({where:{userId:e.userId}}),device=await tx.appPushDevice.findUnique({where:{id:d.deviceId}});
   const session=device?await tx.authSession.findFirst({where:{id:device.sessionId,userId:e.userId,revokedAt:null,expiresAt:{gt:new Date()},user:{verifiedAt:{not:null},mustChangePassword:false}},select:{id:true}}):null;
   const enabled=e.kind==='TARGET'?p?.targetEnabled&&p.targetEpoch===e.epoch:p?.newsEnabled&&p.newsEpoch===e.epoch;
   if(!enabled||!device||device.userId!==e.userId||device.binding!==d.binding||!session||now.getTime()-e.createdAt.getTime()>600000){await tx.appPushDelivery.update({where:{id:d.id},data:{status:'CANCELLED',errorCode:'DISABLED_OR_EXPIRED'}});return;}
   const outcome=await send(device.token,{eventId:e.id,kind:e.kind,binding:device.binding,expiresAt:String(e.createdAt.getTime()+600000)});
   if(outcome==='INVALID')await tx.appPushDevice.deleteMany({where:{id:device.id,binding:device.binding}});
   const attempts=d.attempts+1;await tx.appPushDelivery.update({where:{id:d.id},data:{attempts,status:outcome==='SENT'?'SENT':outcome==='INVALID'||attempts>=5?'FAILED':'PENDING',sentAt:outcome==='SENT'?new Date():null,errorCode:outcome==='SENT'?null:outcome,nextAttemptAt:new Date(now.getTime()+Math.min(300,2**attempts*10)*1000)}});
  },{timeout:30000});
 }
}
export function startNotificationWorker(db:PrismaClient,onError:()=>void){
 let busy=false,stopped=false,cursor=0n;
 const tick=async()=>{if(busy||stopped)return;busy=true;try{
  const users=await db.appNotificationPreference.findMany({where:{userId:{gt:cursor},OR:[{targetEnabled:true},{newsEnabled:true}]},select:{userId:true},orderBy:{userId:'asc'},take:20});
  for(const u of users){if(stopped)break;await scanNotificationUser(db,u.userId);cursor=u.userId;}if(users.length<20)cursor=0n;
  await deliverNotifications(db);
 }catch{onError();}finally{busy=false;}};
 const timer=setInterval(()=>void tick(),60000);timer.unref();void tick();return async()=>{stopped=true;clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,50));};
}
