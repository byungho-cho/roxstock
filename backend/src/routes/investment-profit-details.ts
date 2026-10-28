import type {FastifyInstance} from 'fastify';
import {createHash} from 'node:crypto';
import {prisma} from '../auth/scoped-db.js';
import {authContext} from '../auth/context.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';
import {exactAdd,profitTotals,type ProfitEvent} from '../domain/investment-profit.js';
import {currentProfitSource} from './investment-profit.js';
type Query={securityId?:string;year?:string;month?:string;snapshot?:string;cursor?:string};
const invalid=()=>new ApiError(400,'INVALID_PROFIT_SCOPE','손익 조회 조건을 확인해 주세요.');
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function decode(v:string){try{if(v.length>2000)throw invalid();return JSON.parse(Buffer.from(v,'base64url').toString());}catch{throw invalid();}}
function condition(q:Query){
 const securityId=q.securityId===undefined?undefined:id(q.securityId,'securityId'),year=q.year===undefined?undefined:Number(q.year),month=q.month===undefined?undefined:Number(q.month);
 if(year!==undefined&&(!/^\d{4}$/.test(q.year!)||year<1900||year>2200)||month!==undefined&&(!year||!Number.isInteger(month)||month<1||month>12||!/^\d{1,2}$/.test(q.month!)))throw invalid();
 return {securityId,year,month};
}
const filtered=(events:ProfitEvent[],s:ReturnType<typeof condition>)=>events.filter(e=>(s.securityId===undefined||e.securityId===String(s.securityId))&&(s.year===undefined||e.date.startsWith(String(s.year)))&&(s.month===undefined||Number(e.date.slice(5,7))===s.month));
function months(events:ProfitEvent[]){const groups=new Map<string,ProfitEvent[]>();for(const e of events.filter(e=>e.kind!=='BUY')){const key=e.date.slice(0,7);const rows=groups.get(key)??[];rows.push(e);groups.set(key,rows);}return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([month,rows])=>({month,totals:profitTotals(rows),hasTrading:rows.some(r=>r.kind==='SELL'),hasDividend:rows.some(r=>r.kind==='DIVIDEND')}));}
export async function investmentProfitDetailRoutes(app:FastifyInstance){
 app.get<{Params:{accountId:string};Querystring:Query}>('/accounts/:accountId/investment-profit/statistics',async req=>{
  const accountId=id(req.params.accountId,'accountId'),scope=condition(req.query);if(!scope.securityId)throw invalid();
  const {years,revision,today}=await currentProfitSource(accountId),stock=await prisma.security.findUnique({where:{id:scope.securityId},select:{id:true,name:true,symbol:true}});if(!stock)throw new ApiError(404,'NOT_FOUND','종목을 찾을 수 없습니다.');
  const rows=years.flatMap(y=>{const events=filtered(y.events,{securityId:scope.securityId,year:undefined,month:undefined});return events.length?[{year:y.year,totals:profitTotals(events),months:months(events)}]:[];});
  return {data:{accountId:String(accountId),security:{...stock,id:String(stock.id)},years:rows},meta:{sourceRevision:String(revision),basisDate:today,completeHistory:true}};
 });
 app.get<{Params:{accountId:string};Querystring:Query}>('/accounts/:accountId/investment-profit/entries',async req=>{
  const accountId=id(req.params.accountId,'accountId'),scope=condition(req.query),source=await currentProfitSource(accountId);
  const key=createHash('sha256').update(JSON.stringify([String(authContext.getStore()?.userId),String(accountId),String(scope.securityId??''),scope.year??null,scope.month??null])).digest('hex');
  const snapshot=req.query.snapshot?decode(req.query.snapshot):{v:1,scope:key,revision:String(source.revision)};
  if(snapshot.v!==1||snapshot.scope!==key)throw invalid();if(snapshot.revision!==String(source.revision))throw new ApiError(409,'PROFIT_SOURCE_CHANGED','손익 내역이 변경되었습니다. 목록을 다시 조회해 주세요.');
  let cursor:{at:string;kind:'SELL'|'DIVIDEND';id:string}|undefined;
  if(req.query.cursor){if(!req.query.snapshot)throw invalid();cursor=decode(req.query.cursor);if(!cursor||!['SELL','DIVIDEND'].includes(cursor.kind)||! /^(?:[1-9]\d{0,19})$/.test(cursor.id)||BigInt(cursor.id)>18446744073709551615n||!Number.isFinite(Date.parse(cursor.at)))throw invalid();}
  const start=scope.year?new Date(Date.UTC(scope.year,(scope.month??1)-1,1)-9*3600000):new Date('1900-01-01T00:00:00Z');
  const todayEnd=Date.parse(source.today+'T00:00:00Z')+15*3600000,to=new Date(Math.min(scope.year?Date.UTC(scope.year,scope.month??12,1)-9*3600000:todayEnd,todayEnd));
  const seek=(field:string,kind:'SELL'|'DIVIDEND')=>!cursor?{}:{OR:[{[field]:{lt:new Date(cursor.at)}},...(kind===cursor.kind?[{[field]:new Date(cursor.at),id:{lt:BigInt(cursor.id)}}]:kind<cursor.kind?[{[field]:new Date(cursor.at)}]:[])]};
  const result=await prisma.$transaction(async tx=>{
   const sellWhere={buyTrade:{accountId,...(scope.securityId?{securityId:scope.securityId}:{})},soldAt:{gte:start,lt:to}},dividendWhere={accountId,transactionType:'DIVIDEND' as const,transactionDate:{gte:start,lt:to},...(scope.securityId?{dividend:{is:{securityId:scope.securityId}}}:{})};
   const [sells,dividends,sellCount,dividendCount]=await Promise.all([
    tx.sellTrade.findMany({where:{AND:[sellWhere,seek('soldAt','SELL')]},orderBy:[{soldAt:'desc'},{id:'desc'}],take:51,select:{id:true,soldAt:true,quantity:true,unitPrice:true,buyTrade:{select:{unitPrice:true,security:{select:{id:true,name:true,symbol:true}}}}}}),
    tx.cashTransaction.findMany({where:{AND:[dividendWhere,seek('transactionDate','DIVIDEND')]},orderBy:[{transactionDate:'desc'},{id:'desc'}],take:51,select:{id:true,transactionDate:true,dividend:{select:{netAmount:true,security:{select:{id:true,name:true,symbol:true}}}}}}),
    tx.sellTrade.count({where:sellWhere}),tx.cashTransaction.count({where:dividendWhere})]);
   const format=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'});
   const rows=sells.map(r=>({id:String(r.id),key:'SELL:'+r.id,at:r.soldAt.toISOString(),date:format.format(r.soldAt),kind:'SELL' as 'SELL'|'DIVIDEND',security:{...r.buyTrade.security,id:String(r.buyTrade.security.id)},amount:r.quantity.mul(r.unitPrice.minus(r.buyTrade.unitPrice)).toString(),rateDenominator:r.quantity.mul(r.buyTrade.unitPrice).toString() as string|null}));
   for(const r of dividends){if(!r.dividend)throw new ApiError(409,'DIVIDEND_LINK_MISSING','배당의 종목 연결 정보를 확인해 주세요.');rows.push({id:String(r.id),key:'DIVIDEND:'+r.id,at:r.transactionDate.toISOString(),date:format.format(r.transactionDate),kind:'DIVIDEND',security:{...r.dividend.security,id:String(r.dividend.security.id)},amount:r.dividend.netAmount.toString(),rateDenominator:null});}
   rows.sort((a,b)=>b.at.localeCompare(a.at)||b.kind.localeCompare(a.kind)||(BigInt(a.id)>BigInt(b.id)?-1:1));
   return {rows:rows.slice(0,50),hasNext:rows.length>50,total:sellCount+dividendCount};
  },{isolationLevel:'RepeatableRead',timeout:30000});
  if((await prisma.accountProfitRevision.findUnique({where:{accountId}}))?.revision!==source.revision)throw new ApiError(409,'PROFIT_SOURCE_CHANGED','조회 중 내역이 변경되었습니다. 다시 조회해 주세요.');
  const annualBuys=new Map<string,string|null>();
  for(const y of source.years)for(const event of y.events){const key=event.securityId+':'+event.date.slice(0,4);annualBuys.set(key,exactAdd(annualBuys.has(key)?annualBuys.get(key)!:'0',event.buy));}
  for(const row of result.rows)if(row.kind==='DIVIDEND')row.rateDenominator=annualBuys.get(row.security.id+':'+row.date.slice(0,4))??null;
  const events=filtered(source.years.flatMap(y=>y.events),scope),last=result.rows.at(-1),stock=scope.securityId?await prisma.security.findUnique({where:{id:scope.securityId},select:{name:true,symbol:true}}):null;
  return {data:{...result,accountId:String(accountId),security:stock,scope:{securityId:scope.securityId?String(scope.securityId):null,year:scope.year??null,month:scope.month??null},months:months(events),totals:profitTotals(events),snapshot:encode(snapshot),nextCursor:result.hasNext&&last?encode({at:last.at,kind:last.kind,id:last.id}):null}};
 });
}
