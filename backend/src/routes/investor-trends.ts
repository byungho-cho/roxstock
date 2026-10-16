import type {FastifyInstance} from 'fastify';
import {Prisma} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';

const startDate='2026-10-16';
const seoulDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const iso=(date:Date)=>date.toISOString().slice(0,10);
const subjects=['INDIVIDUAL','FOREIGN','INSTITUTION'];
function date(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||iso(new Date(value+'T00:00:00Z'))!==value)throw new ApiError(400,'INVALID_DATE','날짜를 확인해 주세요.');
 return new Date(value+'T00:00:00Z');
}
export async function investorTrendRoutes(app:FastifyInstance,options:{db?:typeof prisma}={}){
 const store=options.db??prisma;
 app.get<{Params:{accountId:string}}>('/accounts/:accountId/investor-targets',async request=>{
  const accountId=id(request.params.accountId,'accountId');
  const account=await store.account.findUnique({where:{id:accountId}});
  if(!account?.isActive)throw new ApiError(404,'ACCOUNT_NOT_FOUND','계좌를 확인해 주세요.');
  const securities=await store.security.findMany({where:{OR:[{buyTrades:{some:{accountId}}},{accountWatchlistItems:{some:{accountId}}}]},include:{buyTrades:{where:{accountId},select:{quantity:true,sellTrades:{select:{quantity:true}}}},accountWatchlistItems:{where:{accountId},select:{listType:true}}},orderBy:{symbol:'asc'}});
  return {data:securities.map(s=>{
   const held=s.buyTrades.reduce((sum,b)=>sum.plus(b.quantity).minus(b.sellTrades.reduce((n,t)=>n.plus(t.quantity),new Prisma.Decimal(0))),new Prisma.Decimal(0));
   const watched=s.accountWatchlistItems.some(w=>w.listType==='WATCHLIST');
   return {id:String(s.id),symbol:s.symbol,name:s.name,classification:held.greaterThan(0)?'보유':watched?'관심':'거래'};
  })};
 });
 app.get<{Querystring:{type?:string;target?:string;date?:string;period?:string;metric?:string}}>('/investor-trends',async request=>{
  const q=request.query,type=q.type??'MARKET',target=q.target??'KOSPI',selected=q.date??seoulDate(),period=q.period??'30',metric=q.metric??'amount';
  if(!['MARKET','STOCK'].includes(type)||(type==='MARKET'?!['KOSPI','KOSDAQ'].includes(target):!/^[A-Z0-9]{6}$/.test(target))||!['30','60','120','180','1y','3y'].includes(period)||!['amount','quantity'].includes(metric))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const end=date(selected),requestedStart=new Date(end);
  if(selected>seoulDate())throw new ApiError(400,'FUTURE_DATE','미래 날짜는 조회할 수 없습니다.');
  if(period==='1y'||period==='3y')requestedStart.setUTCFullYear(requestedStart.getUTCFullYear()-(period==='1y'?1:3));
  else requestedStart.setUTCDate(requestedStart.getUTCDate()-Number(period)+1);
  const effectiveStart=new Date(Math.max(requestedStart.getTime(),date(startDate).getTime()));
  const observations=effectiveStart<=end?await store.investorFlowDaily.findMany({where:{targetType:type,targetKey:target,source:'NAVER_WEB',tradeDate:{gte:effectiveStart,lte:end}},orderBy:[{tradeDate:'asc'},{investorCode:'asc'}]}):[];
  const selectedRows=observations.filter(r=>iso(r.tradeDate)===selected);
  const suffix=metric==='amount'?'Amount':'Quantity';
  const field=(prefix:'buy'|'sell'|'net')=>(prefix+suffix) as 'buyAmount'|'sellAmount'|'netAmount'|'buyQuantity'|'sellQuantity'|'netQuantity';
  const available=observations.filter(r=>r.exchangeScope==='KRX'&&r[field('net')]!==null);
  const actualStart=available[0]?.tradeDate,actualEnd=available.at(-1)?.tradeDate;
  const byDay=new Map<string,typeof observations>();for(const row of available){const key=iso(row.tradeDate);byDay.set(key,[...(byDay.get(key)??[]),row]);}
  const cumulative=Object.fromEntries(subjects.map(s=>[s,new Prisma.Decimal(0)]));let gap=false;
  const points:Array<{date:string;values:Record<string,string|null>}> = [];
  if(actualStart&&actualEnd)for(const cursor=new Date(actualStart);cursor<=actualEnd;cursor.setUTCDate(cursor.getUTCDate()+1)){
   const key=iso(cursor),rows=byDay.get(key)??[];
   if(!rows.length&&[0,6].includes(cursor.getUTCDay()))continue;
   const values:Record<string,string|null>={};
   for(const actor of subjects){const row=rows.find(r=>r.investorCode===actor),value=row?.[field('net')];if(value==null)gap=true;else cumulative[actor]=cumulative[actor]!.plus(value);values[actor]=gap?null:cumulative[actor]!.toString();}
   // An uncollected business day makes the requested running total unknown.
   if(gap)for(const actor of subjects)values[actor]=null;
   points.push({date:key,values});
  }
  const rows=selectedRows.map(r=>({code:r.investorCode,name:r.investorName,buy:r[field('buy')]?.toString()??null,sell:r[field('sell')]?.toString()??null,net:r[field('net')]?.toString()??null,source:r.source,exchangeScope:r.exchangeScope,publicationStatus:r.publicationStatus,reason:r.reason}));
  return {data:{type,target,selectedDate:selected,requestedFrom:iso(requestedStart),from:iso(effectiveStart),actualFrom:actualStart?iso(actualStart):null,actualTo:actualEnd?iso(actualEnd):null,metric,unit:available.length?(metric==='amount'?'KRW':'SHARE'):null,rows,points,status:!selectedRows.length?'NO_DATA':rows.every(r=>r.net===null)?'UNVERIFIED_OR_UNSUPPORTED':'PARTIAL',updatedAt:selectedRows.length?new Date(Math.max(...selectedRows.map(r=>r.updatedAt.getTime()))).toISOString():null,partial:gap||!actualStart||actualStart>requestedStart||!actualEnd||actualEnd<end,reason:type==='MARKET'?'시장 원본의 단위·거래소 범위 확인 전입니다. 검증되지 않은 값은 표시하지 않습니다.':'KRX 수량만 제공됩니다. 금액·기관 세부 주체·확정 여부는 미제공입니다.',collectionStartDate:startDate,historyBackfill:'DEFERRED'}};
 });
}
