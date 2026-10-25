import type {StoredValuation} from '../domain/value-analysis.js';

const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
// Lists need source labels and reference-only warnings, not the nested calculation evidence.
// Exact evidence remains on periodValuation and is loaded by the detail route.
export function cacheMetricProvenance(value:unknown):Record<string,unknown>{
 const source=object(value),summary:Record<string,unknown>={};
 for(const key of ['source','fiscalYear','receiptNo','periodEnd','fsDivision','bpsReferenceOnly']){
  const v=source[key];if(v===null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')summary[key]=v;
 }
 const perMetric=object(source.perMetric),metrics:Record<string,unknown>={};
 for(const key of ['eps','bps','roe','per','pbr'])if(perMetric[key]!=null){
  // Only one level: imported or historical evidence can itself contain perMetric.
  const entry=object(perMetric[key]),flat:Record<string,unknown>={};
  for(const field of ['source','fiscalYear','receiptNo','periodEnd','fsDivision','bpsReferenceOnly']){
   const v=entry[field];if(v===null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')flat[field]=v;
  }
  metrics[key]=flat;
 }
 if(Object.keys(metrics).length)summary.perMetric=metrics;
 return summary;
}

export function compactValueCacheRow<T extends {valuation?:StoredValuation|null;metricBasis?:{provenance?:unknown}}>(row:T):T{
 return {...row,...(row.valuation?{valuation:{...row.valuation,provenance:cacheMetricProvenance(row.valuation.provenance)}}:{}),
  ...(row.metricBasis?{metricBasis:{...row.metricBasis,provenance:{}}}:{})};
}

/** Hydrate evidence only when the detailed record still proves the cached values and identity. */
export function detailedCachedValuation(cached:StoredValuation|null,current:StoredValuation|null):StoredValuation|null{
 if(!cached||!current)return cached;
 for(const key of ['metricDate','currency','kind','fiscalYear','periodType','rimCompatible','eps','bps','roe','per','pbr'] as const){
  if((cached[key]??null)!==(current[key]??null))return cached;
 }
 if(JSON.stringify(cacheMetricProvenance(cached.provenance))!==JSON.stringify(cacheMetricProvenance(current.provenance)))return cached;
 return {...cached,provenance:current.provenance};
}
