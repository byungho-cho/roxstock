import {selectValueListAnalysis} from './value-list-analysis.js';
import {validFieldNumber,valueRequired} from './security-data-aggregation.js';
export const annualReadinessVersion='SECURITY_W_ANNUAL_V1';
export type AnnualKind='final'|'estimate';
type Input=Parameters<typeof selectValueListAnalysis>[0];
/** Exact annual bucket. In particular, an estimate never falls back to last year's final. */
export function annualWAssessment(input:Input,year:number,kind:AnnualKind){
 const periods=input.periods.filter(r=>r.fiscalYear===year&&r.periodType===(kind==='estimate'?'ESTIMATE':'ANNUAL'));
 const analysis=selectValueListAnalysis({year:kind==='estimate'?year:year+1,price:input.price,periods,manual:kind==='estimate'?[]:input.manual.filter(r=>r.fiscalYear===year&&r.periodType==='ANNUAL'),filings:kind==='estimate'?[]:input.filings.filter(r=>r.fiscalYear===year&&r.periodType==='ANNUAL'),metrics:kind==='estimate'?[]:input.metrics.filter(r=>r.metricDate.toISOString().slice(0,10)===`${year}-12-31`)});
 const correctBucket=analysis.metricBasis.year===year&&analysis.dataPriority===(kind==='estimate'?1:2),metric=correctBucket?analysis.metric:null;
 const missingW:string[]=[];
 if(!metric)missingW.push(kind==='estimate'?'estimateSource':'annualSource');
 if(!validFieldNumber('bps',metric?.bps))missingW.push('bps');
 if(!validFieldNumber('roe',metric?.roe))missingW.push('roe');
 if(input.price===null||!validFieldNumber('price',input.price)||Number(input.price)<=0)missingW.push('price');
 if(metric?.rimCompatible===false)missingW.push(metric.currency&&metric.currency!=='KRW'?'currency':'rimBasis');
 const w=correctBucket?analysis.w:null,wReady=w!==null&&missingW.length===0;
 if(w===null&&!missingW.length)missingW.push('rimBasis');
 const notApplicable:string[]=[],missingIndicators:string[]=[];
 for(const k of valueRequired){const base=k==='per'?metric?.eps:k==='pbr'?metric?.bps:null;if((k==='per'||k==='pbr')&&base!==null&&base!==undefined&&validFieldNumber(k==='per'?'eps':'bps',base)&&Number(base)<=0){notApplicable.push(k);continue;}if(!validFieldNumber(k,metric?.[k]))missingIndicators.push(k);}
 return {w:wReady?w:null,wReady,indicatorReady:missingIndicators.length===0,missingW,missingIndicators,notApplicable,metrics:metric?Object.fromEntries(valueRequired.map(k=>[k,notApplicable.includes(k)?null:metric[k]])):Object.fromEntries(valueRequired.map(k=>[k,null])),basis:{year:analysis.metricBasis.year,period:analysis.metricBasis.period,label:analysis.metricBasis.label,isEstimated:analysis.metricBasis.isEstimated,source:analysis.metricBasis.source,division:analysis.metricBasis.division,currency:analysis.metricBasis.currency},reason:wReady?null:analysis.missingReasons.targetPrice??analysis.missingReasons.w??'ANNUAL_INPUT_MISSING'};
}
export type AnnualReadiness=ReturnType<typeof annualWAssessment>;
export function summarizeAnnual(rows:ReadonlyArray<{excludedReason:string|null;assessment:AnnualReadiness}>){
 const included=rows.filter(r=>!r.excludedReason),wReady=included.filter(r=>r.assessment.wReady).length,indicatorMissing=included.filter(r=>r.assessment.wReady&&!r.assessment.indicatorReady).length;
 return {target:included.length,excluded:rows.length-included.length,wReady,wMissing:included.length-wReady,indicatorMissing,fullyReady:wReady-indicatorMissing,wRate:included.length?wReady/included.length*100:null,indicatorOverlayRate:included.length?indicatorMissing/included.length*100:null};
}
