import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {financialCurrency} from './financial-currency.js';
const D=Prisma.Decimal.clone({precision:60});
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const decimal=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new D(v):null;
export const closingParentRoePolicy='CLOSING_PARENT_EQUITY_V1';
/** The caller verifies annual duration and exact receipt/division before use. */
export function closingParentRoe(f:DartFinancialFiling){
 if(f.periodType!=='ANNUAL'||f.fsDivision!=='CFS'||financialCurrency(f)!=='KRW')return null;
 const accounts=object(f.accountSources),income=object(accounts.parentNetIncome),capital=object(accounts.parentEquity);
 const profit=decimal(income.ytdAmount??income.amount),equity=decimal(capital.amount);
 if(!profit||!equity?.gt(0))return null;
 return {value:profit.div(equity).mul(100).toDecimalPlaces(4).toString(),profit:profit.toString(),equity:equity.toString(),receiptNo:f.receiptNo,periodEnd:f.periodEndDate.toISOString().slice(0,10),fsDivision:f.fsDivision,policy:closingParentRoePolicy};
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
