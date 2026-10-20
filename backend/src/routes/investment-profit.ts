import type {FastifyInstance} from 'fastify';
import {Prisma} from '@roxstock/shared/prisma';
import {prisma} from '../auth/scoped-db.js';
import {authContext} from '../auth/context.js';
import {id} from '../lib/input.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {calculateProfitYear,PROFIT_VERSION,type ProfitYear} from '../domain/investment-profit.js';
const cache=new Map<string,{until:number;years:ProfitYear[];calculatedAt:string;bytes:number}>();
const pending=new Map<string,Promise<ProfitYear[]>>();
export async function publishProfitYear(accountId:bigint,revision:bigint,result:ProfitYear){
 // Parent lock precedes revision/aggregate locks, matching cash writers and FK checks.
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM accounts WHERE id=${accountId} LOCK IN SHARE MODE`;
  const rows=await tx.$queryRaw<Array<{revision:bigint}>>`SELECT revision FROM account_profit_revisions WHERE account_id=${accountId} FOR UPDATE`;
  if(rows[0]?.revision!==revision)return false;
  await tx.investmentYearAggregate.upsert({where:{accountId_year:{accountId,year:result.year}},create:{accountId,year:result.year,calculationVersion:PROFIT_VERSION,sourceRevision:revision,basisDate:new Date(`${result.year}-12-31T00:00:00Z`),state:'VALID',payload:result as unknown as Prisma.InputJsonValue,calculatedAt:new Date()},update:{calculationVersion:PROFIT_VERSION,sourceRevision:revision,basisDate:new Date(`${result.year}-12-31T00:00:00Z`),state:'VALID',payload:result as unknown as Prisma.InputJsonValue,calculatedAt:new Date()}});
  return true;
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
}
export async function readProfitYears(accountId:bigint,today:string,revision:bigint){
 const current=Number(today.slice(0,4));
 const result=await prisma.$transaction(async tx=>{
  // All source reads and revision belong to one snapshot; no long write lock while calculating.
  const source=await tx.accountProfitRevision.findUnique({where:{accountId}});
  if(!source||source.revision!==revision)return null;
  const [buy,cash,snapshot,sell]=await Promise.all([
   tx.buyTrade.aggregate({where:{accountId},_min:{boughtAt:true}}),tx.cashTransaction.aggregate({where:{accountId},_min:{transactionDate:true}}),tx.dailyAccountSnapshot.aggregate({where:{accountId},_min:{snapshotDate:true}}),tx.sellTrade.aggregate({where:{buyTrade:{accountId}},_min:{soldAt:true}})]);
  const yearOf=(value:Date|null,kst=true)=>value?new Date(value.getTime()+(kst?9*3600000:0)).getUTCFullYear():current;
  const first=Math.min(current,yearOf(buy._min.boughtAt),yearOf(cash._min.transactionDate),yearOf(snapshot._min.snapshotDate,false),yearOf(sell._min.soldAt));
  const stored=await tx.investmentYearAggregate.findMany({where:{accountId,state:'VALID',calculationVersion:PROFIT_VERSION,year:{lt:current}}});
  const byYear=new Map(stored.filter(row=>{const payload=row.payload as unknown as ProfitYear;return payload?.year===row.year&&Array.isArray(payload.events)&&!!payload.capital&&row.basisDate.toISOString().slice(0,10)===`${row.year}-12-31`;}).map(row=>[row.year,row.payload as unknown as ProfitYear]));
  const years:ProfitYear[]=[],missing:ProfitYear[]=[];
  for(let year=current;year>=first;year--){
   const saved=byYear.get(year),value=saved??await calculateProfitYear(tx,accountId,year,today);
   years.push(value);if(!saved&&year<current)missing.push(value);
  }
  return {years,missing};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
 if(!result)return null;
 // Incremental on-demand backfill, one account/request, never a deployment-wide batch.
 for(const year of result.missing)if(!await publishProfitYear(accountId,revision,year))return null;
 return result.years;
}
export async function investmentProfitRoutes(app:FastifyInstance){
 app.get<{Params:{accountId:string};Querystring:{securityId?:string}}>('/accounts/:accountId/investment-profit',async request=>{
  const accountId=id(request.params.accountId,'accountId'),securityId=request.query.securityId===undefined?null:id(request.query.securityId,'securityId');
  const account=await prisma.account.findUnique({where:{id:accountId},select:{isActive:true}});
  if(!account?.isActive)throw new ApiError(404,'ACCOUNT_NOT_FOUND','Account not found.');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  for(let attempt=0;attempt<3;attempt++){
   const revision=(await prisma.accountProfitRevision.findUnique({where:{accountId}}))?.revision;
   if(revision===undefined)throw new ApiError(503,'PROFIT_REVISION_MISSING','집계 기준을 확인할 수 없습니다.');
   const key=`${authContext.getStore()?.userId??'system'}:${accountId}:${revision}:${today}:${PROFIT_VERSION}`,saved=cache.get(key);
   let years=saved&&saved.until>Date.now()?saved.years:undefined;
   if(!years){let work=pending.get(key);if(!work){work=readProfitYears(accountId,today,revision).then(value=>value??[]);pending.set(key,work);}try{years=await work;}finally{if(pending.get(key)===work)pending.delete(key);}}
   if((await prisma.accountProfitRevision.findUnique({where:{accountId}}))?.revision!==revision||!years.length)continue;
   for(const [old,value] of cache)if(value.until<=Date.now()||old.startsWith(`${accountId}:`)&&old!==key)cache.delete(old);
   const calculatedAt=saved&&saved.until>Date.now()?saved.calculatedAt:new Date().toISOString();
   const bytes=Buffer.byteLength(JSON.stringify(years)),budget=8*1024*1024;
   if(bytes<=budget){
    while(cache.size>=128||[...cache.values()].reduce((sum,value)=>sum+value.bytes,0)-(cache.get(key)?.bytes??0)+bytes>budget)cache.delete(cache.keys().next().value!);
    cache.set(key,{until:Date.now()+5000,years,calculatedAt,bytes});
   }
   return {data:{accountId:String(accountId),events:years.flatMap(year=>year.events).filter(event=>securityId===null||event.securityId===String(securityId)),capital:securityId===null?years.map(year=>year.capital):[],...(securityId===null?{}:{securityId:String(securityId)})},meta:{basisDate:today,calculationVersion:PROFIT_VERSION,sourceRevision:String(revision),cacheHit:!!saved&&saved.until>Date.now(),state:'VALID',calculatedAt}};
  }
  throw new ApiError(409,'PROFIT_SOURCE_CHANGED','조회 중 데이터가 변경되었습니다. 다시 조회해 주세요.');
 });
}
