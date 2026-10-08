import { metricKeys, type MetricValues } from './period-valuation.js';
export type CollectionState='NOT_COLLECTED'|'FINANCIAL_ONLY'|'COMPLETE'|'ESTIMATE_READY'|'PARTIAL_ESTIMATE'|'FINAL_FAILED';
export function valueCompletion(values:Partial<MetricValues>) {
 const notApplicable:Record<string,string>={};
 if(values.eps!=null&&Number(values.eps)<=0&&values.per==null)notApplicable.per='EPS_NON_POSITIVE';
 if(values.bps!=null&&Number(values.bps)<=0&&values.pbr==null)notApplicable.pbr='BPS_NON_POSITIVE';
 return {complete:metricKeys.every(k=>values[k]!=null||k in notApplicable),notApplicable};
}
export function periodCollectionState(computed:{status:string;supplemental?:unknown;values:unknown}|undefined,financialComplete:boolean):CollectionState {
 const saved=computed?.supplemental as {manualAttempt?:{state?:CollectionState}}|null;
 if(saved?.manualAttempt?.state)return saved.manualAttempt.state;
 if(computed?.status==='FAILED')return 'FINAL_FAILED';
 if(financialComplete&&computed?.status==='SUCCESS')return 'COMPLETE';
 if(financialComplete)return 'FINANCIAL_ONLY';
 return 'NOT_COLLECTED';
}
