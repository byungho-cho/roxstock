import { Prisma, type FinancialStatement, type DartFinancialFiling } from '../generated/prisma/index.js';
import { mergeStatements, type Period } from './value-analysis.js';

export const financialFields = ['revenue','operatingProfit','netIncome','parentNetIncome','totalAssets','totalLiabilities','totalEquity','parentEquity','operatingCashFlow','investingCashFlow','financingCashFlow','cashEquivalents'] as const;
export type FinancialField = typeof financialFields[number];
type Values = Record<FinancialField, string | null>;
export type StoredFinancial = Values & { fiscalYear: number; periodType: string; basis: string; collectedAt: string | null; isDerived: boolean };
const text = (v: {toString():string} | null | undefined) => v?.toString() ?? null;
function source(row: DartFinancialFiling | undefined, key: string, ytd: boolean) {
  const sources = row?.accountSources;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) return null;
  const item = sources[key];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const amount = ytd ? item.ytdAmount ?? (row?.periodType === 'ANNUAL' || item.statementDivision === 'CF' ? item.amount : null) : item.amount;
  return typeof amount === 'string' && /^-?\d+(\.\d+)?$/.test(amount) ? amount : null;
}
export function storedFinancials(manual: FinancialStatement[], filings: DartFinancialFiling[]): StoredFinancial[] {
  const filingMap = new Map<string,DartFinancialFiling>();
  for (const f of filings) { const key=f.fiscalYear+':'+f.periodType; if(!filingMap.has(key))filingMap.set(key,f); }
  return mergeStatements(manual,filings).map(row => {
    const key=row.fiscalYear+':'+row.periodType,m=manual.find(m=>m.fiscalYear+':'+m.periodType===key),f=filingMap.get(key);
    const annual=filingMap.get(row.fiscalYear+':ANNUAL'),q3=filingMap.get(row.fiscalYear+':Q3');
    const snapshot = row.isDerived ? annual : f;
    const extraFlow = (field:string):string|null => {
      if(row.periodType==='ANNUAL')return source(f,field,true);
      if(row.periodType==='Q4') {
        if(!annual||!q3||annual.fsDivision!==q3.fsDivision)return null;
        const a=source(annual,field,true),b=source(q3,field,true);
        return a===null||b===null?null:new Prisma.Decimal(a).minus(b).toString();
      }
      // Income statement currentAmount is the individual quarter. CF currentAmount is cumulative.
      if(field==='parentNetIncome')return source(f,field,false);
      const cumulative=source(f,field,true);
      if(row.periodType==='Q1')return cumulative;
      const previous=filingMap.get(row.fiscalYear+':'+(row.periodType==='Q2'?'Q1':'Q2'));
      if(!f||!previous||f.fsDivision!==previous.fsDivision)return null;
      const before=source(previous,field,true);
      return cumulative===null||before===null?null:new Prisma.Decimal(cumulative).minus(before).toString();
    };
    const cashFlow = () => {
      if(m?.operatingCashFlow!=null)return text(m.operatingCashFlow);
      if(row.periodType==='ANNUAL')return text(f?.operatingCashFlowYtd);
      if(row.periodType==='Q4') {
        if(!annual||!q3||annual.fsDivision!==q3.fsDivision||annual.operatingCashFlowYtd==null||q3.operatingCashFlowYtd==null)return null;
        return annual.operatingCashFlowYtd.minus(q3.operatingCashFlowYtd).toString();
      }
      const cumulative=source(f,'operatingCashFlow',true)??text(f?.operatingCashFlowYtd);
      if(row.periodType==='Q1')return cumulative;
      const previous=filingMap.get(row.fiscalYear+':'+(row.periodType==='Q2'?'Q1':'Q2'));
      const before=source(previous,'operatingCashFlow',true)??text(previous?.operatingCashFlowYtd);
      return !f||!previous||f.fsDivision!==previous.fsDivision||cumulative===null||before===null?null:new Prisma.Decimal(cumulative).minus(before).toString();
    };
    return {...row,parentNetIncome:extraFlow('parentNetIncome'),parentEquity:source(snapshot,'parentEquity',false),operatingCashFlow:cashFlow(),investingCashFlow:extraFlow('investingCashFlow'),financingCashFlow:extraFlow('financingCashFlow'),cashEquivalents:source(snapshot,'cashEquivalents',false)};
  });
}
export function yearGrowth(current: StoredFinancial | undefined, previous: StoredFinancial | undefined, field: FinancialField): string | null {
  if(!current||!previous||current.basis!==previous.basis||current[field]===null||previous[field]===null)return null;
  const before=new Prisma.Decimal(previous[field]);
  return before.isZero()?null:new Prisma.Decimal(current[field]).minus(before).div(before.abs()).mul(100).toString();
}
export function statementPeriods(selected: Period[], rows: StoredFinancial[]) {
  const map=new Map(rows.map(row=>[row.fiscalYear+':'+row.periodType,row]));
  return selected.map(period=>{
    const row=map.get(period.key),previous=map.get(period.year-1+':'+(period.quarter===null?'ANNUAL':'Q'+period.quarter));
    return {...period,values:Object.fromEntries(financialFields.map(key=>[key,row?.[key]??null])) as Values,growth:Object.fromEntries(financialFields.map(key=>[key,yearGrowth(row,previous,key)])) as Values,basis:row?.basis??null,collectedAt:row?.collectedAt??null,isDerived:row?.isDerived??false};
  });
}
