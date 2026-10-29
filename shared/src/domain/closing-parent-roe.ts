import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {financialCurrency} from './financial-currency.js';
import {externalParentAccount} from './external-parent-annual.js';
const D=Prisma.Decimal.clone({precision:60});
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const decimal=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new D(v):null;
export const closingParentRoePolicy='CLOSING_PARENT_EQUITY_V1';
/** The caller verifies annual duration and exact receipt/division before use. */
export function closingParentRoe(f:DartFinancialFiling,supplemental?:unknown){
 if(f.periodType!=='ANNUAL'||f.fsDivision!=='CFS'||financialCurrency(f)!=='KRW')return null;
 const accounts=object(f.accountSources),extra=object(object(supplemental).accounts),sources=object(extra.sources),end=f.periodEndDate.toISOString().slice(0,10);
 const linked=extra.receiptNo===f.receiptNo&&extra.fsDivision===f.fsDivision&&extra.currency==='KRW'&&(extra.amountMultiplier==null||String(extra.amountMultiplier)==='1');
 const fallback=(key:string)=>{const entry=object(sources[key]);if(!linked||entry.periodEnd&&entry.periodEnd!==end||entry.currency&&entry.currency!=='KRW'||entry.amountMultiplier!=null&&String(entry.amountMultiplier)!=='1')return {};
  if(entry.source==='NAVER_FNGUIDE_ANNUAL'&&!externalParentAccount(f,key,entry))return {};
  const derivation=object(entry.derivation);
  if(entry.derivation){
   if(key!=='parentEquity'||derivation.method!=='EXACT_SAME_STATEMENT_EQUITY_MINUS_NCI'||derivation.receiptNo!==f.receiptNo||derivation.currency!=='KRW'||!Array.isArray(derivation.operands)||derivation.operands.length!==2)return {};
   const equity=derivation.operands.find((v:any)=>v.accountId==='ifrs-full_Equity'),nci=derivation.operands.find((v:any)=>v.accountId==='ifrs-full_NoncontrollingInterests');
   const total=decimal(equity?.amount),minority=decimal(nci?.amount),result=decimal(entry.amount),reported=f.totalEquity==null?null:new D(f.totalEquity.toString());
   if(!total||!minority||!result||!reported||!reported.eq(total)||!total.minus(minority).eq(result))return {};
  }
  return entry;
 };
 const directIncome=object(accounts.parentNetIncome),directCapital=object(accounts.parentEquity);
 // Existing direct source has priority. A declared but invalid direct value is never replaced silently.
 const useIncome=directIncome.ytdAmount==null&&directIncome.amount==null,useCapital=directCapital.amount==null;
 const income=useIncome?fallback('parentNetIncome'):directIncome,capital=useCapital?fallback('parentEquity'):directCapital;
 if(income.source==='NAVER_FNGUIDE_ANNUAL'&&!externalParentAccount(f,'parentNetIncome',income)||capital.source==='NAVER_FNGUIDE_ANNUAL'&&!externalParentAccount(f,'parentEquity',capital))return null;
 const profit=decimal(income.ytdAmount??income.amount),equity=decimal(capital.amount);
 if(!profit||!equity?.gt(0))return null;
 return {value:profit.div(equity).mul(100).toDecimalPlaces(4).toString(),profit:profit.toString(),equity:equity.toString(),receiptNo:f.receiptNo,periodEnd:f.periodEndDate.toISOString().slice(0,10),fsDivision:f.fsDivision,policy:closingParentRoePolicy,...(useIncome||useCapital||income.source==='NAVER_FNGUIDE_ANNUAL'||capital.source==='NAVER_FNGUIDE_ANNUAL'?{inputEvidence:{source:income.source==='NAVER_FNGUIDE_ANNUAL'||capital.source==='NAVER_FNGUIDE_ANNUAL'?'MATCHED_NAVER_ANNUAL_AND_DART_TOTALS':'MATCHED_DART_SUPPLEMENTAL_ACCOUNTS',receiptNo:f.receiptNo,fsDivision:f.fsDivision,currency:'KRW',periodEnd:end,parentNetIncome:income,parentEquity:capital}}:{})};
}
export function closingRoeReview(oldValue:unknown,newValue:string,receiptNo:string){
 const old=decimal(oldValue),next=decimal(newValue);if(!old||!next)return null;
 const difference=next.minus(old);if(difference.abs().lt(1))return null;
 return {policy:closingParentRoePolicy,receiptNo,thresholdPP:'1',previousRoe:old.toString(),newRoe:next.toString(),differencePP:difference.toString(),severity:'CAUTION'};
}
export function closingRoeNotices(provenance:unknown):string[]{
 const p=object(provenance),roe=object(object(p.perMetric).roe??p),review=object(roe.roeReview);
 if(roe.roePolicy!==closingParentRoePolicy||review.policy!==closingParentRoePolicy||review.receiptNo!==roe.receiptNo||!decimal(review.differencePP)?.abs().gte(1))return [];
 return [`투자 주의 · ROE 계산 기준 변경: ${review.previousRoe}% → ${review.newRoe}% (차이 ${new D(review.differencePP).toDecimalPlaces(2).toString()}%p). 연말 지배주주 자본 기준이며 항상 보수적인 값은 아닙니다.`];
}
