import {newsCollectionState,ensureNewsSchedule} from '@roxstock/shared/news/state';
import {validateNewsSchedule,scheduleAnchor} from '@roxstock/shared/news/schedule';
import type {FastifyInstance} from 'fastify';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {prisma} from '../auth/scoped-db.js';
import {newsTargets} from '@roxstock/shared/news/targets';
import {canonicalUrl,hash,kstStart,newsTypes,seoulDay} from '@roxstock/shared/news/policy';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';
import {authContext} from '../auth/context.js';
const userId=()=>{const value=authContext.getStore()?.userId;if(!value)throw new ApiError(401,'AUTH_REQUIRED','로그인이 필요합니다.');return value;};
type Snapshot={v:1;account:string;type:string;ceiling:string;scope:string;at:number;held?:boolean;user?:string};
type Query={type?:string;snapshot?:string;cursor?:string;held?:string};
const include={securities:{include:{security:{select:{id:true,symbol:true,name:true}}}}} as const;
type Row=Prisma.StockNewsItemGetPayload<{include:typeof include}>&{scraps?:{newsId:bigint}[];reads?:{newsId:bigint}[]};
// Handler-only legacy tests have no identity. Never load anyone's scraps in that case.
// Production's mandatory auth boundary supplies an identity on every request.
const personalInclude=()=>{const uid=authContext.getStore()?.userId;return uid?{...include,reads:{where:{userId:uid},select:{newsId:true}},scraps:{where:{userId:uid},select:{newsId:true}}}:include;};
const order=[{collectedAt:'desc'},{priority:'desc'},{publishedAt:'desc'},{id:'desc'}] as const;
const bad=()=>new ApiError(400,'NEWS_INVALID_PAGE','소식 조회 조건을 확인해 주세요.');
function serialize(row:Row,allowed:bigint[],held:Set<string>){
 let originalUrl:string|null=null;try{originalUrl=canonicalUrl(row.originalUrl);}catch{/* Invalid stored links remain visible with an explicit unavailable state. */}
 return {isRead:!!row.reads?.length,isScrapped:!!row.scraps?.length,isHeld:row.securities.some(s=>allowed.includes(s.securityId)&&held.has(String(s.securityId))),id:String(row.id),title:row.title,originalUrl,originalAvailable:!!originalUrl,sourceName:row.sourceName,publishedAt:row.publishedAt.toISOString(),publishedPrecision:row.publishedPrecision,type:row.materialType,importance:row.priority===2?'IMPORTANT':'MAJOR',access:row.accessCondition,summary:row.summary,summaryMethod:row.summaryMethod,summaryStatus:row.summaryStatus,summaryCheckedAt:row.summaryCheckedAt?.toISOString()??null,collectedAt:row.collectedAt.toISOString(),securities:row.securities.filter(s=>allowed.includes(s.securityId)).map(s=>({id:String(s.security.id),symbol:s.security.symbol,name:s.security.name,isHeld:held.has(String(s.securityId))}))};
}
/** Aggregate only the bounded page's related securities; never infer holdings from watchlists. */
async function heldForRows(tx:Prisma.TransactionClient,accountId:bigint,rows:Row[]){
 const ids=[...new Set(rows.flatMap(r=>r.securities.map(s=>s.securityId)))];if(!ids.length)return new Set<string>();
 const held=await tx.$queryRaw<{security_id:bigint}[]>(Prisma.sql`SELECT b.security_id FROM buy_trades b
 WHERE b.account_id=${accountId} AND b.security_id IN (${Prisma.join(ids)}) GROUP BY b.security_id
 HAVING SUM(b.quantity - COALESCE((SELECT SUM(s.quantity) FROM sell_trades s WHERE s.buy_trade_id=b.id),0)) > 0`);
 return new Set(held.map(r=>String(r.security_id)));
}
async function context(tx:Prisma.TransactionClient,accountId:bigint,q:Query){
 // Reuse the installation's active-account boundary. It has no multi-user ownership identity.
 const account=await tx.account.findUnique({where:{id:accountId},select:{isActive:true}});if(!account?.isActive)throw new ApiError(404,'ACCOUNT_NOT_FOUND','활성 계좌를 찾을 수 없습니다.');
 const type=q.type??'ALL';if(type!=='ALL'&&type!=='SCRAP'&&!newsTypes.includes(type as never))throw bad();
 if(q.held!==undefined&&q.held!=='true'&&q.held!=='false')throw bad();
 const heldOnly=q.held==='true',targets=await newsTargets(tx as PrismaClient,accountId);
 let ids=targets.map(t=>t.id);
 if(heldOnly){const held=await tx.$queryRaw<{security_id:bigint}[]>(Prisma.sql`SELECT b.security_id FROM buy_trades b WHERE b.account_id=${accountId} GROUP BY b.security_id HAVING SUM(b.quantity-COALESCE((SELECT SUM(s.quantity) FROM sell_trades s WHERE s.buy_trade_id=b.id),0)) > 0`);const set=new Set(held.map(r=>String(r.security_id)));ids=ids.filter(id=>set.has(String(id)));}
 const scope=hash(type==='SCRAP'?String(userId())+':'+heldOnly:ids.map(String).join(','));let snapshot:Snapshot;
 if(q.snapshot){try{if(q.snapshot.length>1500)throw bad();snapshot=JSON.parse(Buffer.from(q.snapshot,'base64url').toString('utf8'));if(snapshot.v!==1||snapshot.account!==String(accountId)||snapshot.type!==type||!/^\d{1,20}$/.test(snapshot.ceiling)||BigInt(snapshot.ceiling)>18446744073709551615n||!Number.isFinite(snapshot.at)||snapshot.at>Date.now()+60000)throw bad();}catch{throw bad();}
  if((snapshot.held??false)!==heldOnly||type==='SCRAP'&&snapshot.user!==String(userId()))throw bad();
  if(snapshot.scope!==scope)throw new ApiError(409,'NEWS_SCOPE_CHANGED','계좌의 대상 종목이 변경되었습니다. 목록을 다시 조회해 주세요.');
  if(Date.now()-snapshot.at>86400000)throw new ApiError(410,'NEWS_SNAPSHOT_EXPIRED','이전 목록의 조회 기간이 만료되었습니다. 목록을 다시 조회해 주세요.');
 }else snapshot={v:1,account:String(accountId),type,user:String(authContext.getStore()?.userId??""),held:heldOnly,ceiling:String((await tx.stockNewsItem.aggregate({_max:{id:true}}))._max.id??0n),scope,at:Date.now()};
 const baseWhere:Prisma.StockNewsItemWhereInput={id:{lte:BigInt(snapshot.ceiling)},...(type==='SCRAP'&&!heldOnly?{}:{securities:{some:{securityId:{in:ids}}}})};
 const where:Prisma.StockNewsItemWhereInput={...baseWhere,...(type==='SCRAP'?{scraps:{some:{userId:userId()}}}:type==='ALL'?{}:{materialType:type})};
 return {ids,where,baseWhere,snapshot:Buffer.from(JSON.stringify(snapshot)).toString('base64url')};
}
function boundary(row:Pick<Row,'collectedAt'|'priority'|'publishedAt'|'id'>,direction:'before'|'after'):Prisma.StockNewsItemWhereInput{
 const op=direction==='before'?'gt':'lt';return {OR:[{collectedAt:{[op]:row.collectedAt}},{collectedAt:row.collectedAt,OR:[{priority:{[op]:row.priority}},{priority:row.priority,publishedAt:{[op]:row.publishedAt}},{priority:row.priority,publishedAt:row.publishedAt,id:{[op]:row.id}}]}]};
}
export async function loadStockNews(accountId:bigint,q:Query={}){
 return prisma.$transaction(async tx=>{
  const ctx=await context(tx,accountId,q);let after:Prisma.StockNewsItemWhereInput={};
  if(q.cursor){if(!q.snapshot)throw bad();const cursorId=id(q.cursor,'cursor'),last=await tx.stockNewsItem.findFirst({where:{AND:[q.type==="SCRAP"?ctx.baseWhere:ctx.where,{id:cursorId}]},select:{id:true,collectedAt:true,priority:true,publishedAt:true}});if(!last)throw bad();after=boundary(last,'after');}
  const [rows,total,collection]=await Promise.all([tx.stockNewsItem.findMany({where:{AND:[ctx.where,after]},orderBy:[...order],take:11,include:personalInclude()}),tx.stockNewsItem.count({where:ctx.where}),newsCollectionState(tx)]);
  const page=rows.slice(0,10),held=await heldForRows(tx,accountId,page);
  // Account scope and snapshot ceiling match the list, including rows beyond the current page.
  const daily=await tx.stockNewsItem.groupBy({by:['collectedAt'],where:ctx.where,_count:{_all:true}});
  const dailyCounts:Record<string,number>={};for(const d of daily){const day=seoulDay(d.collectedAt);dailyCounts[day]=(dailyCounts[day]??0)+d._count._all;}
  return {data:page.map(r=>serialize(r,q.type==='SCRAP'?r.securities.map(s=>s.securityId):ctx.ids,held)),meta:{accountId:String(accountId),type:q.type??'ALL',total,count:page.length,snapshot:ctx.snapshot,nextCursor:rows.length>10?String(page.at(-1)!.id):null,dailyCounts,collection}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
export async function loadStockNewsDetail(accountId:bigint,newsId:bigint,q:Query={}){
 return prisma.$transaction(async tx=>{
  const ctx=await context(tx,accountId,q),row=await tx.stockNewsItem.findFirst({where:{AND:[q.type==='SCRAP'?ctx.baseWhere:ctx.where,{id:newsId}]},include:personalInclude()});if(!row)throw new ApiError(404,'NEWS_NOT_IN_ACCOUNT','현재 계좌의 조회 대상 소식이 아닙니다.');
  const [before,total,previous,next]=await Promise.all([tx.stockNewsItem.count({where:{AND:[ctx.where,boundary(row,'before')]}}),tx.stockNewsItem.count({where:ctx.where}),tx.stockNewsItem.findFirst({where:{AND:[ctx.where,boundary(row,'before')]},orderBy:[{collectedAt:'asc'},{priority:'asc'},{publishedAt:'asc'},{id:'asc'}],select:{id:true}}),tx.stockNewsItem.findFirst({where:{AND:[ctx.where,boundary(row,'after')]},orderBy:[...order],select:{id:true}})]);
  return {data:serialize(row,q.type==='SCRAP'?row.securities.map(s=>s.securityId):ctx.ids,await heldForRows(tx,accountId,[row])),meta:{accountId:String(accountId),snapshot:ctx.snapshot,type:q.type??'ALL',ordinal:Math.min(before+1,total),total,previousId:previous?String(previous.id):null,nextId:next?String(next.id):null}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
export async function markStockNewsRead(accountId:bigint,newsId:bigint,q:Query={}){
 const uid=userId();
 // Verify account ownership/scope before writing personal state. GET remains read-only.
 await loadStockNewsDetail(accountId,newsId,q);
 await prisma.stockNewsRead.upsert({where:{userId_newsId:{userId:uid,newsId}},create:{userId:uid,newsId},update:{}});
 return {data:{id:String(newsId),isRead:true}};
}
export async function markAllStockNewsRead(accountId:bigint,q:Query){
 const uid=userId();
 // Freeze the current list ceiling: newly collected news cannot be swept into this action.
 if(!q.snapshot||q.cursor)throw bad();
 return prisma.$transaction(async tx=>{
  const ctx=await context(tx,accountId,q);let cursor=0n,count=0;
  while(true){
   const rows=await tx.stockNewsItem.findMany({where:{AND:[ctx.where,{id:{gt:cursor}},{reads:{none:{userId:uid}}}]},select:{id:true},orderBy:{id:'asc'},take:500});
   if(!rows.length)break;
   const saved=await tx.stockNewsRead.createMany({data:rows.map(r=>({userId:uid,newsId:r.id})),skipDuplicates:true});count+=saved.count;cursor=rows.at(-1)!.id;
  }
  return {data:{count}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
}
export async function stockNewsRoutes(app:FastifyInstance){
 app.put<{Params:{accountId:string;newsId:string};Body:Query}>('/accounts/:accountId/stock-news/:newsId/read',async(req,reply)=>{
  reply.header('Cache-Control','private, no-store');return markStockNewsRead(id(req.params.accountId,'accountId'),id(req.params.newsId,'newsId'),req.body??{});
 });
 app.put<{Params:{accountId:string};Body:Query}>('/accounts/:accountId/stock-news/read-all',async(req,reply)=>{
  reply.header('Cache-Control','private, no-store');return markAllStockNewsRead(id(req.params.accountId,'accountId'),req.body??{});
 });
 app.put<{Params:{accountId:string;newsId:string};Body:{saved?:boolean}}>('/accounts/:accountId/stock-news/:newsId/scrap',async(req,reply)=>{
  if(typeof req.body?.saved!=='boolean')throw bad();const accountId=id(req.params.accountId,'accountId'),newsId=id(req.params.newsId,'newsId'),uid=userId();
  await loadStockNewsDetail(accountId,newsId);
  if(req.body.saved)await prisma.stockNewsScrap.upsert({where:{userId_newsId:{userId:uid,newsId}},create:{userId:uid,newsId},update:{}});
  else await prisma.stockNewsScrap.deleteMany({where:{userId:uid,newsId}});
  reply.header('Cache-Control','private, no-store');return {data:{id:String(newsId),isScrapped:req.body.saved}};
 });
 // Same installation-wide operating-settings boundary as security-management/collection settings.
 app.get('/stock-news/settings',async(_req,reply)=>{reply.header('Cache-Control','no-store');return {data:await newsCollectionState(prisma)};});
 app.put<{Body:unknown}>('/stock-news/settings',async(req,reply)=>{
  let input;try{input=validateNewsSchedule(req.body);}catch{throw new ApiError(400,'NEWS_INVALID_SCHEDULE','수집 주기는 1~24시간 정수, 시작 시각은 HH:mm 형식이어야 합니다.');}
  const now=new Date();await ensureNewsSchedule(prisma,now);
  await prisma.stockNewsSchedule.update({where:{id:'stock-news'},data:{...input,anchorAt:scheduleAnchor(now,input.startTime),revision:{increment:1},updatedAt:now}});
  reply.header('Cache-Control','no-store');return {data:await newsCollectionState(prisma,now)};
 });
 app.get<{Params:{accountId:string};Querystring:Query}>('/accounts/:accountId/stock-news',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return loadStockNews(id(req.params.accountId,'accountId'),req.query);});
 app.get<{Params:{accountId:string;newsId:string};Querystring:Query}>('/accounts/:accountId/stock-news/:newsId',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return loadStockNewsDetail(id(req.params.accountId,'accountId'),id(req.params.newsId,'newsId'),req.query);});
}
