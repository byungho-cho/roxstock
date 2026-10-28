import {objectValue} from './security-data.js';
import type {PeriodValuation} from '../generated/prisma/index.js';
type Period=Pick<PeriodValuation,'securityId'|'fiscalYear'|'periodType'|'supplemental'>;
type View={fiscalYear:number;periodType:string;periodEndDate?:string;currency?:string;basis:string;collectedAt:string|null;isDerived:boolean};
/** Manual view overlays are separate from immutable disclosure rows, including before a first filing. */
export function manualFinancialView<T extends View>(rows:T[],periods:Period[]):T[]{
 const result=[...rows];
 for(const period of periods){
  const sup=objectValue(period.supplemental),fields=objectValue(sup.manualFields),basis=objectValue(sup.manualBasis);
  if(!Object.keys(fields).length)continue;
  let index=result.findIndex(r=>r.fiscalYear===period.fiscalYear&&r.periodType===period.periodType);
  const original=index>=0?result[index]:undefined;
  const periodLocal=basis.kind==='MANUAL_PERIOD'&&basis.periodKey===`${period.fiscalYear}:${period.periodType}`;
  if(!original&&(!periodLocal&&!basis.periodEnd||!['CFS','OFS'].includes(basis.fsDivision)||!basis.currency))continue;
  const row:Record<string,any>=original?{...original}:{fiscalYear:period.fiscalYear,periodType:period.periodType,periodEndDate:basis.periodEnd??undefined,currency:basis.currency,amountMultiplier:'1',basis:'MANUAL:'+basis.fsDivision,collectedAt:null,isDerived:false,revenue:null,operatingProfit:null,netIncome:null,totalAssets:null,totalLiabilities:null,totalEquity:null,parentNetIncome:null,parentEquity:null,operatingCashFlow:null,investingCashFlow:null,financingCashFlow:null,cashEquivalents:null,capitalExpenditure:null};
  const flow=period.periodType==='ANNUAL'?'Ytd':'Quarter';
  const aliases:Record<string,string>={['revenue'+flow]:'revenue',['operatingProfit'+flow]:'operatingProfit',['netIncome'+flow]:'netIncome',['operatingCashFlow'+flow]:'operatingCashFlow',['capitalExpenditure'+flow]:'capitalExpenditure',totalAssets:'totalAssets',totalLiabilities:'totalLiabilities',totalEquity:'totalEquity',parentNetIncome:'parentNetIncome'};
  for(const [key,value]of Object.entries(fields)){
   const entry=objectValue(value),target=aliases[key];if(!target||(!(periodLocal&&!original&&entry.periodKey===basis.periodKey)&&entry.periodEnd!==row.periodEndDate)||entry.currency!==(row.currency??'KRW'))continue;
   if(original&&!row.basis.includes(entry.fsDivision)&&row.basis!=='MANUAL')continue;
   row[target]=entry.value;row.basis='MANUAL:'+entry.fsDivision;row.collectedAt=entry.at;
  }
  if(index<0)result.push(row as T);else result[index]=row as T;
 }
 return result;
}
