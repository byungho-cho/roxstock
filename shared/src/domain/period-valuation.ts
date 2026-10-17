import {bookValueShares} from './share-counts.js';
import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import type {PeriodShares} from './share-counts.js';
export const metricKeys=['eps','bps','per','pbr','roe'] as const;
export type MetricValues=Record<typeof metricKeys[number],string|null>;
export type Supplemental={accounts?:{receiptNo:string;fsDivision:string;collectedAt:string;sources:Record<string,{amount?:string|null;ytdAmount?:string|null;accountName?:string;ordinaryEpsVerified?:boolean;periodEnd?:string|null}>};errors?:Record<string,string>;shares?:PeriodShares;basis?:{epsPriceCompatible:boolean;bpsPriceCompatible:boolean;source:string;verifiedAt:string;receiptNo?:string;reason?:string};price?:{value:string;date:string;source:string;collectedAt?:string;shareBasis?:string;listedShares?:string;isin?:string;market?:string;parValue?:string;periodBasis?:{method:string;symbol:string;periodEnd:string;disclosedAt:string;from:string;through:string;observations:number;verifiedAt:string}}};
const dec=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?new Prisma.Decimal(v):null;
const text=(v:Prisma.Decimal|null)=>v?.toDecimalPlaces(4).toString()??null;
function source(f:DartFinancialFiling,key:string,ytd=false){const sources=f.accountSources as Record<string,{amount?:string;ytdAmount?:string}>|null;return dec(ytd?sources?.[key]?.ytdAmount:sources?.[key]?.amount);}
/** Period-end retrospective ratios, not point-in-time investment signals. */
export function calculatePeriod(f:DartFinancialFiling,previous:DartFinancialFiling|undefined,supplemental:Supplemental={}) {
 const resolution=(f.sourceValidation as {periodResolution?:{originalReason?:string}}|null)?.periodResolution;
 if(resolution)return {values:Object.fromEntries(metricKeys.map(k=>[k,null])) as MetricValues,reasons:Object.fromEntries(metricKeys.map(k=>[k,'실제 회계기간 길이 검증 전 연환산 지표 계산 보류'])),provenance:{version:2,source:'OPEN_DART',receiptNo:f.receiptNo,periodEnd:f.periodEndDate.toISOString().slice(0,10),fsDivision:f.fsDivision,calculationState:'FISCAL_DURATION_REVIEW_REQUIRED',retrospective:true}};
 const accounts=supplemental.accounts?.receiptNo===f.receiptNo&&supplemental.accounts.fsDivision===f.fsDivision?supplemental.accounts:undefined;
 const periodSource=(key:string,ytd=false)=>source(f,key,ytd)??dec(ytd?accounts?.sources[key]?.ytdAmount:accounts?.sources[key]?.amount);
 const annual=f.periodType==='ANNUAL',months=annual?12:f.periodType==='Q1'?3:f.periodType==='Q2'?6:9;
 const comparable=previous?.fsDivision===f.fsDivision&&previous.fiscalYear===f.fiscalYear-1&&previous.periodType==='ANNUAL';
 const parentProfit=periodSource('parentNetIncome',!annual)??(annual?periodSource('parentNetIncome'):null),parentEquity=periodSource('parentEquity'),previousParent=comparable?source(previous!,'parentEquity'):null;
 const priorDate=new Date(f.periodEndDate);priorDate.setUTCFullYear(priorDate.getUTCFullYear()-1);
 const comparative=(key:string)=>{const row=accounts?.sources[key];return annual&&row?.periodEnd===priorDate.toISOString().slice(0,10)?dec(row.amount):null;};
 const openingParent=previousParent??comparative('openingParentEquity');
 const useParent=!!parentProfit&&!!parentEquity&&!!openingParent;
 const profit=useParent?parentProfit:f.netIncomeYtd,equity=useParent?parentEquity:f.totalEquity,opening=useParent?openingParent:comparable?previous!.totalEquity:comparative('openingTotalEquity');
 const average=opening&&equity?opening.plus(equity).div(2):null;
 const roe=profit&&average?.gt(0)?profit.mul(12).div(months).div(average).mul(100):null;
 // Disclosed basic EPS uses issuer weighted-average ordinary shares, never today's shares.
 const epsSource=periodSource('basicEps',!annual)??(annual?periodSource('basicEps'):null);
 const eps=epsSource?.mul(12).div(months)??null;
 const bookShares=bookValueShares(supplemental.shares,f.receiptNo),shares=bookShares?dec(bookShares.count):null;
 const ownerEquity=f.fsDivision==='CFS'?parentEquity:(f.totalEquity??periodSource('totalEquity'));
 const bps=ownerEquity&&shares?.gt(0)?ownerEquity.div(shares):null;
 const end=f.periodEndDate.toISOString().slice(0,10),priceInfo=supplemental.price;
 const age=priceInfo?(Date.parse(end)-Date.parse(priceInfo.date))/86400000:NaN;
 const price=priceInfo&&age>=0&&age<=7?dec(priceInfo.value):null;
 const strict=priceInfo?.source==='KRX_UNADJUSTED_CLOSE'||priceInfo?.source==='KIS_KRX_UNADJUSTED_CLOSE';
 const sameReceipt=supplemental.basis?.receiptNo===f.receiptNo;
 const epsCompatible=!strict||(sameReceipt&&supplemental.basis?.epsPriceCompatible===true),bpsCompatible=!strict||(sameReceipt&&supplemental.basis?.bpsPriceCompatible===true);
 const per=epsCompatible&&price?.gt(0)&&eps&&!eps.isZero()?price.div(eps):null,pbr=bpsCompatible&&price?.gt(0)&&bps&&!bps.isZero()?price.div(bps):null;
 const values:MetricValues={eps:text(eps),bps:text(bps),per:text(per),pbr:text(pbr),roe:text(roe)};
 const reasons:Record<string,string>={};
 if(!eps)reasons.eps='공시 기본 EPS/가중평균 보통주 근거 부족';
 if(!bps)reasons.bps=supplemental.shares?.preferred?'우선주 자본 배분 근거 부족':'동일 공시의 유통주식수 또는 소유주 자본 부족';
 if(!per)reasons.per=!price?'재무기간 말 7일 이내 과거 종가 미확보':!eps?'EPS 근거 부족':'EPS가 0이어서 PER 계산 대상 아님';
 if(!pbr)reasons.pbr=!price?'재무기간 말 7일 이내 과거 종가 미확보':!bps?'BPS 근거 부족':'BPS가 0이어서 PBR 계산 대상 아님';
 if(supplemental.errors?.price&&!price){reasons.per=supplemental.errors.price;reasons.pbr=supplemental.errors.price;}
 if(strict&&price&&eps&&!epsCompatible)reasons.per='연말 비수정 종가와 공시 EPS의 액면분할·보통주 기준 일치 미확인';
 if(strict&&price&&bps&&!bpsCompatible)reasons.pbr='연말 비수정 종가와 BPS의 보통주·우선주 자본 배분 기준 일치 미확인';
 if(!roe)reasons.roe='동일 연결/별도 전기말·당기말 자본 또는 누적순이익 부족';
 return {values,reasons,provenance:{version:2,financialCollectedAt:f.collectedAt?.toISOString()??null,supplementalAccountsCollectedAt:accounts?.collectedAt??null,calculatedAt:new Date().toISOString(),source:'OPEN_DART',receiptNo:f.receiptNo,disclosedAt:f.receiptDate.toISOString().slice(0,10),periodEnd:end,fsDivision:f.fsDivision,roeBasis:useParent?'OWNERS_OF_PARENT':'TOTAL_SAME_DIVISION',roeDenominator:'AVERAGE_PREVIOUS_YEAR_END_AND_PERIOD_END',roeOpeningSource:comparable?'PREVIOUS_ANNUAL_FILING':opening?'SAME_FILING_COMPARATIVE_BALANCE':null,flow:annual?'ANNUAL':'YTD_ANNUALIZED_NOT_TTM',months,epsBasis:'DISCLOSED_BASIC_EPS_WEIGHTED_AVERAGE_ORDINARY_SHARES',bpsReferenceOnly:bookShares?.referenceOnly??false,bookShares:bookShares?.count??null,bpsBasis:bookShares?.referenceOnly?'OWNERS_EQUITY_DIV_ALL_OUTSTANDING_REFERENCE':f.fsDivision==='CFS'?'OWNERS_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED':'OFS_TOTAL_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED',sharesReceiptNo:supplemental.shares?.receiptNo??null,sharesCollectedAt:supplemental.shares?.collectedAt??null,priceValue:priceInfo?.value??null,priceDate:priceInfo?.date??null,priceSource:priceInfo?.source??null,priceCollectedAt:priceInfo?.collectedAt??null,priceShareBasis:priceInfo?.shareBasis??null,shareBasisEvidence:supplemental.basis??null,retrospective:true}};
}
export function preserveValues(existing:unknown,incoming:MetricValues):MetricValues {
 const old=existing as Partial<MetricValues>|null;
 return Object.fromEntries(metricKeys.map(k=>[k,old?.[k]??incoming[k]])) as MetricValues;
}
