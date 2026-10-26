import {financialCurrency,sameFinancialCurrency,currencyConversionRequired,FX_REQUIRED} from './financial-currency.js';
import {bookValueShares} from './share-counts.js';
import {commonEpsReviewMatches} from './common-eps-review.js';
import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import type {PeriodShares} from './share-counts.js';
const ExactDecimal=Prisma.Decimal.clone({precision:100,toExpPos:100,toExpNeg:-100});
export const metricKeys=['eps','bps','per','pbr','roe'] as const;
export type MetricValues=Record<typeof metricKeys[number],string|null>;
export type FiscalDuration={method:"DART_MAJOR_ACCOUNTS_MATCH"|"DART_PUBLIC_FILING_ACCOUNTS_MATCH";sourceUrl?:string;contentSha256?:string;openingParentEquity?:string;receiptNo:string;fsDivision:string;start:string;end:string;months:number;annualization?:'ACT_365';days?:number;openingDate?:string;openingEquity?:string;verifiedAt:string};
export type OrdinaryEpsBasis={method:'DART_WEIGHTED_ORDINARY_SHARES_EQUAL_PERIOD_END'|'DART_FISCAL_YTD_WEIGHTED_SHARES_EQUAL_PERIOD_END';fiscalStart?:string;receiptNo:string;fsDivision:string;periodEnd:string;weightedShares:string;disclosedEps:string;profit:string;sourceUrl:string;contentSha256:string};
export type FiscalEpsReview={method:'DART_PUBLIC_FISCAL_EPS_RECONCILED';receiptNo:string;fsDivision:string;start:string;end:string;profit:string;weightedShares:string;eps:string;calculated:boolean;sourceUrl:string;contentSha256:string};
export type OpeningCapitalReview={method:'DART_PUBLIC_ADJACENT_CAPITAL_RECONCILED';receiptNo:string;fsDivision:string;start:string;end:string;openingDate:string;openingTotalEquity:string;openingParentEquity?:string;closingTotalEquity:string;closingParentEquity?:string;sourceUrl:string;contentSha256:string};
export type CommonEpsReview={disclosedRoundingTolerance?:'1';arithmeticDifference?:string;method:'DART_PUBLIC_COMMON_EPS_RECONCILED';receiptNo:string;fsDivision:string;fiscalYear:number;periodEnd:string;parentProfit:string;reportedParentProfit:string;parentTolerance:string;commonProfit:string;weightedShares:string;eps:string;calculated:boolean;sourceUrl:string;contentSha256:string};
export type Supplemental={priceAvailability?:import('./listing-period.js').ListingPeriodReview;commonEpsReview?:CommonEpsReview;openingCapitalReview?:OpeningCapitalReview;fiscalEpsReview?:FiscalEpsReview;ordinaryEpsBasis?:OrdinaryEpsBasis;collectionAttempt?:{at:string;source:string};fiscalDuration?:FiscalDuration;accounts?:{currency?:string;receiptNo:string;fsDivision:string;collectedAt:string;sources:Record<string,{amount?:string|null;ytdAmount?:string|null;accountName?:string;ordinaryEpsVerified?:boolean;calculatedFromWeightedShares?:boolean;periodEnd?:string|null}>};errors?:Record<string,string>;shares?:PeriodShares;basis?:{epsPriceCompatible:boolean;bpsPriceCompatible:boolean;source:string;verifiedAt:string;receiptNo?:string;reason?:string};price?:{symbol?:string;value:string;date:string;source:string;collectedAt?:string;shareBasis?:string;listedShares?:string;isin?:string;market?:string;parValue?:string;periodBasis?:{method:string;symbol:string;periodEnd:string;disclosedAt:string;from:string;through:string;observations:number;verifiedAt:string}}};
const dec=(v:unknown)=>typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v)?new ExactDecimal(v):null;
const amount=(v:Prisma.Decimal|null)=>v==null?null:new ExactDecimal(v.toString());
const text=(v:Prisma.Decimal|null)=>v?.toDecimalPlaces(4).toString()??null;
function source(f:DartFinancialFiling,key:string,ytd=false){const sources=f.accountSources as Record<string,{amount?:string;ytdAmount?:string}>|null;return dec(ytd?sources?.[key]?.ytdAmount:sources?.[key]?.amount);}
export function fiscalDurationMatches(f:Pick<DartFinancialFiling,'receiptNo'|'fsDivision'|'periodEndDate'>,d:FiscalDuration|undefined):d is FiscalDuration {
 if(!d||!['DART_MAJOR_ACCOUNTS_MATCH','DART_PUBLIC_FILING_ACCOUNTS_MATCH'].includes(d.method)||d.receiptNo!==f.receiptNo||d.fsDivision!==f.fsDivision||d.end!==f.periodEndDate.toISOString().slice(0,10)||!/^\d{4}-\d{2}-\d{2}$/.test(d.start))return false;
 if(d.method==='DART_PUBLIC_FILING_ACCOUNTS_MATCH'){try{const u=new URL(d.sourceUrl??'');if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==f.receiptNo||!(/^[a-f0-9]{64}$/).test(d.contentSha256??''))return false;}catch{return false;}}
 const start=new Date(d.start),end=new Date(d.end);
 if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==d.start||start>end)return false;
 const months=(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth()+1;
 const days=(end.getTime()-start.getTime())/86400000+1;
 if(d.annualization==='ACT_365'?d.days!==days||days<1||days>366:!d.start.endsWith('-01'))return false;
 return d.months===months&&months>=1&&months<=12&&new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).toISOString().slice(0,10)===d.end;
}
/** Period-end retrospective ratios, not point-in-time investment signals. */
export function calculatePeriod(f:DartFinancialFiling,previous:DartFinancialFiling|undefined,supplemental:Supplemental={}) {
 const currency=financialCurrency(f),foreign=currencyConversionRequired(currency);
 const resolution=(f.sourceValidation as {periodResolution?:{originalReason?:string}}|null)?.periodResolution;
 const duration=supplemental.fiscalDuration;
 const verified=fiscalDurationMatches(f,duration);
 const durationReview=(!!resolution||!!duration)&&!verified;
 const accounts=supplemental.accounts?.receiptNo===f.receiptNo&&supplemental.accounts.fsDivision===f.fsDivision&&(supplemental.accounts.currency??'KRW')===currency?supplemental.accounts:undefined;
 const periodSource=(key:string,ytd=false)=>source(f,key,ytd)??dec(ytd?accounts?.sources[key]?.ytdAmount:accounts?.sources[key]?.amount);
 const annual=f.periodType==='ANNUAL',months=verified?duration.months:annual?12:f.periodType==='Q1'?3:f.periodType==='Q2'?6:9;
 const annualFactor=verified&&duration.annualization==='ACT_365'?new ExactDecimal(365).div(duration.days!):new ExactDecimal(12).div(months);
 const comparable=!resolution&&!verified&&sameFinancialCurrency(f,previous)&&previous?.fsDivision===f.fsDivision&&previous.fiscalYear===f.fiscalYear-1&&previous.periodType==='ANNUAL';
 const parentProfit=periodSource('parentNetIncome',!annual)??(annual?periodSource('parentNetIncome'):null),parentEquity=periodSource('parentEquity'),previousParent=comparable?source(previous!,'parentEquity'):null;
 const priorDate=new Date(f.periodEndDate);priorDate.setUTCFullYear(priorDate.getUTCFullYear()-1);
 const comparative=(key:string)=>{const row=accounts?.sources[key];return annual&&row?.periodEnd===priorDate.toISOString().slice(0,10)?dec(row.amount):null;};
 const fiscalOpeningDate=verified?new Date(Date.parse(duration.start)-86400000).toISOString().slice(0,10):null;
 const exactOpening=(key:string)=>verified&&accounts?.sources[key]?.periodEnd===fiscalOpeningDate?dec(accounts.sources[key]?.amount):null;
 const openingParent=verified?((duration.openingDate===fiscalOpeningDate?dec(duration.openingParentEquity):null)??exactOpening('openingParentEquity')):previousParent??(!resolution?comparative('openingParentEquity'):null);
 const useParent=!!parentProfit&&!!parentEquity&&!!openingParent;
 const fiscalOpening=verified?((duration.openingDate===fiscalOpeningDate?dec(duration.openingEquity):null)??exactOpening('openingTotalEquity')):null;
 const profit=useParent?parentProfit:amount(f.netIncomeYtd),equity=useParent?parentEquity:amount(f.totalEquity),opening=useParent?openingParent:comparable?amount(previous!.totalEquity):verified?fiscalOpening:!resolution?comparative('openingTotalEquity'):null;
 const average=opening&&equity?opening.plus(equity).div(2):null;
 const roe=!durationReview&&profit&&average?.gt(0)?profit.mul(annualFactor).div(average).mul(100):null;
 // Disclosed basic EPS uses issuer weighted-average ordinary shares, never today's shares.
 const epsSource=commonEpsReviewMatches(f,supplemental)?dec(accounts?.sources.basicEps?.amount):periodSource('basicEps',!annual)??(annual?periodSource('basicEps'):null);
 const eps=durationReview?null:epsSource?.mul(annualFactor)??null;
 const bookShares=bookValueShares(supplemental.shares,f.receiptNo),shares=bookShares?dec(bookShares.count):null;
 const ownerEquity=f.fsDivision==='CFS'?parentEquity:(amount(f.totalEquity)??periodSource('totalEquity'));
 const bps=ownerEquity&&shares?.gt(0)?ownerEquity.div(shares):null;
 const end=f.periodEndDate.toISOString().slice(0,10),priceInfo=supplemental.price;
 const age=priceInfo?(Date.parse(end)-Date.parse(priceInfo.date))/86400000:NaN;
 const price=priceInfo&&age>=0&&age<=7?dec(priceInfo.value):null;
 const strict=priceInfo?.source==='KRX_UNADJUSTED_CLOSE'||priceInfo?.source==='KIS_KRX_UNADJUSTED_CLOSE';
 const sameReceipt=supplemental.basis?.receiptNo===f.receiptNo;
 const epsCompatible=!strict||(sameReceipt&&supplemental.basis?.epsPriceCompatible===true),bpsCompatible=!strict||(sameReceipt&&supplemental.basis?.bpsPriceCompatible===true);
 const per=!foreign&&epsCompatible&&price?.gt(0)&&eps?.gt(0)?price.div(eps):null,pbr=!foreign&&bpsCompatible&&price?.gt(0)&&bps?.gt(0)?price.div(bps):null;
 const values:MetricValues={eps:text(eps),bps:text(bps),per:text(per),pbr:text(pbr),roe:text(roe)};
 const reasons:Record<string,string>={};
 if(!eps)reasons.eps='공시 기본 EPS/가중평균 보통주 근거 부족';
 if(!bps)reasons.bps=supplemental.shares?.preferred?'우선주 자본 배분 근거 부족':'동일 공시의 유통주식수 또는 소유주 자본 부족';
 const nonPositiveEps=eps?.lte(0)??false,nonPositiveBps=bps?.lte(0)??false;
 if(!per)reasons.per=nonPositiveEps?'EPS_NON_POSITIVE':!price?'재무기간 말 7일 이내 과거 종가 미확보':!eps?'EPS 근거 부족':'EPS 근거 검증 필요';
 if(!pbr)reasons.pbr=nonPositiveBps?'BPS_NON_POSITIVE':!price?'재무기간 말 7일 이내 과거 종가 미확보':!bps?'BPS 근거 부족':'BPS 근거 검증 필요';
 if(supplemental.errors?.price&&!price){if(!nonPositiveEps)reasons.per=supplemental.errors.price;if(!nonPositiveBps)reasons.pbr=supplemental.errors.price;}
 if(strict&&price&&eps?.gt(0)&&!epsCompatible)reasons.per='연말 비수정 종가와 공시 EPS의 액면분할·보통주 기준 일치 미확인';
 if(strict&&price&&bps?.gt(0)&&!bpsCompatible)reasons.pbr='연말 비수정 종가와 BPS의 보통주·우선주 자본 배분 기준 일치 미확인';
 if(!roe)reasons.roe='동일 연결/별도 기초·기말 자본 또는 누적순이익 부족';
 if(durationReview){reasons.eps='실제 회계기간 길이 검증 전 연환산 지표 계산 보류';reasons.roe=reasons.eps;}
 if(foreign){if(!nonPositiveEps)reasons.per=FX_REQUIRED;if(!nonPositiveBps)reasons.pbr=FX_REQUIRED;}
 return {values,reasons,provenance:{version:2,currency,amountMultiplier:'1',priceCurrency:'KRW',conversionRequired:foreign,calculationState:durationReview?'FISCAL_DURATION_REVIEW_REQUIRED':'CALCULATED',fiscalDuration:verified?duration:null,financialCollectedAt:f.collectedAt?.toISOString()??null,supplementalAccountsCollectedAt:accounts?.collectedAt??null,calculatedAt:new Date().toISOString(),source:'OPEN_DART',receiptNo:f.receiptNo,disclosedAt:f.receiptDate.toISOString().slice(0,10),periodEnd:end,fsDivision:f.fsDivision,roeBasis:useParent?'OWNERS_OF_PARENT':'TOTAL_SAME_DIVISION',roeDenominator:verified?'AVERAGE_FISCAL_OPENING_AND_CLOSING':'AVERAGE_PREVIOUS_YEAR_END_AND_PERIOD_END',roeOpeningSource:verified&&opening?'EXACT_FISCAL_OPENING_BALANCE':comparable?'PREVIOUS_ANNUAL_FILING':opening?'SAME_FILING_COMPARATIVE_BALANCE':null,flow:verified?'VERIFIED_FISCAL_PERIOD_ANNUALIZED_NOT_TTM':annual?'ANNUAL':'YTD_ANNUALIZED_NOT_TTM',months,epsBasis:(f.accountSources as Record<string,{calculatedFromWeightedShares?:boolean}>|null)?.basicEps?.calculatedFromWeightedShares||accounts?.sources.basicEps?.calculatedFromWeightedShares?'CALCULATED_FROM_DISCLOSED_COMMON_PROFIT_AND_WEIGHTED_SHARES':'DISCLOSED_BASIC_EPS_WEIGHTED_AVERAGE_ORDINARY_SHARES',bpsReferenceOnly:bookShares?.referenceOnly??false,bookShares:bookShares?.count??null,bpsBasis:bookShares?.referenceOnly?'OWNERS_EQUITY_DIV_ALL_OUTSTANDING_REFERENCE':f.fsDivision==='CFS'?'OWNERS_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED':'OFS_TOTAL_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED',sharesReceiptNo:supplemental.shares?.receiptNo??null,sharesCollectedAt:supplemental.shares?.collectedAt??null,priceValue:priceInfo?.value??null,priceDate:priceInfo?.date??null,priceSource:priceInfo?.source??null,priceCollectedAt:priceInfo?.collectedAt??null,priceShareBasis:priceInfo?.shareBasis??null,shareBasisEvidence:supplemental.basis??null,retrospective:true}};
}
export function preserveValues(existing:unknown,incoming:MetricValues):MetricValues {
 const old=existing as Partial<MetricValues>|null;
 return Object.fromEntries(metricKeys.map(k=>[k,old?.[k]??incoming[k]])) as MetricValues;
}
