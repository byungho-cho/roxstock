import type {FastifyInstance} from 'fastify';
import {randomUUID,createHash} from 'node:crypto';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {pushConfigured} from './fcm.js';
import {notificationDestination} from './policy.js';
const bad=()=>new ApiError(400,'INVALID_NOTIFICATION_INPUT','알림 설정 값을 확인해 주세요.');
const view=(p:{targetEnabled:boolean;newsEnabled:boolean}|null)=>({targetEnabled:p?.targetEnabled??false,newsEnabled:p?.newsEnabled??false,pushConfigured:pushConfigured()});
export async function notificationRoutes(app:FastifyInstance){
 app.get('/notifications/settings',async req=>({data:view(await prisma.appNotificationPreference.findUnique({where:{userId:req.auth!.userId}}))}));
 app.put<{Body:unknown}>('/notifications/settings',async req=>{
  const body=req.body as Record<string,unknown>;if(!body||Object.keys(body).some(k=>!['targetEnabled','newsEnabled'].includes(k))||typeof body.targetEnabled!=='boolean'||typeof body.newsEnabled!=='boolean')throw bad();
  const uid=req.auth!.userId;
  return prisma.$transaction(async tx=>{
   await tx.appNotificationPreference.upsert({where:{userId:uid},create:{userId:uid},update:{}});
   await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${uid} FOR UPDATE`;
   const p=(await tx.appNotificationPreference.findUnique({where:{userId:uid}}))!;
   const data:any={targetEnabled:body.targetEnabled,newsEnabled:body.newsEnabled};
   if(p.targetEnabled!==body.targetEnabled){data.targetEpoch={increment:1};data.targetBaseline=false;}
   if(p.newsEnabled!==body.newsEnabled){data.newsEpoch={increment:1};data.newsCursor=(await tx.stockNewsItem.aggregate({_max:{id:true}}))._max.id??0n;data.newsEnabledAt=new Date();}
   const saved=await tx.appNotificationPreference.update({where:{userId:uid},data});return {data:view(saved)};
  });
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
  if(!/^[a-f0-9-]{36}$/.test(req.params.eventId))throw bad();const event=await prisma.appNotificationEvent.findFirst({where:{id:req.params.eventId,userId:req.auth!.userId}});if(!event)throw new ApiError(404,'NOT_FOUND','알림을 찾을 수 없습니다.');return {data:{destination:notificationDestination(event.kind)}};
 });
}
