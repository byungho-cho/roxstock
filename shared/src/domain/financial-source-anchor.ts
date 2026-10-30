import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {financialCurrency} from './financial-currency.js';
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{},D=Prisma.Decimal.clone({precision:60});
const number=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new D(v):null;
/** A documented, coarse KIS fallback is not an exact DART net-income anchor.
 * The original row remains untouched. Other financial anchors still match normally. */
export function storedFinancialAnchorMatches(f:DartFinancialFiling,field:'netIncomeYtd'|'totalAssets'|'totalLiabilities'|'totalEquity'|'revenueYtd'|'operatingProfitYtd',candidate:string,tolerance='0'){
 const actual=f[field],value=number(candidate);if(actual==null||!value)return false;
 const delta=value.minus(actual.toString()).abs();if(delta.lte(tolerance))return true;
 if(field!=='netIncomeYtd'||f.periodType!=='ANNUAL'||financialCurrency(f)!=='KRW'||delta.gt('50000000'))return false;
 const entry=obj(obj(f.accountSources).netIncome);if(entry.amount!=null||entry.ytdAmount!=null)return false;
 const p=obj(obj(obj(f.sourceValidation).annualCoreSupplement).fields).netIncomeYtd,proof=obj(p),raw=number(proof.raw);
 const anchors=['revenueYtd','operatingProfitYtd','totalAssets','totalLiabilities','totalEquity'];
 return proof.source==='KIS_API'&&proof.kind==='HISTORICAL_REFERENCE'&&proof.rounded===true&&proof.originalAmountUnit==='HUNDRED_MILLION_KRW'&&proof.storedAmountUnit==='KRW'&&proof.amountMultiplier==='100000000'&&proof.endpoint==='income-statement'&&proof.field==='thtr_ntin'&&proof.stacYymm===f.periodEndDate.toISOString().slice(0,7).replace('-','')&&proof.fsDivision==='MATCHED_BY_EXISTING_FINANCIAL_ANCHORS'&&Array.isArray(proof.anchors)&&new Set(proof.anchors).size===5&&anchors.every(k=>proof.anchors.includes(k))&&!!raw&&raw.mul('100000000').eq(actual.toString());
}
