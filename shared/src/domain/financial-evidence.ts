import {financialCurrency} from './financial-currency.js';
import {Prisma,type DartFinancialFiling,type PeriodValuation} from '../generated/prisma/index.js';
import {commonEpsReviewMatches} from './common-eps-review.js';
import type {Supplemental} from './period-valuation.js';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const numeric=(value:unknown)=>typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value)?value:null;
/** Project verified same-filing DART supplements for both screens without rewriting originals. */
export function supplementedFilings(filings:DartFinancialFiling[],periods:Pick<PeriodValuation,'securityId'|'fiscalYear'|'periodType'|'supplemental'>[]):DartFinancialFiling[]{
 return filings.map(f=>{
  const p=periods.find(p=>p.securityId===f.securityId&&p.fiscalYear===f.fiscalYear&&p.periodType===f.periodType);
  const manual=object(object(p?.supplemental).manualFields);
  if(Object.keys(manual).length)f={...f,accountSources:{...object(f.accountSources)} as Prisma.JsonObject};
  for(const [key,raw] of Object.entries(manual)){
   const entry=object(raw);if(entry.currency!==financialCurrency(f)||entry.fsDivision!==f.fsDivision||entry.periodEnd!==f.periodEndDate.toISOString().slice(0,10)||numeric(entry.value)===null)continue;
   if(['revenueQuarter','revenueYtd','operatingProfitQuarter','operatingProfitYtd','netIncomeQuarter','netIncomeYtd','totalAssets','totalLiabilities','totalEquity','operatingCashFlowQuarter','operatingCashFlowYtd','capitalExpenditureQuarter','capitalExpenditureYtd'].includes(key))(f as any)[key]=new Prisma.Decimal(entry.value as string);
   if(key==='parentNetIncome')(f.accountSources as Prisma.JsonObject).parentNetIncome={amount:String(entry.value),ytdAmount:String(entry.value),source:'MANUAL'};
  }
  const accounts=object(object(p?.supplemental).accounts);
  if((accounts.currency??'KRW')!==financialCurrency(f)||f.isWithdrawn||accounts.receiptNo!==f.receiptNo||accounts.fsDivision!==f.fsDivision)return f;
  const sources={...object(f.accountSources)};
  for(const [key,value]of Object.entries(object(accounts.sources))){
   const incoming=object(value),old=object(sources[key]);
   sources[key]=key==='basicEps'&&commonEpsReviewMatches(f,p?.supplemental as Supplemental)?{...old,...incoming}:{...incoming,...old,amount:old.amount??numeric(incoming.amount),ytdAmount:old.ytdAmount??numeric(incoming.ytdAmount)};
  }
  const result={...f,accountSources:sources as Prisma.JsonObject};
  const amount=(key:string,ytd=false)=>{const item=object(sources[key]);return numeric(ytd?item.ytdAmount??(f.periodType==='ANNUAL'||item.statementDivision==='CF'?item.amount:null):item.amount);};
  for(const [field,key,ytd]of [
   ['revenueQuarter','revenue',false],['revenueYtd','revenue',true],
   ['operatingProfitQuarter','operatingProfit',false],['operatingProfitYtd','operatingProfit',true],
   ['netIncomeQuarter','netIncome',false],['netIncomeYtd','netIncome',true],
   ['totalAssets','totalAssets',false],['totalLiabilities','totalLiabilities',false],['totalEquity','totalEquity',false],
   ['operatingCashFlowYtd','operatingCashFlow',true],
  ] as const){const value=amount(key,ytd);if(result[field]===null&&value!==null)result[field]=new Prisma.Decimal(value);}
  return result;
 });
}
