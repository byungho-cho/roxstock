import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
export const metricKeys=['eps','bps','per','pbr','roe'] as const;
export type MetricValues=Record<typeof metricKeys[number],string|null>;
export type Supplemental={shares?:{outstanding:string;preferred:boolean;receiptNo:string};price?:{value:string;date:string;source:string}};
const dec=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?new Prisma.Decimal(v):null;
const text=(v:Prisma.Decimal|null)=>v?.toDecimalPlaces(4).toString()??null;
function source(f:DartFinancialFiling,key:string,ytd=false){const sources=f.accountSources as Record<string,{amount?:string;ytdAmount?:string}>|null;return dec(ytd?sources?.[key]?.ytdAmount:sources?.[key]?.amount);}
/** Period-end retrospective ratios, not point-in-time investment signals. */
export function calculatePeriod(f:DartFinancialFiling,previous:DartFinancialFiling|undefined,supplemental:Supplemental={}) {
 const annual=f.periodType==='ANNUAL',months=annual?12:f.periodType==='Q1'?3:f.periodType==='Q2'?6:9;
 const comparable=previous?.fsDivision===f.fsDivision&&previous.fiscalYear===f.fiscalYear-1&&previous.periodType==='ANNUAL';
 const parentProfit=source(f,'parentNetIncome',!annual)??(annual?source(f,'parentNetIncome'):null),parentEquity=source(f,'parentEquity'),previousParent=comparable?source(previous!,'parentEquity'):null;
 const useParent=!!parentProfit&&!!parentEquity&&!!previousParent;
 const profit=useParent?parentProfit:f.netIncomeYtd,equity=useParent?parentEquity:f.totalEquity,opening=comparable?(useParent?previousParent:previous!.totalEquity):null;
 const average=opening&&equity?opening.plus(equity).div(2):null;
 const roe=profit&&average?.gt(0)?profit.mul(12).div(months).div(average).mul(100):null;
 // Disclosed basic EPS uses issuer weighted-average ordinary shares, never today's shares.
 const epsSource=source(f,'basicEps',!annual)??(annual?source(f,'basicEps'):null);
 const eps=epsSource?.mul(12).div(months)??null;
 const shares=supplemental.shares?.receiptNo===f.receiptNo&&!supplemental.shares.preferred?dec(supplemental.shares.outstanding):null;
 const ownerEquity=f.fsDivision==='CFS'?parentEquity:f.totalEquity;
 const bps=ownerEquity&&shares?.gt(0)?ownerEquity.div(shares):null;
 const end=f.periodEndDate.toISOString().slice(0,10),priceInfo=supplemental.price;
 const age=priceInfo?(Date.parse(end)-Date.parse(priceInfo.date))/86400000:NaN;
 const price=priceInfo&&age>=0&&age<=7?dec(priceInfo.value):null;
 const per=price?.gt(0)&&eps?.gt(0)?price.div(eps):null,pbr=price?.gt(0)&&bps?.gt(0)?price.div(bps):null;
 const values:MetricValues={eps:text(eps),bps:text(bps),per:text(per),pbr:text(pbr),roe:text(roe)};
 const reasons:Record<string,string>={};
 if(!eps)reasons.eps='공시 기본 EPS/가중평균 보통주 근거 부족';
 if(!bps)reasons.bps=supplemental.shares?.preferred?'우선주 자본 배분 근거 부족':'동일 공시의 유통주식수 또는 소유주 자본 부족';
 if(!per)reasons.per=!price?'재무기간 말 7일 이내 과거 종가 미확보':!eps?'EPS 근거 부족':'EPS가 0 이하';
 if(!pbr)reasons.pbr=!price?'재무기간 말 7일 이내 과거 종가 미확보':!bps?'BPS 근거 부족':'BPS가 0 이하';
 if(!roe)reasons.roe='동일 연결/별도 전기말·당기말 자본 또는 누적순이익 부족';
 return {values,reasons,provenance:{version:1,source:'OPEN_DART',receiptNo:f.receiptNo,disclosedAt:f.receiptDate.toISOString().slice(0,10),periodEnd:end,fsDivision:f.fsDivision,roeBasis:useParent?'OWNERS_OF_PARENT':'TOTAL_SAME_DIVISION',roeDenominator:'AVERAGE_PREVIOUS_YEAR_END_AND_PERIOD_END',flow:annual?'ANNUAL':'YTD_ANNUALIZED_NOT_TTM',months,epsBasis:'DISCLOSED_BASIC_EPS_WEIGHTED_AVERAGE_ORDINARY_SHARES',bpsBasis:'OWNERS_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED',priceDate:priceInfo?.date??null,priceSource:priceInfo?.source??null,retrospective:true}};
}
export function preserveValues(existing:unknown,incoming:MetricValues):MetricValues {
 const old=existing as Partial<MetricValues>|null;
 return Object.fromEntries(metricKeys.map(k=>[k,old?.[k]??incoming[k]])) as MetricValues;
}
