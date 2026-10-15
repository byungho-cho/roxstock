import {Prisma} from '../generated/prisma/index.js';
export interface AnnualConsensus {
  symbol: string; fiscalYear: number; kind: 'ANNUAL_ESTIMATE'; asOf: string;
  source: string; sourceUrl: string; division: 'CFS' | 'OFS'; ownership: 'OWNERS_OF_PARENT' | 'TOTAL';
  shareClass: 'ORDINARY'; shareBasisDate: string;
  eps: string | null; bps: string | null; netIncome: string | null; openingEquity: string | null; closingEquity: string | null;
}
export const decimal=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?new Prisma.Decimal(v):null;
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
