import {combinedStockFlows} from '../domain/investor-exchange.js';
import type {FastifyInstance} from 'fastify';
import {Prisma} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';

const startDate='2026-10-16';
const seoulDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const iso=(date:Date)=>date.toISOString().slice(0,10);
const subjects=['INDIVIDUAL','FOREIGN','INSTITUTION'];
type Flow=Prisma.InvestorFlowDailyGetPayload<{}>;
function preferredFlows(rows:Flow[],metric:string,combined=false){
 if(combined)return combinedStockFlows(rows,metric);
 // Expose stored market quantities in the market source unit of thousand shares.
 if(metric==='quantity')rows=rows.map(row=>{
  if(row.source!=='KIS_API'||row.exchangeScope!=='KIS_MARKET'||row.netQuantity!==null)return row;
  const raw=row.raw;
  const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw.netQuantity:null;
  return typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value)?{...row,netQuantity:new Prisma.Decimal(value)}:row;
 });
 const grouped=new Map<string,Flow[]>();for(const row of rows){const key=iso(row.tradeDate);grouped.set(key,[...(grouped.get(key)??[]),row]);}
 return [...grouped.values()].flatMap(day=>{
  const kis=day.filter(row=>row.source==='KIS_API'&&['KRX','KIS_MARKET','KRX_NXT'].includes(row.exchangeScope)&&(metric==='amount'?row.amountUnit==='KRW':row.quantityUnit==='SHARE'||row.exchangeScope==='KIS_MARKET'));
  const field=metric==='amount'?'netAmount':'netQuantity';
  const preferred=subjects.every(actor=>kis.some(row=>row.investorCode===actor&&row[field]!==null))?'KIS_API':'NAVER_WEB';
  return day.filter(row=>row.source===preferred&&subjects.includes(row.investorCode)&&(preferred!=='KIS_API'||['KRX','KIS_MARKET'].includes(row.exchangeScope)));
 });
}
function date(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||iso(new Date(value+'T00:00:00Z'))!==value)throw new ApiError(400,'INVALID_DATE','날짜를 확인해 주세요.');
 return new Date(value+'T00:00:00Z');
}
export async function investorTrendRoutes(app:FastifyInstance,options:{db?:typeof prisma}={}){
 const store=options.db??prisma;
 app.get<{Querystring:{type?:string;target?:string;date?:string;metric?:string;cursor?:string;scope?:string}}>('/investor-trends/history',async request=>{
  const q=request.query,type=q.type??'MARKET',target=q.target??'KOSPI',selected=q.date??seoulDate(),metric=q.metric??'amount';
  if(q.scope!==undefined&&(type!=='STOCK'||!['KRX','COMBINED'].includes(q.scope)))throw new ApiError(400,'INVALID_SCOPE','거래소 범위를 확인해 주세요.');
  if(!['MARKET','STOCK'].includes(type)||(type==='MARKET'?!['KOSPI','KOSDAQ'].includes(target):!/^[A-Z0-9]{6}$/.test(target))||!['amount','quantity'].includes(metric))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const end=date(selected),cursor=q.cursor?date(q.cursor):null;
  if(selected>seoulDate()||(cursor&&cursor>end))throw new ApiError(400,'INVALID_DATE','조회 날짜를 확인해 주세요.');
  const where={targetType:type,targetKey:target,source:{in:['NAVER_WEB','KIS_API']},tradeDate:{lte:end,...(cursor?{lt:cursor}:{})}};
  // One extra stored date determines whether another page exists.
  const days=await store.investorFlowDaily.groupBy({by:['tradeDate'],where,orderBy:{tradeDate:'desc'},take:51});
  const observations=days.length?preferredFlows(await store.investorFlowDaily.findMany({where:{...where,tradeDate:{in:days.map(row=>row.tradeDate)}},orderBy:[{tradeDate:'desc'},{investorCode:'asc'}]}),metric,type==='STOCK'&&q.scope==='COMBINED'):[];
  const netField=metric==='amount'?'netAmount':'netQuantity';
  const priceAt=(day:Date|undefined,field:'closingPrice'|'closeChange')=>{
   if(!day)return null;
   const row=observations.find(row=>row.tradeDate.getTime()===day.getTime()&&['KRX','KIS_MARKET','KRX_NXT'].includes(row.exchangeScope));
   const raw=row?.raw;
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
   const value=raw[field];
   return typeof value==='string'&&(field==='closingPrice'?/^\d+(\.\d+)?$/:/^-?\d+(\.\d+)?$/).test(value)?new Prisma.Decimal(value):null;
  };
  const rows=days.slice(0,50).map(day=>{
   const close=priceAt(day.tradeDate,'closingPrice');
   // Provider's signed previous-trading-day change avoids comparing across uncollected dates.
   const change=close?priceAt(day.tradeDate,'closeChange'):null;
   return {date:iso(day.tradeDate),close:close?.toString()??null,closeChange:change?.toString()??null,values:Object.fromEntries(subjects.map(actor=>{
    const row=observations.find(row=>row.tradeDate.getTime()===day.tradeDate.getTime()&&row.investorCode===actor&&['KRX','KIS_MARKET','KRX_NXT'].includes(row.exchangeScope)&&(metric==='amount'?row.amountUnit==='KRW':row.quantityUnit==='SHARE'||row.exchangeScope==='KIS_MARKET'));
    return [actor,row?.[netField]?.toString()??null];
   }))};
  });
  return {data:{rows,nextCursor:days.length>50?rows.at(-1)!.date:null,metric,unit:metric==='amount'?'KRW':type==='MARKET'?'THOUSAND_SHARES':'SHARE'}};
 });
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
 app.get<{Querystring:{type?:string;target?:string;date?:string;period?:string;metric?:string;scope?:string}}>('/investor-trends',async request=>{
  const q=request.query,type=q.type??'MARKET',target=q.target??'KOSPI',selected=q.date??seoulDate(),period=q.period??'30',metric=q.metric??'amount';
  if(q.scope!==undefined&&(type!=='STOCK'||!['KRX','COMBINED'].includes(q.scope)))throw new ApiError(400,'INVALID_SCOPE','거래소 범위를 확인해 주세요.');
  if(!['MARKET','STOCK'].includes(type)||(type==='MARKET'?!['KOSPI','KOSDAQ'].includes(target):!/^[A-Z0-9]{6}$/.test(target))||!['30','60','120','180','1y','3y'].includes(period)||!['amount','quantity'].includes(metric))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const end=date(selected),requestedStart=new Date(end);
  if(selected>seoulDate())throw new ApiError(400,'FUTURE_DATE','미래 날짜는 조회할 수 없습니다.');
  if(period==='1y'||period==='3y')requestedStart.setUTCFullYear(requestedStart.getUTCFullYear()-(period==='1y'?1:3));
  else requestedStart.setUTCDate(requestedStart.getUTCDate()-Number(period)+1);
  const effectiveStart=requestedStart; // Read stored one-off observations too; automatic collection still starts at startDate.
  const observations=effectiveStart<=end?preferredFlows(await store.investorFlowDaily.findMany({where:{targetType:type,targetKey:target,source:{in:['NAVER_WEB','KIS_API']},tradeDate:{gte:effectiveStart,lte:end}},orderBy:[{tradeDate:'asc'},{investorCode:'asc'}]}),metric,type==='STOCK'&&q.scope==='COMBINED'):[];
  const selectedRows=observations.filter(r=>iso(r.tradeDate)===selected);
  const suffix=metric==='amount'?'Amount':'Quantity';
  const field=(prefix:'buy'|'sell'|'net')=>(prefix+suffix) as 'buyAmount'|'sellAmount'|'netAmount'|'buyQuantity'|'sellQuantity'|'netQuantity';
  const available=observations.filter(r=>['KRX','KIS_MARKET','KRX_NXT'].includes(r.exchangeScope)&&r[field('net')]!==null);
  const actualStart=available[0]?.tradeDate,actualEnd=available.at(-1)?.tradeDate;
  const byDay=new Map<string,typeof observations>();for(const row of available){const key=iso(row.tradeDate);byDay.set(key,[...(byDay.get(key)??[]),row]);}
  const cumulative=Object.fromEntries(subjects.map(s=>[s,new Prisma.Decimal(0)]));let gap=false;
  // Coverage is committed atomically with provider pages. An expected trading date
  // missing from observations still breaks the line; a confirmed non-trading date does not.
  const historyItem=await store.collectorRunItem?.findFirst({where:{symbol:target,run:{jobType:'investor-trends-backfill',provider:'KIS_API'}},orderBy:{id:'desc'},select:{diagnostics:true}});
  const coverage=historyItem?.diagnostics as {tradingDates?:string[];from?:string;until?:string;oldest?:string}|null;
  const knownDates=Array.isArray(coverage?.tradingDates)?new Set(coverage.tradingDates):null;
  const coverageFrom=coverage?.from&&coverage?.oldest?(coverage.from>coverage.oldest?coverage.from:coverage.oldest):null;
  const points:Array<{date:string;values:Record<string,string|null>;close:string|null;closeChange:string|null}> = [];
  if(actualStart&&actualEnd)for(const cursor=new Date(actualStart);cursor<=actualEnd;cursor.setUTCDate(cursor.getUTCDate()+1)){
   const key=iso(cursor),rows=byDay.get(key)??[];
   if(!rows.length&&[0,6].includes(cursor.getUTCDay()))continue;
   if(!rows.length&&knownDates&&coverageFrom&&coverage?.until&&key>=coverageFrom&&key<=coverage.until&&!knownDates.has(key))continue;
   const values:Record<string,string|null>={};
   for(const actor of subjects){const row=rows.find(r=>r.investorCode===actor),value=row?.[field('net')];if(value==null)gap=true;else cumulative[actor]=cumulative[actor]!.plus(value);values[actor]=gap?null:cumulative[actor]!.toString();}
   // An uncollected business day makes the requested running total unknown.
   if(gap)for(const actor of subjects)values[actor]=null;
      const raw=observations.find(row=>iso(row.tradeDate)===key)?.raw;
   const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:null;
   const close=typeof source?.closingPrice==='string'&&/^\d+(\.\d+)?$/.test(source.closingPrice)?source.closingPrice:null;
   const closeChange=typeof source?.closeChange==='string'&&/^-?\d+(\.\d+)?$/.test(source.closeChange)?source.closeChange:null;
   points.push({date:key,values,close,closeChange});
  }
  const rows=selectedRows.map(r=>({code:r.investorCode,name:r.investorName,buy:r[field('buy')]?.toString()??null,sell:r[field('sell')]?.toString()??null,net:r[field('net')]?.toString()??null,source:r.source,exchangeScope:r.exchangeScope,publicationStatus:r.publicationStatus,reason:r.reason}));
  const reason=type==='STOCK'&&q.scope==='COMBINED'?'한국투자증권 KRX+NXT 합계. 양 거래소 자료가 있는 날짜만 합산하며 미수집은 0으로 보지 않습니다. 종가는 KRX 기준입니다.':type==='MARKET'?'한국투자증권 시장별 순매수 · 금액 원본 백만원. 수량은 원본 천주 단위. NXT 시장 합계 미연결이며 일부 종목을 시장 전체로 합산하지 않습니다.':selectedRows.some(row=>row.source==='KIS_API')?'한국투자증권 KRX · 금액 원본 백만원 단위 · 확정 여부 미제공. 네이버 자료와 중복 합산하지 않습니다.':'KRX 수량만 제공됩니다. 금액·기관 세부 주체·확정 여부는 미제공입니다.';
  return {data:{aggregation:type==='STOCK'&&q.scope==='COMBINED'?'KRX_NXT':'SINGLE_SOURCE',type,target,selectedDate:selected,requestedFrom:iso(requestedStart),from:iso(effectiveStart),actualFrom:actualStart?iso(actualStart):null,actualTo:actualEnd?iso(actualEnd):null,metric,unit:available.length?(metric==='amount'?'KRW':type==='MARKET'?'THOUSAND_SHARES':'SHARE'):null,rows,points,status:!selectedRows.length?'NO_DATA':rows.every(r=>r.net===null)?'UNVERIFIED_OR_UNSUPPORTED':'PARTIAL',updatedAt:selectedRows.length?new Date(Math.max(...selectedRows.map(r=>r.updatedAt.getTime()))).toISOString():null,partial:gap||!actualStart||actualStart>requestedStart||!actualEnd||actualEnd<end,reason,collectionStartDate:startDate,historyBackfill:process.env.INVESTOR_BACKFILL_ENABLED==='false'?'DISABLED':coverage?.from?'AVAILABLE':'PENDING',historyFrom:coverage?.from??null}};
 });
}
