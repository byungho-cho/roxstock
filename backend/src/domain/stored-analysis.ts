import {Prisma,type FinancialStatement,type DartFinancialFiling,type PeriodValuation,type ValuationMetric} from '../generated/prisma/index.js';
import {combinedValuation,valuation,mergeStatements,fairPrice,weight} from './value-analysis.js';
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const periodNames:Record<string,string>={ANNUAL:'연간',ESTIMATE:'연간 추정',Q1:'1분기',Q2:'반기',Q3:'3분기',Q4:'4분기'};
export const storedAnalysisInclude=(year:number)=>({
 periodValuations:{where:{fiscalYear:year},orderBy:{periodType:'asc' as const}},
 financialStatements:{where:{fiscalYear:{lte:year},periodType:'ANNUAL' as const},orderBy:{fiscalYear:'desc' as const},take:1},
 dartFinancialFilings:{where:{fiscalYear:{lte:year},isWithdrawn:false,OR:[{fiscalYear:year},{periodType:'ANNUAL' as const}]},omit:{accountSources:true},orderBy:[{fiscalYear:'desc' as const},{receiptDate:'desc' as const},{collectedAt:'desc' as const},{receiptNo:'desc' as const}]},
 valuationMetrics:{where:{metricDate:{gte:new Date(Date.UTC(year,0,1)),lt:new Date(Date.UTC(year+1,0,1))}},orderBy:{metricDate:'desc' as const},take:1},
});
type Input={year:number;price:string|null;metrics:ValuationMetric[];periods:PeriodValuation[];manual:FinancialStatement[];filings:Omit<DartFinancialFiling,'accountSources'>[]};
/** A read-only projection shared by both lists. No collection or inferred financial totals. */
export function selectStoredAnalysis({year,price,metrics,periods,manual,filings}:Input){
 const metric=combinedValuation(valuation(metrics[0]),periods.filter(r=>r.fiscalYear===year));
 const provenance=object(metric?.provenance),isEstimated=metric?.kind==='ANNUAL_ESTIMATE';
 const annual=mergeStatements(manual,filings.filter(f=>f.periodType==='ANNUAL')).filter(r=>r.fiscalYear<=year).sort((a,b)=>b.fiscalYear-a.fiscalYear)[0];
 const selectedAnnual=mergeStatements(manual,filings.filter(f=>f.periodType==='ANNUAL')).find(r=>r.fiscalYear===year);
 const estimate=isEstimated?periods.find(r=>r.fiscalYear===year&&r.periodType==='ESTIMATE'):undefined;
 const supplemental=object(estimate?.supplemental),source=object(supplemental.manualSource),estimatedFinancials=object(supplemental.estimateFinancials);
 const confirmedEstimate=source.fiscalYear===year&&source.kind==='ANNUAL_ESTIMATE'&&['CFS','OFS'].includes(source.division)&&source.source==='NAVER_FNGUIDE_ANNUAL';
 const rawIncome=isEstimated&&confirmedEstimate?estimatedFinancials.netIncome:null;
 const sourceIncome=object(source.financials).netIncome;
 const incomeMatches=typeof rawIncome==='string'&&typeof sourceIncome==='string'&&/^-?\d+(\.\d+)?$/.test(rawIncome)&&/^-?\d+(\.\d+)?$/.test(sourceIncome)&&new Prisma.Decimal(rawIncome).eq(sourceIncome);
 const estimateIncome=typeof rawIncome==='string'&&/^-?\d+(\.\d+)?$/.test(rawIncome)&&incomeMatches?new Prisma.Decimal(rawIncome).toString():null;
 const netIncome=isEstimated?estimateIncome:selectedAnnual?.netIncome??null;
 const eps=metric?.eps??null,epsYield=eps!==null&&price!==null&&new Prisma.Decimal(price).gt(0)?new Prisma.Decimal(eps).div(price).mul(100).toString():null;
 const targetPrice=fairPrice(metric,'0.8'),w=weight(metric,price);
 const missingReasons={eps:eps===null?metric?'NOT_PROVIDED':'NOT_COLLECTED':null,roe:metric?.roe==null?metric?'NOT_PROVIDED':'NOT_COLLECTED':null,targetPrice:targetPrice===null?metric?.rimCompatible===false?'RIM_BASIS_UNCONFIRMED':metric?'NOT_PROVIDED':'NOT_COLLECTED':null,epsYield:epsYield===null?eps===null?'EPS_MISSING':'CURRENT_PRICE_MISSING':null,capital:annual?.totalEquity==null?annual?'NOT_PROVIDED':'NOT_COLLECTED':null,w:w===null?targetPrice===null?'VALUATION_MISSING':'CURRENT_PRICE_MISSING':null,value:w===null?targetPrice===null?'VALUATION_MISSING':'CURRENT_PRICE_MISSING':null,netIncome:netIncome===null?isEstimated&&confirmedEstimate&&rawIncome!=null&&!incomeMatches?'ESTIMATE_SOURCE_MISMATCH':isEstimated&&!confirmedEstimate?'ESTIMATE_BASIS_UNCONFIRMED':isEstimated?'NOT_PROVIDED':selectedAnnual?'NOT_PROVIDED':'NOT_COLLECTED':null};
 return {metric,eps,roe:metric?.roe??null,epsYield,targetPrice,w,value:w,capital:annual?.totalEquity??null,capitalYear:annual?.fiscalYear??null,netIncome,
  metricBasis:{year:metric?.fiscalYear??year,period:metric?.periodType??'LEGACY',label:isEstimated?`${year}E`:metric?`${year} ${periodNames[metric.periodType??'']??'저장 지표'}`:String(year),isEstimated,source:provenance.source??(Object.values(object(provenance.perMetric)).map(v=>object(v).source).filter(Boolean).join('/')|| (metric?'LEGACY_STORED':null)),division:provenance.fsDivision??null,flow:provenance.flow??(isEstimated?'FULL_YEAR_ESTIMATE':null),provenance,metricDate:metric?.metricDate??null},
  capitalBasis:annual?{year:annual.fiscalYear,source:annual.basis==='CFS'||annual.basis==='OFS'?'DART:'+annual.basis:annual.basis,period:'ANNUAL',isEstimated:false,unit:'KRW',collectedAt:annual.collectedAt}:null,
  netIncomeBasis:isEstimated?confirmedEstimate?{year,source:source.source,division:source.division,period:'ANNUAL',flow:'FULL_YEAR_ESTIMATE',isEstimated:true,unit:'KRW',sourceUrl:source.sourceUrl??null,collectedAt:source.collectedAt??null}:null:selectedAnnual?{year,source:selectedAnnual.basis==='CFS'||selectedAnnual.basis==='OFS'?'DART:'+selectedAnnual.basis:selectedAnnual.basis,period:'ANNUAL',flow:'FULL_YEAR',isEstimated:false,unit:'KRW',collectedAt:selectedAnnual.collectedAt}:null,missingReasons};
}
