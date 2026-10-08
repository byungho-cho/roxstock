import { Prisma, type PrismaClient } from '../generated/prisma/index.js';
import { getSeoulClock } from './time.js';
export interface AnnualConsensus {
  symbol: string; fiscalYear: number; kind: 'ANNUAL_ESTIMATE'; asOf: string;
  source: string; sourceUrl: string; division: 'CFS' | 'OFS'; ownership: 'OWNERS_OF_PARENT' | 'TOTAL';
  shareClass: 'ORDINARY'; shareBasisDate: string;
  eps: string | null; bps: string | null; netIncome: string | null; openingEquity: string | null; closingEquity: string | null;
}
const decimal=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?new Prisma.Decimal(v):null;
export function validateConsensus(input:unknown,symbol:string,year:number):AnnualConsensus {
  const v=input as AnnualConsensus;
  if(!v||v.kind!=='ANNUAL_ESTIMATE'||v.symbol!==symbol||v.fiscalYear!==year||v.shareClass!=='ORDINARY'||!['CFS','OFS'].includes(v.division)||v.ownership!==(v.division==='CFS'?'OWNERS_OF_PARENT':'TOTAL')||!v.source||!/^https:\/\//.test(v.sourceUrl)||!/^\d{4}-\d{2}-\d{2}$/.test(v.shareBasisDate)||Number.isNaN(Date.parse(v.shareBasisDate))||Number.isNaN(Date.parse(v.asOf)))throw new Error('CONSENSUS_BASIS_INVALID');
  for(const key of ['eps','bps','netIncome','openingEquity','closingEquity'] as const)if(v[key]!==null&&!decimal(v[key]))throw new Error('CONSENSUS_VALUE_INVALID');
  return v;
}
export function consensusRatios(snapshot:AnnualConsensus,price:{value:string;date:string;source:string}|undefined){
 const eps=decimal(snapshot.eps),bps=decimal(snapshot.bps),close=decimal(price?.value),profit=decimal(snapshot.netIncome),opening=decimal(snapshot.openingEquity),ending=decimal(snapshot.closingEquity);
 const average=opening&&ending?opening.plus(ending).div(2):null;
 const text=(v:Prisma.Decimal|null)=>v?.toDecimalPlaces(4).toString()??null;
 // Price and estimate must use the same post-corporate-action share basis.
 const comparable=price?.date===snapshot.shareBasisDate;
 return {kind:'ANNUAL_ESTIMATE',eps:snapshot.eps,bps:snapshot.bps,per:text(comparable&&close?.gt(0)&&eps?.gt(0)?close.div(eps):null),pbr:text(comparable&&close?.gt(0)&&bps?.gt(0)?close.div(bps):null),roe:text(profit&&average?.gt(0)?profit.div(average).mul(100):null),price:price??null,reasons:{...(!price?{price:'LATEST_PRICE_MISSING'}:!comparable?{price:'ESTIMATE_PRICE_SHARE_BASIS_UNCONFIRMED'}:{}),...(!eps?{eps:'ESTIMATE_EPS_MISSING'}:eps.lte(0)?{per:'ESTIMATE_EPS_NON_POSITIVE'}:{}),...(!bps?{bps:'ESTIMATE_BPS_MISSING'}:bps.lte(0)?{pbr:'ESTIMATE_BPS_NON_POSITIVE'}:{}),...(!profit||!average?.gt(0)?{roe:'ESTIMATE_PROFIT_EQUITY_MISSING'}:{})}};
}
/** Only a licensed, documented provider adapter is accepted; no fallback scraping or TTM substitution. */
export async function fetchAnnualConsensus(symbol:string,now=new Date(),fetcher:typeof fetch=fetch){
 const year=Number(getSeoulClock(now).dateKey.slice(0,4));
 if(process.env.CONSENSUS_TERMS_APPROVED!=='true'||!process.env.CONSENSUS_TERMS_URL)throw new Error('CONSENSUS_TERMS_NOT_APPROVED');
 const endpoint=process.env.CONSENSUS_PROVIDER_URL;if(!endpoint)throw new Error('CONSENSUS_PROVIDER_NOT_CONFIGURED');
 const url=new URL(endpoint);if(url.protocol!=='https:')throw new Error('CONSENSUS_ENDPOINT_INVALID');url.searchParams.set('symbol',symbol);url.searchParams.set('fiscalYear',String(year));
 let response:Response;try{response=await fetcher(url,{headers:{accept:'application/json',...(process.env.CONSENSUS_API_KEY?{authorization:`Bearer ${process.env.CONSENSUS_API_KEY}`}:{})},signal:AbortSignal.timeout(15000)});}catch{throw new Error('CONSENSUS_COMMUNICATION');}
 if(!response.ok)throw new Error(response.status===401?'CONSENSUS_AUTH':response.status===403?'CONSENSUS_PERMISSION':response.status===429?'CONSENSUS_RATE_LIMIT':'CONSENSUS_HTTP');
 let body:unknown;try{body=await response.json();}catch{throw new Error('CONSENSUS_RESPONSE_PARSE');}
 return validateConsensus(body,symbol,year);
}
export async function collectAnnualConsensus(db:PrismaClient,securityId:bigint,symbol:string){
 if(process.env.CONSENSUS_ENABLED!=='true')return {status:'NOT_CONFIGURED',code:'CONSENSUS_DISABLED'};
 if(!(process.env.KRX_VALIDATED_SYMBOLS??'005930').split(',').includes(symbol))return {status:'NOT_VALIDATED',code:'SAMSUNG_FIRST_ROLLOUT'};
 try{
 const year=Number(getSeoulClock().dateKey.slice(0,4));
 const fresh=await db.annualConsensusSnapshot.findFirst({where:{securityId,fiscalYear:year,state:'ESTIMATED',collectedAt:{gte:new Date(Date.now()-3600000)}}});
 if(fresh)return {status:'CURRENT',fiscalYear:year};
 const snapshot=await fetchAnnualConsensus(symbol);
 const key={securityId_fiscalYear_source_asOf:{securityId,fiscalYear:snapshot.fiscalYear,source:snapshot.source,asOf:new Date(snapshot.asOf)}};
 await db.annualConsensusSnapshot.upsert({where:key,create:{securityId,fiscalYear:snapshot.fiscalYear,source:snapshot.source,asOf:new Date(snapshot.asOf),data:snapshot as unknown as Prisma.InputJsonValue},update:{}});
 return {status:'COLLECTED',fiscalYear:snapshot.fiscalYear};
 }catch(error){const safe=error instanceof Error&&/^CONSENSUS_[A-Z_]+$/.test(error.message)?error.message:'CONSENSUS_COLLECTION_FAILED';return {status:'UNAVAILABLE',code:safe};}
}
/** Freeze only a verified historical close. Final values are separate from the preserved estimate payload. */
export async function settleAnnualConsensus(db:PrismaClient,securityId:bigint,year:number,finalValues:unknown,close:{value:string;date:string;source:string}|undefined,complete:boolean){
 if(!close||!/^\d{4}-\d{2}-\d{2}$/.test(close.date)||Number.isNaN(Date.parse(close.date))||!decimal(close.value)?.gt(0)||year>=Number(getSeoulClock().dateKey.slice(0,4))||(Date.parse(`${year}-12-31`)-Date.parse(close.date))/86400000<0||(Date.parse(`${year}-12-31`)-Date.parse(close.date))/86400000>7||close.source!=='KRX_UNADJUSTED_CLOSE')return;
 const where={securityId,fiscalYear:year,state:'ESTIMATED'};
 await db.annualConsensusSnapshot.updateMany({where:{...where,frozenClose:{equals:Prisma.DbNull}},data:{frozenClose:close as Prisma.InputJsonValue}});
 if(complete){
  const stored=await db.annualConsensusSnapshot.findFirst({where,select:{frozenClose:true}});
  const frozen=stored?.frozenClose as {value:string;date:string;source:string}|null;
  const incoming=finalValues as {values:Record<string,string|null>;provenance?:Record<string,unknown>};
  const eps=decimal(incoming.values?.eps),bps=decimal(incoming.values?.bps),price=decimal(frozen?.value);
  if(!frozen||!price?.gt(0)||!eps?.gt(0)||!bps?.gt(0))return;
  const final={...incoming,values:{...incoming.values,per:price.div(eps).toDecimalPlaces(4).toString(),pbr:price.div(bps).toDecimalPlaces(4).toString()},provenance:{...incoming.provenance,priceDate:frozen.date,priceSource:frozen.source,pricePolicy:'FIXED_YEAR_END_CLOSE'}};
  await db.annualConsensusSnapshot.updateMany({where,data:{state:'FINALIZED',finalValues:final as Prisma.InputJsonValue,finalizedAt:new Date()}});
 }
}
/** Run independently of filing availability: a year-end close is fixed before next year's annual filing. */
export async function freezePastEstimates(db:PrismaClient,securityId:bigint,symbol:string,market:string){
 if(process.env.CONSENSUS_ENABLED!=='true')return;
 const currentYear=Number(getSeoulClock().dateKey.slice(0,4));
 const snapshots=await db.annualConsensusSnapshot.findMany({where:{securityId,state:'ESTIMATED',fiscalYear:{lt:currentYear},frozenClose:{equals:Prisma.DbNull}},distinct:['fiscalYear'],select:{fiscalYear:true}});
 const {historicalClose}=await import('./historical-close.js');
 for(const snapshot of snapshots){
  try{await settleAnnualConsensus(db,securityId,snapshot.fiscalYear,{},await historicalClose(symbol,new Date(`${snapshot.fiscalYear}-12-31`),fetch,market),false);}
  catch{console.warn(JSON.stringify({event:'consensus_year_end_unavailable',securityId:String(securityId),year:snapshot.fiscalYear}));break;}
 }
}
