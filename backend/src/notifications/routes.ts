import type {FastifyInstance} from 'fastify';
import {randomUUID,createHash} from 'node:crypto';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {pushConfigured} from './fcm.js';
import {notificationDestination} from './policy.js';
const bad=()=>new ApiError(400,'INVALID_NOTIFICATION_INPUT','알림 설정 값을 확인해 주세요.');
const view=(p:{targetEnabled:boolean;newsEnabled:boolean;tradeEnabled?:boolean}|null)=>({tradeEnabled:p?.tradeEnabled??false,targetEnabled:p?.targetEnabled??false,newsEnabled:p?.newsEnabled??false,pushConfigured:pushConfigured()});
export async function notificationRoutes(app:FastifyInstance){
 app.get('/notifications/settings',async req=>({data:view(await prisma.appNotificationPreference.findUnique({where:{userId:req.auth!.userId}}))}));
 app.put<{Body:unknown}>('/notifications/settings',async req=>{
  const body=req.body as Record<string,unknown>;if(!body||Object.keys(body).some(k=>!['targetEnabled','newsEnabled','tradeEnabled'].includes(k))||(body.tradeEnabled!==undefined&&typeof body.tradeEnabled!=='boolean')||typeof body.targetEnabled!=='boolean'||typeof body.newsEnabled!=='boolean')throw bad();
  const uid=req.auth!.userId;
  // Ensure existence before the transaction. No consistent read may precede its locking read.
  await prisma.appNotificationPreference.createMany({data:[{userId:uid}],skipDuplicates:true});
  return prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${uid} FOR UPDATE`;
   const p=(await tx.appNotificationPreference.findUnique({where:{userId:uid}}))!;
   const data:any={...(body.tradeEnabled!==undefined?{tradeEnabled:body.tradeEnabled}:{}),targetEnabled:body.targetEnabled,newsEnabled:body.newsEnabled};
   if(p.targetEnabled!==body.targetEnabled){data.targetEpoch={increment:1};data.targetBaseline=false;}
   if(p.newsEnabled!==body.newsEnabled){data.newsEpoch={increment:1};data.newsCursor=(await tx.stockNewsItem.aggregate({_max:{id:true}}))._max.id??0n;data.newsEnabledAt=new Date();}
   const saved=await tx.appNotificationPreference.update({where:{userId:uid},data});return {data:view(saved)};
  });
 });
 app.get('/notifications/inbox',async req=>{
  const uid=req.auth!.userId,p=await prisma.appNotificationPreference.findUnique({where:{userId:uid}});
  const kinds=[...(p?.newsEnabled?['NEWS']:[]),...(p?.targetEnabled?['TARGET']:[])];
  const where={userId:uid,readAt:null,dismissedAt:null,AND:[{OR:[...(p?.newsEnabled?[{kind:'NEWS',epoch:p.newsEpoch}]:[]),...(p?.targetEnabled?[{kind:'TARGET',epoch:p.targetEpoch}]:[])]}],kind:{in:kinds},OR:[{accountId:null},{accountId:{in:(await prisma.account.findMany({where:{userId:uid,isActive:true},select:{id:true}})).map(a=>a.id)}}]};
  const [rows,total]=await Promise.all([prisma.appNotificationEvent.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:100,select:{id:true,kind:true,title:true,detail:true,createdAt:true,accountId:true}}),prisma.appNotificationEvent.count({where})]);
  return {data:{rows:rows.map(r=>({...r,accountId:r.accountId?String(r.accountId):null})),total}};
 });
 app.post<{Params:{eventId:string};Body:{action?:string}}>('/notifications/events/:eventId/state',async req=>{
  if(!['read','dismiss'].includes(req.body?.action??''))throw bad();
  const changed=await prisma.appNotificationEvent.updateMany({where:{id:req.params.eventId,userId:req.auth!.userId},data:req.body.action==='read'?{readAt:new Date()}:{dismissedAt:new Date()}});
  if(!changed.count)throw new ApiError(404,'NOT_FOUND','알림을 찾을 수 없습니다.');return {data:{updated:true}};
 });
 app.post<{Body:{installationId?:unknown;token?:unknown}}>('/notifications/devices',async req=>{
  const {installationId,token}=req.body??{};if(typeof installationId!=='string'||!/^[-a-zA-Z0-9]{20,64}$/.test(installationId)||typeof token!=='string'||token.length<40||token.length>2048||/\s/.test(token))throw bad();
  let binding:string=randomUUID();const tokenHash=createHash('sha256').update(token).digest('hex');
  await prisma.$transaction(async tx=>{
   const previous=await tx.appPushDevice.findUnique({where:{id:installationId}});
   if(previous?.userId===req.auth!.userId&&previous.sessionId===req.auth!.sessionId&&previous.tokenHash===tokenHash)binding=previous.binding;
   // Transfer token atomically; an old user's registration must not remain valid.
   await tx.appPushDevice.deleteMany({where:{tokenHash,id:{not:installationId}}});
   await tx.appPushDevice.upsert({where:{id:installationId},create:{id:installationId,userId:req.auth!.userId,sessionId:req.auth!.sessionId,token,tokenHash,binding},update:{userId:req.auth!.userId,sessionId:req.auth!.sessionId,token,tokenHash,binding}});
  });return {data:{binding}};
 });
 app.delete<{Params:{installationId:string}}>('/notifications/devices/:installationId',async req=>{await prisma.appPushDevice.deleteMany({where:{id:req.params.installationId,userId:req.auth!.userId,sessionId:req.auth!.sessionId}});return {data:{removed:true}};});
 app.get<{Params:{eventId:string}}>('/notifications/events/:eventId',async req=>{
  if(!/^[a-f0-9-]{36}$/.test(req.params.eventId))throw bad();const event=await prisma.appNotificationEvent.findFirst({where:{id:req.params.eventId,userId:req.auth!.userId}});if(!event)throw new ApiError(404,'NOT_FOUND','알림을 찾을 수 없습니다.');if(event.accountId&&!await prisma.account.findFirst({where:{id:event.accountId,userId:req.auth!.userId,isActive:true},select:{id:true}}))throw new ApiError(404,'NOT_FOUND','알림의 대상 계좌를 찾을 수 없습니다.');return {data:{destination:notificationDestination(event.kind),accountId:event.accountId?String(event.accountId):null}};
 });
}
