import type {FastifyInstance} from 'fastify';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {newsTargets} from '@roxstock/shared/news/targets';
import {canonicalUrl,hash,kstStart,newsTypes,seoulDay} from '@roxstock/shared/news/policy';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';
type Snapshot={v:1;account:string;type:string;ceiling:string;scope:string;at:number};
type Query={type?:string;snapshot?:string;cursor?:string};
const include={securities:{include:{security:{select:{id:true,symbol:true,name:true}}}}} as const;
type Row=Prisma.StockNewsItemGetPayload<{include:typeof include}>;
const order=[{priority:'desc'},{publishedAt:'desc'},{id:'desc'}] as const;
const bad=()=>new ApiError(400,'NEWS_INVALID_PAGE','소식 조회 조건을 확인해 주세요.');
function serialize(row:Row,allowed:bigint[],held:Set<string>){
 let originalUrl:string|null=null;try{originalUrl=canonicalUrl(row.originalUrl);}catch{/* Invalid stored links remain visible with an explicit unavailable state. */}
 return {isHeld:row.securities.some(s=>allowed.includes(s.securityId)&&held.has(String(s.securityId))),id:String(row.id),title:row.title,originalUrl,originalAvailable:!!originalUrl,sourceName:row.sourceName,publishedAt:row.publishedAt.toISOString(),publishedPrecision:row.publishedPrecision,type:row.materialType,importance:row.priority===2?'IMPORTANT':'MAJOR',access:row.accessCondition,summary:row.summary,summaryMethod:row.summaryMethod,summaryStatus:row.summaryStatus,summaryCheckedAt:row.summaryCheckedAt?.toISOString()??null,collectedAt:row.collectedAt.toISOString(),securities:row.securities.filter(s=>allowed.includes(s.securityId)).map(s=>({id:String(s.security.id),symbol:s.security.symbol,name:s.security.name,isHeld:held.has(String(s.securityId))}))};
}
/** Aggregate only the bounded page's related securities; never infer holdings from watchlists. */
async function heldForRows(tx:Prisma.TransactionClient,accountId:bigint,rows:Row[]){
 const ids=[...new Set(rows.flatMap(r=>r.securities.map(s=>s.securityId)))];if(!ids.length)return new Set<string>();
 const held=await tx.$queryRaw<{security_id:bigint}[]>(Prisma.sql`SELECT b.security_id FROM buy_trades b
 WHERE b.account_id=${accountId} AND b.security_id IN (${Prisma.join(ids)}) GROUP BY b.security_id
 HAVING SUM(b.quantity - COALESCE((SELECT SUM(s.quantity) FROM sell_trades s WHERE s.buy_trade_id=b.id),0)) >= 1`);
 return new Set(held.map(r=>String(r.security_id)));
}
async function context(tx:Prisma.TransactionClient,accountId:bigint,q:Query){
 // Reuse the installation's active-account boundary. It has no multi-user ownership identity.
 const account=await tx.account.findUnique({where:{id:accountId},select:{isActive:true}});if(!account?.isActive)throw new ApiError(404,'ACCOUNT_NOT_FOUND','활성 계좌를 찾을 수 없습니다.');
 const type=q.type??'ALL';if(type!=='ALL'&&!newsTypes.includes(type as never))throw bad();
 const targets=await newsTargets(tx as PrismaClient,accountId),ids=targets.map(t=>t.id),scope=hash(ids.map(String).join(','));let snapshot:Snapshot;
 if(q.snapshot){try{if(q.snapshot.length>1500)throw bad();snapshot=JSON.parse(Buffer.from(q.snapshot,'base64url').toString('utf8'));if(snapshot.v!==1||snapshot.account!==String(accountId)||snapshot.type!==type||!/^\d{1,20}$/.test(snapshot.ceiling)||BigInt(snapshot.ceiling)>18446744073709551615n||!Number.isFinite(snapshot.at)||snapshot.at>Date.now()+60000)throw bad();}catch{throw bad();}
  if(snapshot.scope!==scope)throw new ApiError(409,'NEWS_SCOPE_CHANGED','계좌의 대상 종목이 변경되었습니다. 목록을 다시 조회해 주세요.');
  if(Date.now()-snapshot.at>86400000)throw new ApiError(410,'NEWS_SNAPSHOT_EXPIRED','이전 목록의 조회 기간이 만료되었습니다. 목록을 다시 조회해 주세요.');
 }else snapshot={v:1,account:String(accountId),type,ceiling:String((await tx.stockNewsItem.aggregate({_max:{id:true}}))._max.id??0n),scope,at:Date.now()};
 const where:Prisma.StockNewsItemWhereInput={id:{lte:BigInt(snapshot.ceiling)},securities:{some:{securityId:{in:ids}}},...(type==='ALL'?{}:{materialType:type})};
 return {ids,where,snapshot:Buffer.from(JSON.stringify(snapshot)).toString('base64url')};
}
function boundary(row:Pick<Row,'priority'|'publishedAt'|'id'>,direction:'before'|'after'):Prisma.StockNewsItemWhereInput{
 const op=direction==='before'?'gt':'lt';return {OR:[{priority:{[op]:row.priority}},{priority:row.priority,publishedAt:{[op]:row.publishedAt}},{priority:row.priority,publishedAt:row.publishedAt,id:{[op]:row.id}}]};
}
async function collectionState(tx:Prisma.TransactionClient){
 const state=await tx.stockNewsState.findUnique({where:{id:'stock-news'}}),providers=await tx.stockNewsProviderState.findMany({select:{provider:true,lastError:true,lastSuccessAt:true},orderBy:{provider:'asc'}});
 const now=new Date(),today=seoulDay(now),six=new Date(kstStart(today).getTime()+6*3600000);
 return {status:state?.lastStatus??'NOT_COLLECTED',updatedAt:state?.lastCollectedAt?.toISOString()??null,initialCompleted:!!state?.initialCompletedAt,initialDate:state?.initialDate??null,enabled:process.env.STOCK_NEWS_ENABLED!=='false',nextAt:state?.initialCompletedAt?(six>now?six:new Date(six.getTime()+86400000)).toISOString():null,providers:providers.map(p=>({id:p.provider,error:p.lastError,lastSuccessAt:p.lastSuccessAt?.toISOString()??null}))};
}
export async function loadStockNews(accountId:bigint,q:Query={}){
 return prisma.$transaction(async tx=>{
  const ctx=await context(tx,accountId,q);let after:Prisma.StockNewsItemWhereInput={};
  if(q.cursor){if(!q.snapshot)throw bad();const cursorId=id(q.cursor,'cursor'),last=await tx.stockNewsItem.findFirst({where:{AND:[ctx.where,{id:cursorId}]},select:{id:true,priority:true,publishedAt:true}});if(!last)throw bad();after=boundary(last,'after');}
  const [rows,total,collection]=await Promise.all([tx.stockNewsItem.findMany({where:{AND:[ctx.where,after]},orderBy:[...order],take:11,include}),tx.stockNewsItem.count({where:ctx.where}),collectionState(tx)]);
  const page=rows.slice(0,10),held=await heldForRows(tx,accountId,page);return {data:page.map(r=>serialize(r,ctx.ids,held)),meta:{accountId:String(accountId),type:q.type??'ALL',total,count:page.length,snapshot:ctx.snapshot,nextCursor:rows.length>10?String(page.at(-1)!.id):null,collection}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
export async function loadStockNewsDetail(accountId:bigint,newsId:bigint,q:Query={}){
 return prisma.$transaction(async tx=>{
  const ctx=await context(tx,accountId,q),row=await tx.stockNewsItem.findFirst({where:{AND:[ctx.where,{id:newsId}]},include});if(!row)throw new ApiError(404,'NEWS_NOT_IN_ACCOUNT','현재 계좌의 조회 대상 소식이 아닙니다.');
  const [before,total,previous,next]=await Promise.all([tx.stockNewsItem.count({where:{AND:[ctx.where,boundary(row,'before')]}}),tx.stockNewsItem.count({where:ctx.where}),tx.stockNewsItem.findFirst({where:{AND:[ctx.where,boundary(row,'before')]},orderBy:[{priority:'asc'},{publishedAt:'asc'},{id:'asc'}],select:{id:true}}),tx.stockNewsItem.findFirst({where:{AND:[ctx.where,boundary(row,'after')]},orderBy:[...order],select:{id:true}})]);
  return {data:serialize(row,ctx.ids,await heldForRows(tx,accountId,[row])),meta:{accountId:String(accountId),snapshot:ctx.snapshot,type:q.type??'ALL',ordinal:before+1,total,previousId:previous?String(previous.id):null,nextId:next?String(next.id):null}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
export async function stockNewsRoutes(app:FastifyInstance){
 app.get<{Params:{accountId:string};Querystring:Query}>('/accounts/:accountId/stock-news',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return loadStockNews(id(req.params.accountId,'accountId'),req.query);});
 app.get<{Params:{accountId:string;newsId:string};Querystring:Query}>('/accounts/:accountId/stock-news/:newsId',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return loadStockNewsDetail(id(req.params.accountId,'accountId'),id(req.params.newsId,'newsId'),req.query);});
}
