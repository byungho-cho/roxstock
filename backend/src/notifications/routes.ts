import type {FastifyInstance} from 'fastify';
import {randomUUID,createHash} from 'node:crypto';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {pushConfigured} from './fcm.js';
import {notificationDestination} from './policy.js';
import {effective,ensureNotificationAccounts,highestPending,notificationFields,type NotificationField} from './accounts.js';
import type {Prisma} from '@roxstock/shared/prisma';
const bad=()=>new ApiError(400,'INVALID_NOTIFICATION_INPUT','알림 설정 값을 확인해 주세요.');
const view=(p:{targetEnabled:boolean;newsEnabled:boolean;tradeEnabled?:boolean}|null)=>({tradeEnabled:p?.tradeEnabled??false,targetEnabled:p?.targetEnabled??false,newsEnabled:p?.newsEnabled??false,pushConfigured:pushConfigured()});
async function settingsView(tx:Prisma.TransactionClient,userId:bigint){
 const accounts=await tx.account.findMany({where:{userId,isActive:true},orderBy:[{isDefault:'desc'},{displayOrder:'asc'},{id:'asc'}],select:{id:true,name:true,brokerName:true,accountNumber:true,isDefault:true}});
 const preferences=await tx.accountNotificationPreference.findMany({where:{userId,accountId:{in:accounts.map(a=>a.id)}}});
 const {policyRevision}=await tx.appNotificationPreference.findUniqueOrThrow({where:{userId}});
 return {...view(null),policyRevision,tradeEnabled:preferences.some(p=>effective(p,'BUY')||effective(p,'SELL')||effective(p,'DIVIDEND')),newsEnabled:preferences.some(p=>effective(p,'NEWS')),targetEnabled:preferences.some(p=>effective(p,'TARGET')),accounts:accounts.map(a=>{const p=preferences.find(p=>p.accountId===a.id);return {...a,id:String(a.id),...Object.fromEntries(notificationFields.map(k=>[k,p?.[k]??false]))};})};
}
export async function notificationRoutes(app:FastifyInstance){
 app.get<{Querystring:{accountId?:string;kind?:string;eventId?:string}}>('/notifications/eligibility',async req=>{
  const {accountId,kind,eventId}=req.query;if(!accountId||!/^[1-9][0-9]{0,19}$/.test(accountId)||!['BUY','SELL','DIVIDEND','NEWS','TARGET'].includes(kind??'')||(eventId!==undefined&&!/^[a-f0-9-]{36}$/.test(eventId)))throw bad();
  const userId=req.auth!.userId;
  const account=await prisma.account.findFirst({where:{id:BigInt(accountId),userId,isActive:true},select:{id:true}});
  const p=account?await prisma.accountNotificationPreference.findUnique({where:{userId_accountId:{userId,accountId:account.id}}}):null;
  const pending=eventId?await prisma.appNotificationEvent.findFirst({where:{id:eventId,userId,accountId:BigInt(accountId),kind,readAt:null,dismissedAt:null},select:{id:true}}):true;
  return {data:{allowed:!!account&&!!pending&&effective(p,kind!)}};
 });
 app.get('/notifications/settings',async req=>{
  const userId=req.auth!.userId;await ensureNotificationAccounts(prisma,userId);
  return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${userId} FOR UPDATE`;
  return {data:await settingsView(tx,userId)};
  });
 });
 app.patch<{Params:{accountId:string};Body:unknown}>('/notifications/settings/accounts/:accountId',async req=>{
  const body=req.body as Record<string,unknown>;
  if(!/^[1-9][0-9]{0,19}$/.test(req.params.accountId)||!body||Object.keys(body).length!==1)throw bad();
  const key=Object.keys(body)[0] as NotificationField;if(!notificationFields.includes(key)||typeof body[key]!=='boolean')throw bad();
  const userId=req.auth!.userId,accountId=BigInt(req.params.accountId);
  await ensureNotificationAccounts(prisma,userId);
  return prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${userId} FOR UPDATE`;
   if(!await tx.account.findFirst({where:{id:accountId,userId,isActive:true}}))throw new ApiError(404,'NOT_FOUND','계좌를 찾을 수 없습니다.');
   const p=await tx.accountNotificationPreference.findUniqueOrThrow({where:{userId_accountId:{userId,accountId}}});
   const next={...p,[key]:body[key] as boolean};
   const data:any={[key]:body[key]};
   if(effective(p,'TARGET')!==effective(next,'TARGET'))data.targetBaseline=false;
   if(effective(p,'NEWS')!==effective(next,'NEWS'))data.newsEnabledAt=new Date();
   if(!effective(p,'NEWS')&&effective(next,'NEWS')){
    const other=await tx.accountNotificationPreference.findMany({where:{userId,accountId:{not:accountId}}});
    if(!other.some(p=>effective(p,'NEWS')))await tx.appNotificationPreference.update({where:{userId},data:{newsCursor:(await tx.stockNewsItem.aggregate({_max:{id:true}}))._max.id??0n}});
   }
   await tx.accountNotificationPreference.update({where:{userId_accountId:{userId,accountId}},data});
   const {policyRevision}=await tx.appNotificationPreference.update({where:{userId},data:{policyRevision:{increment:1}},select:{policyRevision:true}});
   const disabled=['TARGET','NEWS'].filter(kind=>!effective(next,kind));
   const events=await tx.appNotificationEvent.findMany({where:{userId,accountId,kind:{in:disabled}},select:{id:true}});
   await tx.appPushDelivery.updateMany({where:{eventId:{in:events.map(e=>e.id)},status:'PENDING'},data:{status:'CANCELLED',errorCode:'ACCOUNT_DISABLED'}});
   return {data:{...await settingsView(tx,userId),accountId:String(accountId),policyRevision}};
  });
 });
 app.put('/notifications/settings',async()=>{throw new ApiError(409,'ACCOUNT_SETTINGS_REQUIRED','계좌별 알림 설정 화면에서 변경해 주세요.');});
 app.get('/notifications/inbox',async req=>{
  const uid=req.auth!.userId,accounts=await ensureNotificationAccounts(prisma,uid),ids=accounts.map(a=>a.id);
  const preferences=await prisma.accountNotificationPreference.findMany({where:{userId:uid,accountId:{in:ids}}});
  const clauses=preferences.flatMap(p=>['NEWS','TARGET'].filter(k=>effective(p,k)).map(kind=>({accountId:p.accountId,kind})));
  if(!clauses.length)return {data:{rows:[],total:0}};
  const pending=await prisma.appNotificationEvent.findMany({where:{userId:uid,readAt:null,dismissedAt:null,OR:clauses},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true,kind:true,title:true,detail:true,createdAt:true,accountId:true,securityId:true,targetRate:true}});
  const rows=highestPending(pending).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
  return {data:{rows:rows.map(({securityId,targetRate,...r})=>({...r,accountId:String(r.accountId)})),total:rows.length}};
 });
 app.post<{Params:{eventId:string};Body:{action?:string}}>('/notifications/events/:eventId/state',async req=>{
  if(!['read','dismiss'].includes(req.body?.action??''))throw bad();
  const changed=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT user_id FROM app_notification_preferences WHERE user_id=${req.auth!.userId} FOR UPDATE`;
   return tx.appNotificationEvent.updateMany({where:{id:req.params.eventId,userId:req.auth!.userId},data:req.body.action==='read'?{readAt:new Date()}:{dismissedAt:new Date()}});
  });
  if(!changed.count)throw new ApiError(404,'NOT_FOUND','알림을 찾을 수 없습니다.');return {data:{updated:true}};
 });
 app.post<{Body:{installationId?:unknown;token?:unknown;policyVersion?:unknown}}>('/notifications/devices',async req=>{
  const {installationId,token}=req.body??{};if(typeof installationId!=='string'||!/^[-a-zA-Z0-9]{20,64}$/.test(installationId)||typeof token!=='string'||token.length<40||token.length>2048||/\s/.test(token))throw bad();
  if(req.body.policyVersion!==3)throw new ApiError(409,'APP_UPDATE_REQUIRED','계좌별 알림을 지원하는 최신 APK로 업데이트해 주세요.');
  let binding:string=randomUUID();const tokenHash=createHash('sha256').update(token).digest('hex');
  await prisma.$transaction(async tx=>{
   const previous=await tx.appPushDevice.findUnique({where:{id:installationId}});
   if(previous?.userId===req.auth!.userId&&previous.sessionId===req.auth!.sessionId&&previous.tokenHash===tokenHash)binding=previous.binding;
   // Transfer token atomically; an old user's registration must not remain valid.
   await tx.appPushDevice.deleteMany({where:{tokenHash,id:{not:installationId}}});
   await tx.appPushDevice.upsert({where:{id:installationId},create:{id:installationId,userId:req.auth!.userId,sessionId:req.auth!.sessionId,token,tokenHash,binding,policyVersion:3},update:{userId:req.auth!.userId,sessionId:req.auth!.sessionId,token,tokenHash,binding,policyVersion:3}});
  });return {data:{binding}};
 });
 app.delete<{Params:{installationId:string}}>('/notifications/devices/:installationId',async req=>{await prisma.appPushDevice.deleteMany({where:{id:req.params.installationId,userId:req.auth!.userId,sessionId:req.auth!.sessionId}});return {data:{removed:true}};});
 app.get<{Params:{eventId:string}}>('/notifications/events/:eventId',async req=>{
  if(!/^[a-f0-9-]{36}$/.test(req.params.eventId))throw bad();const event=await prisma.appNotificationEvent.findFirst({where:{id:req.params.eventId,userId:req.auth!.userId}});if(!event)throw new ApiError(404,'NOT_FOUND','알림을 찾을 수 없습니다.');if(event.accountId&&!await prisma.account.findFirst({where:{id:event.accountId,userId:req.auth!.userId,isActive:true},select:{id:true}}))throw new ApiError(404,'NOT_FOUND','알림의 대상 계좌를 찾을 수 없습니다.');return {data:{destination:notificationDestination(event.kind),newsId:event.newsId?String(event.newsId):null,accountId:event.accountId?String(event.accountId):null}};
 });
}
