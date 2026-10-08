import { Prisma, type FinancialStatement, type DartFinancialFiling, type ValuationMetric, type PeriodValuation } from '../generated/prisma/index.js';
import { periodCollectionState } from './collection-status.js';
const seoulCurrentYear=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));

export const requiredReturn = new Prisma.Decimal('0.08');
const decimal = (value: string | null | undefined) => value == null ? null : new Prisma.Decimal(value);
const text = (value: { toString(): string } | null | undefined) => value?.toString() ?? null;
export type StoredValuation = { rimCompatible?:boolean; kind?:string; fiscalYear?:number; periodType?:string; collectionState?:string; provenance?:unknown; metricDate: string; eps: string | null; bps: string | null; per: string | null; pbr: string | null; roe: string | null };
export function valuation(row: ValuationMetric | null | undefined): StoredValuation | null {
  return row ? { metricDate: row.metricDate.toISOString().slice(0, 10), eps: text(row.eps), bps: text(row.bps), per: text(row.per), pbr: text(row.pbr), roe: text(row.roe) } : null;
}
// Same RIM formula as LiveStockInsightPage; Decimal keeps ordering/display input precision.
export function fairPrice(metric: StoredValuation | null, weight: string): string | null {
  if(metric?.rimCompatible===false)return null;
  const bps = decimal(metric?.bps), roe = decimal(metric?.roe);
  return bps && roe ? bps.mul(new Prisma.Decimal(1).plus(roe.div(100).minus(requiredReturn).mul(weight).div(requiredReturn))).toString() : null;
}
export function weight(metric: StoredValuation | null, price: string | null): string | null {
  const current = decimal(price), fair = decimal(fairPrice(metric, '0.8'));
  return current?.gt(0) && fair ? fair.div(current).toString() : null;
}
export function orderByWeight<T extends { w: string | null; symbol: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.w === null && b.w !== null ? 1 : b.w === null && a.w !== null ? -1 :
    a.w !== null && b.w !== null && !new Prisma.Decimal(a.w).eq(b.w) ? new Prisma.Decimal(b.w).cmp(a.w) :
    a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));
}
export type Statement = {
  fiscalYear: number; periodType: string; periodEndDate: string; revenue: string | null; operatingProfit: string | null; netIncome: string | null;
  totalAssets: string | null; totalLiabilities: string | null; totalEquity: string | null; basis: string; collectedAt: string | null; isDerived: boolean;
};
// Reuse existing analysis precedence: manual non-null values, latest non-withdrawn DART, same-basis Q4 = annual YTD - Q3 YTD.
export function mergeStatements(manual: FinancialStatement[], filings: DartFinancialFiling[]): Statement[] {
  const manualMap = new Map(manual.map(row => [row.fiscalYear + ':' + row.periodType, row]));
  const filingMap = new Map<string, DartFinancialFiling>();
  for (const row of filings) { const key = row.fiscalYear + ':' + row.periodType; if (!filingMap.has(key)) filingMap.set(key, row); }
  const keys = new Set([...manualMap.keys(), ...filingMap.keys()]);
  for (const row of filings.filter(row => row.periodType === 'ANNUAL')) {
    if (filingMap.get(row.fiscalYear + ':Q3')?.fsDivision === row.fsDivision) keys.add(row.fiscalYear + ':Q4');
  }
  return [...keys].map(key => {
    const [year = '', periodType = 'ANNUAL'] = key.split(':'), fiscalYear = Number(year), m = manualMap.get(key), f = filingMap.get(key);
    const annual = filingMap.get(year + ':ANNUAL'), q3 = filingMap.get(year + ':Q3');
    const derived = periodType === 'Q4' && !f && !!annual && !!q3 && annual.fsDivision === q3.fsDivision;
    const flow = (name: 'revenue' | 'operatingProfit' | 'netIncome') => {
      if (m?.[name] != null) return text(m[name]);
      if (derived) {
        const a = annual![name === 'revenue' ? 'revenueYtd' : name === 'operatingProfit' ? 'operatingProfitYtd' : 'netIncomeYtd'];
        const b = q3![name === 'revenue' ? 'revenueYtd' : name === 'operatingProfit' ? 'operatingProfitYtd' : 'netIncomeYtd'];
        return a == null || b == null ? null : a.minus(b).toString();
      }
      const key = name === 'revenue' ? periodType === 'ANNUAL' ? 'revenueYtd' : 'revenueQuarter' :
        name === 'operatingProfit' ? periodType === 'ANNUAL' ? 'operatingProfitYtd' : 'operatingProfitQuarter' :
        periodType === 'ANNUAL' ? 'netIncomeYtd' : 'netIncomeQuarter';
      return text(f?.[key]);
    };
    const balance = (name: 'totalAssets' | 'totalLiabilities' | 'totalEquity') => text(m?.[name] ?? (derived ? annual?.[name] : f?.[name]));
    return { fiscalYear, periodType, periodEndDate: (m?.periodEndDate ?? f?.periodEndDate ?? (derived ? annual?.periodEndDate : undefined))?.toISOString().slice(0, 10) ?? fiscalYear + '-12-31',
      revenue: flow('revenue'), operatingProfit: flow('operatingProfit'), netIncome: flow('netIncome'),
      totalAssets: balance('totalAssets'), totalLiabilities: balance('totalLiabilities'), totalEquity: balance('totalEquity'),
      basis: (m ? 'MANUAL:' : '') + (f?.fsDivision ?? (derived ? annual?.fsDivision : undefined) ?? 'MANUAL'),
      collectedAt: (f?.collectedAt ?? (derived ? annual?.collectedAt : undefined) ?? m?.updatedAt)?.toISOString() ?? null, isDerived: derived };
  });
}
export type Period = { year: number; quarter: number | null; key: string; label: string };
export function periods(year: number, quarter: number | null, count: number): Period[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = quarter === null ? year + index : year * 4 + quarter - 1 + index;
    const y = quarter === null ? offset : Math.floor(offset / 4), q = quarter === null ? null : offset % 4 + 1;
    return { year: y, quarter: q, key: y + ':' + (q === null ? 'ANNUAL' : 'Q' + q), label: String(y) + (q === null ? '' : ' ' + q + 'Q') };
  });
}
export function growth(current: Statement | undefined, previous: Statement | undefined, field: 'revenue' | 'netIncome'): string | null {
  if (!current || !previous || current.basis !== previous.basis) return null;
  const a = decimal(current[field]), b = decimal(previous[field]);
  return a && b?.gt(0) ? a.minus(b).div(b).mul(100).toString() : null;
}
export function financialRows(selected: Period[], statements: Statement[], metrics: ValuationMetric[], calculated: PeriodValuation[] = []) {
  const map = new Map(statements.map(row => [row.fiscalYear + ':' + row.periodType, row]));
  return selected.map(period => {
    const row = map.get(period.key), before = map.get(period.year - 1 + ':' + (period.quarter === null ? 'ANNUAL' : 'Q' + period.quarter));
    const from = period.year + '-' + String(period.quarter === null ? 1 : (period.quarter - 1) * 3 + 1).padStart(2, '0') + '-01';
    const end = period.quarter === null || period.quarter === 4 ? period.year + 1 + '-01-01' : period.year + '-' + String(period.quarter * 3 + 1).padStart(2, '0') + '-01';
    const metric = metrics.find(item => item.metricDate.toISOString().slice(0, 10) >= from && item.metricDate.toISOString().slice(0, 10) < end);
    const estimate=period.quarter===null&&period.year===seoulCurrentYear();
    const computed=calculated.find(v=>v.fiscalYear===period.year&&v.periodType===(estimate?'ESTIMATE':period.quarter===null?'ANNUAL':'Q'+period.quarter))??(period.quarter===4?calculated.find(v=>v.fiscalYear===period.year&&v.periodType==='ANNUAL'):undefined);
    const values=computed?.values as Record<string,string|null>|undefined;
    const estimateFinancials=(computed?.supplemental as {estimateFinancials?:Record<string,string|null>}|null)?.estimateFinancials;
    const actualRow=estimate?undefined:row,periodMetric=estimate?undefined:metric;
    const financialComplete=!!actualRow&&[actualRow.revenue,actualRow.operatingProfit,actualRow.netIncome,actualRow.totalAssets,actualRow.totalLiabilities,actualRow.totalEquity].every(v=>v!=null);
    const equity = decimal(row?.totalEquity), liabilities = decimal(row?.totalLiabilities);
    return { ...period,isEstimated:estimate, label:estimate?`${period.year}E`:period.label,collectionState:periodCollectionState(computed,financialComplete),latestAttempt:(computed?.supplemental as {manualAttempt?:unknown}|null)?.manualAttempt??null,
      revenue:estimate?estimateFinancials?.revenue??null:row?.revenue??null, operatingProfit:estimate?estimateFinancials?.operatingProfit??null:row?.operatingProfit??null, netIncome:estimate?estimateFinancials?.netIncome??null:row?.netIncome??null,
      per: values?.per??text(periodMetric?.per)??null, pbr: values?.pbr??text(periodMetric?.pbr)??null, roe: values?.roe??text(periodMetric?.roe)??null, metricDate: periodMetric?.metricDate.toISOString().slice(0, 10) ?? (computed?.provenance as {periodEnd?:string}|undefined)?.periodEnd??null,
      metricStatus:computed?.status??'NOT_COLLECTED',metricReasons:computed?.reasons??{},metricProvenance:computed?.provenance??null,
      debtRatio: !estimate&&equity?.gt(0) && liabilities ? liabilities.div(equity).mul(100).toString() : null,
      currentRatio: null, revenueGrowth: estimate?null:growth(row, before, 'revenue'), profitGrowth: estimate?null:growth(row, before, 'netIncome'),
      source: estimate?estimateFinancials?'CONSENSUS:NAVER_FNGUIDE_ANNUAL':null:row?.basis??null, collectedAt: estimate?computed?.updatedAt?.toISOString()??null:row?.collectedAt ?? null, isDerived: row?.isDerived ?? false };
  });
}

export function combinedValuation(legacy:StoredValuation|null, rows:PeriodValuation[]):StoredValuation|null {
 const ranked=rows.filter(r=>r.periodType!=='ESTIMATE'||r.fiscalYear===seoulCurrentYear());
 const rank=(r:PeriodValuation)=>r.periodType==='ESTIMATE'?0:r.periodType==='ANNUAL'?1:2;
 const computed=[...ranked].sort((a,b)=>b.fiscalYear-a.fiscalYear||rank(a)-rank(b)||b.periodType.localeCompare(a.periodType))[0];
 if(!computed)return legacy;
 const values=computed.values as Record<string,string|null>,provenance=computed.provenance as {periodEnd?:string;roeBasis?:string;fsDivision?:string};
 const estimated=computed.periodType==='ESTIMATE';
 const legacyValue=estimated?null:legacy;
 return {kind:estimated?'ANNUAL_ESTIMATE':computed.periodType==='ANNUAL'?'FINAL_ANNUAL':'REPORTED_INTERIM',fiscalYear:computed.fiscalYear,periodType:computed.periodType,collectionState:periodCollectionState(computed,false),provenance:computed.provenance,rimCompatible:!!(legacyValue?.bps&&legacyValue?.roe)||provenance.fsDivision==='OFS'||provenance.roeBasis==='OWNERS_OF_PARENT',metricDate:provenance.periodEnd??legacyValue?.metricDate??computed.fiscalYear+'-12-31',eps:values.eps??legacyValue?.eps??null,bps:values.bps??legacyValue?.bps??null,per:values.per??legacyValue?.per??null,pbr:values.pbr??legacyValue?.pbr??null,roe:values.roe??legacyValue?.roe??null};
}
