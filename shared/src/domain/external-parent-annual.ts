import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {financialCurrency} from './financial-currency.js';
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{};
const dec=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new Prisma.Decimal(v):null;
export const externalParentPolicy='NAVER_ANNUAL_DART_FOUR_TOTALS_V1';
/** NAVER financials have 0.01 억원 resolution. Match four independent DART totals at that resolution.
 * This is a labelled external supplement, never a claim that DART provided the missing account. */
export function externalParentAccount(f:DartFinancialFiling,key:string,raw:unknown){
 const entry=obj(raw),proof=obj(entry.externalAnnual),a=obj(proof.annual),values=obj(a.financials);
 if(!['parentNetIncome','parentEquity'].includes(key)||entry.source!=='NAVER_FNGUIDE_ANNUAL'||proof.policy!==externalParentPolicy||proof.securityId!==String(f.securityId)||!/^\d[A-Z0-9]{5}$/.test(proof.symbol??'')||f.collectionSymbol&&f.collectionSymbol!==proof.symbol)return null;
 const end=f.periodEndDate.toISOString().slice(0,10);
 if(f.isWithdrawn||f.periodType!=='ANNUAL'||f.fsDivision!=='CFS'||financialCurrency(f)!=='KRW'||obj(f.sourceValidation).periodResolution||end!==`${f.fiscalYear}-12-31`||entry.periodEnd!==end||entry.currency!=='KRW'||String(entry.amountMultiplier)!=='1'||proof.receiptNo!==f.receiptNo)return null;
 if(a.source!=='NAVER_FNGUIDE_ANNUAL'||a.kind!=='FINAL_ANNUAL'||a.division!=='CFS'||a.fiscalYear!==f.fiscalYear||a.fiscalMonth!==12||!Number.isFinite(Date.parse(a.collectedAt)))return null;
 try{const u=new URL(a.sourceUrl);if(u.origin!=='https://navercomp.wisereport.co.kr'||u.pathname!=='/v3/company/c1010001.aspx'||u.searchParams.get('cmp_cd')!==proof.symbol)return null;}catch{return null;}
 for(const [field,label]of [['netIncomeYtd','netIncome'],['totalAssets','totalAssets'],['totalLiabilities','totalLiabilities'],['totalEquity','totalEquity']] as const){
  const actual=f[field],candidate=dec(values[label]);if(actual==null||!candidate||candidate.minus(actual.toString()).abs().gt('500000'))return null;
 }
 const value=dec(entry.amount),candidate=dec(values[key]);if(!value||!candidate||!value.eq(candidate)||entry.ytdAmount!=null&&!value.eq(String(entry.ytdAmount)))return null;
 const original=obj(obj(f.accountSources)[key]),originalValue=dec(original.ytdAmount??original.amount);
 if(originalValue&&originalValue.minus(value).abs().gt('500000'))return null;
 return entry;
}
