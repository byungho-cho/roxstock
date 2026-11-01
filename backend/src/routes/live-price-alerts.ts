import type {FastifyInstance} from 'fastify';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {Prisma} from '@roxstock/shared/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {priceAmount,pauseEnd} from '@roxstock/shared/domain/live-price-alerts';
import {quoteMarkets,quoteLimit,type QuoteMarket} from '@roxstock/shared/domain/live-quotes';
import {id} from '../lib/input.js';
import {marketOpen} from '../realtime/kis-live.js';
import type {KisLiveService} from '../realtime/kis-live.js';
import type {LivePriceAlerts} from '../realtime/live-price-alerts.js';

const fail=(message:string,code='INVALID_PRICE_ALERT',status=400)=>new ApiError(status,code,message);
const version=(value:unknown)=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw fail('최신 설정을 확인해 주세요.');return value;};
export async function installLivePriceAlertRoutes(app:FastifyInstance,live:KisLiveService,engine:LivePriceAlerts){
 const changed=async(userId:bigint)=>{engine.changed(userId);await engine.reload().catch(()=>{engine.degraded=true;});};
 const own=async(tx:Prisma.TransactionClient,userId:bigint,conditionId:bigint,v:unknown)=>{
  await tx.$queryRaw`SELECT id FROM live_price_alerts WHERE id=${conditionId} AND user_id=${userId} FOR UPDATE`;
  const row=await tx.livePriceAlert.findFirst({where:{id:conditionId,userId,deletedAt:null}});
  if(!row)throw fail('알림 조건을 찾을 수 없습니다.','NOT_FOUND',404);
  if(row.version!==version(v))throw fail('다른 화면에서 변경됐습니다. 입력을 유지한 채 최신 설정을 확인해 주세요.','PRICE_ALERT_CONFLICT',409);
  return row;
 };
 const quota=async(tx:Prisma.TransactionClient,securityId:bigint,market:string)=>{
  await tx.collectorLock.upsert({where:{jobName:'live-price-alert-capacity'},create:{jobName:'live-price-alert-capacity',ownerToken:'capacity',lockedUntil:new Date(0)},update:{}});
  await tx.$queryRaw`SELECT job_name FROM collector_locks WHERE job_name='live-price-alert-capacity' FOR UPDATE`;
  const rows=await tx.livePriceAlert.findMany({where:{enabled:true,deletedAt:null},select:{securityId:true,market:true}});
  const keys=new Set(rows.map(r=>`${r.market}:${r.securityId}`));keys.add(`${market}:${securityId}`);
  if(keys.size>quoteLimit)throw fail('현재 감시 가능한 시장·종목 구독 한도에 도달했습니다. 다른 조건을 끈 뒤 다시 시도해 주세요.','PRICE_ALERT_CAPACITY',409);
 };
 app.get('/live-quotes/alerts',async(req,reply)=>{
  const userId=req.auth!.userId;
  const [conditions,events]=await Promise.all([db.livePriceAlert.findMany({where:{userId,deletedAt:null},orderBy:{id:'asc'}}),db.livePriceAlertEvent.findMany({where:{userId,acknowledgedAt:null,openKey:{not:null}},orderBy:{id:'desc'},include:{condition:true}})]);
  const ids=[...new Set([...conditions,...events].map(r=>r.securityId))],securities=await db.security.findMany({where:{id:{in:ids}},select:{id:true,name:true,symbol:true}}),names=new Map(securities.map(s=>[String(s.id),s]));
  const condition=(r:typeof conditions[number])=>{const s=names.get(String(r.securityId));const status=s?(['DISABLED','NOT_CONFIGURED','SESSION_IN_USE'].includes(live.state)?live.state:!marketOpen(r.market as QuoteMarket)?'MARKET_CLOSED':live.snapshot(r.market as QuoteMarket,[s.symbol]).quotes[0]?.status):'MARKET_UNSUPPORTED';return {id:String(r.id),securityId:String(r.securityId),name:s?.name??'종목 확인 필요',symbol:s?.symbol??'',market:r.market,direction:r.direction,amount:r.amount.toString(),enabled:r.enabled,pausedUntil:r.pausedUntil?.toISOString()??null,version:r.version,status};};
  reply.header('Cache-Control','private, no-store');return {data:{conditions:conditions.map(condition),events:events.map(e=>({...condition(e.condition),id:String(e.id),conditionId:String(e.conditionId),market:e.market,direction:e.direction,amount:e.amount.toString(),price:e.price.toString(),change:e.change.toString(),rate:e.rate.toString(),observedAt:e.observedAt.toISOString(),createdAt:e.createdAt.toISOString()})),unreadCount:events.length,monitor:engine.status(userId)}};
 });
 type Body={securityId?:string;market?:string;direction?:string;amount?:string;version?:number;enabled?:boolean;pause?:string};
 app.post<{Body:Body}>('/live-quotes/alerts',async(req,reply)=>{
  const body=req.body??{},userId=req.auth!.userId,securityId=id(body.securityId,'securityId'),market=body.market as QuoteMarket;
  if(!Object.hasOwn(quoteMarkets,market)||!['BELOW','ABOVE'].includes(body.direction??''))throw fail('시장과 알림 조건을 확인해 주세요.');
  let amount:number;try{amount=priceAmount(body.amount);}catch(e){throw fail((e as Error).message);}
  const security=await db.security.findFirst({where:{id:securityId,isActive:true},select:{symbol:true}});
  if(!security||!/^\d{6}$/.test(security.symbol))throw fail('실시간 시세를 지원하는 종목인지 확인해 주세요.');
  const now=new Date(),baseline=live.latest(market,security.symbol),identityKey=`${userId}:${securityId}:${market}:${body.direction}:${amount}`;
  const row=await db.$transaction(async tx=>{
   // Serialise quota and the per-user count before insertion.
   await quota(tx,securityId,market);
   if(await tx.livePriceAlert.count({where:{userId,deletedAt:null}})>=200)throw fail('알림 조건은 사용자당 최대 200개까지 등록할 수 있습니다.');
   if(await tx.livePriceAlert.findUnique({where:{identityKey}}))throw fail('이미 등록된 금액 조건입니다. 기존 조건을 편집해 주세요.','PRICE_ALERT_EXISTS',409);
   return tx.livePriceAlert.create({data:{identityKey,userId,securityId,market,direction:body.direction!,amount,eligibleAfter:now,lastObservedAt:baseline?.source==='KIS'?new Date(baseline.observedAt):null,lastSequence:baseline?.sequence??null}});
  });await changed(userId);reply.code(201);return {data:{id:String(row.id)}};
 });
 app.patch<{Params:{id:string};Body:Body}>('/live-quotes/alerts/:id',async(req)=>{
  const userId=req.auth!.userId,conditionId=id(req.params.id,'conditionId'),body=req.body??{},now=new Date();
  if([body.amount!==undefined||body.direction!==undefined,body.enabled!==undefined,body.pause!==undefined].filter(Boolean).length!==1||body.market!==undefined||body.securityId!==undefined)throw fail('한 번에 하나의 설정만 변경할 수 있습니다. 기준 시장과 종목은 변경하지 않습니다.');
  await db.$transaction(async tx=>{
   // The same quota lock order is used for both enabling and new registrations.
   if(body.enabled===true){const existing=await tx.livePriceAlert.findFirst({where:{id:conditionId,userId,deletedAt:null}});if(existing)await quota(tx,existing.securityId,existing.market);}
   const row=await own(tx,userId,conditionId,body.version),data:Prisma.LivePriceAlertUpdateInput={version:{increment:1}};
   if(body.amount!==undefined||body.direction!==undefined){
    let amount:number;try{amount=priceAmount(body.amount);}catch(e){throw fail((e as Error).message);}
    if(!['BELOW','ABOVE'].includes(body.direction??''))throw fail('알림 조건을 확인해 주세요.');
    const identityKey=`${userId}:${row.securityId}:${row.market}:${body.direction}:${amount}`;const duplicate=await tx.livePriceAlert.findUnique({where:{identityKey}});if(duplicate&&duplicate.id!==row.id)throw fail('이미 등록된 금액 조건입니다.','PRICE_ALERT_EXISTS',409);
    Object.assign(data,{identityKey,amount,direction:body.direction,inside:null,eligibleAfter:row.pausedUntil&&row.pausedUntil>now?row.pausedUntil:now});
   }else if(typeof body.enabled==='boolean'){
    Object.assign(data,{enabled:body.enabled,...(body.enabled&&!row.enabled?{eligibleAfter:row.pausedUntil&&row.pausedUntil>now?row.pausedUntil:now}:{})});
   }else if(body.pause!==undefined){
    let until:Date;try{until=pauseEnd(body.pause,now);}catch(e){throw fail((e as Error).message);}
    Object.assign(data,{pausedUntil:until,eligibleAfter:until});
   }else throw fail('변경할 설정을 확인해 주세요.');
   await tx.livePriceAlert.update({where:{id:conditionId},data});
  });await changed(userId);return {data:{id:String(conditionId)}};
 });
 app.delete<{Params:{id:string};Body:Body}>('/live-quotes/alerts/:id',async(req)=>{
  const userId=req.auth!.userId,conditionId=id(req.params.id,'conditionId'),now=new Date();
  await db.$transaction(async tx=>{await own(tx,userId,conditionId,req.body?.version);await tx.livePriceAlert.update({where:{id:conditionId},data:{identityKey:null,enabled:false,deletedAt:now,version:{increment:1}}});await tx.livePriceAlertEvent.updateMany({where:{userId,conditionId,acknowledgedAt:null},data:{acknowledgedAt:now,openKey:null}});});
  await changed(userId);return {data:{id:String(conditionId)}};
 });
 app.post<{Body:{eventIds?:unknown}}>('/live-quotes/alerts/acknowledge',async(req)=>{
  const userId=req.auth!.userId,ids=req.body?.eventIds;
  if(!Array.isArray(ids)||ids.length>200||ids.some(v=>typeof v!=='string'||!/^\d{1,20}$/.test(v)))throw fail('확인할 알림을 확인해 주세요.');
  const changed=await db.livePriceAlertEvent.updateMany({where:{userId,id:{in:ids.map(BigInt)},acknowledgedAt:null},data:{acknowledgedAt:new Date(),openKey:null}});
  engine.changed(userId);return {data:{count:changed.count}};
 });
}
