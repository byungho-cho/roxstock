import type { ManualRefreshMetadata } from './dart-manual-refresh.js';
/** Counts are report-level, not metric-level; one report can have multiple missing metrics. */
export function refreshSummary(results: NonNullable<ManualRefreshMetadata['results']>) {
  const confirmed = results.filter(r => r.tasks?r.tasks.dart.state==='SUCCESS':r.status === 'SUCCESS');
  return {
    processed: results.length, disclosureCompleted: confirmed.filter(r=>r.kind!=='ANNUAL_ESTIMATE').length,
    financialCompleted:confirmed.filter(r=>r.financialComplete===true).length,
    estimateCompleted:confirmed.filter(r=>r.kind==='ANNUAL_ESTIMATE'&&r.valuationStatus==='SUCCESS').length,
    valuationCompleted: results.filter(r => r.valuationStatus === 'SUCCESS').length,
    noDisclosure: results.filter(r => r.kind!=='ANNUAL_ESTIMATE'&&(r.tasks?r.tasks.dart.state==='NO_DATA':r.status === 'NO_DATA')).length,
    disclosureFailed: results.filter(r => r.kind!=='ANNUAL_ESTIMATE'&&(r.tasks?r.tasks.dart.state==='FAILED':r.status === 'FAILED')).length,
    supplementFailed: results.filter(r => r.tasks?r.tasks.valuation.state!=='SUCCESS':r.status==='SUCCESS'&&r.valuationStatus !== 'SUCCESS').length,
  };
}
