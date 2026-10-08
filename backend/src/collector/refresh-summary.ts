import type { ManualRefreshMetadata } from './dart-manual-refresh.js';
/** Counts are report-level, not metric-level; one report can have multiple missing metrics. */
export function refreshSummary(results: NonNullable<ManualRefreshMetadata['results']>) {
  const confirmed = results.filter(r => r.status === 'SUCCESS');
  return {
    processed: results.length, disclosureCompleted: confirmed.filter(r=>r.kind!=='ANNUAL_ESTIMATE').length,
    financialCompleted:confirmed.filter(r=>r.financialComplete===true).length,
    estimateCompleted:confirmed.filter(r=>r.kind==='ANNUAL_ESTIMATE'&&r.valuationStatus==='SUCCESS').length,
    valuationCompleted: confirmed.filter(r => r.valuationStatus === 'SUCCESS').length,
    noDisclosure: results.filter(r => r.kind!=='ANNUAL_ESTIMATE'&&r.status === 'NO_DATA').length,
    disclosureFailed: results.filter(r => r.kind!=='ANNUAL_ESTIMATE'&&r.status === 'FAILED').length,
    supplementFailed: confirmed.filter(r => r.valuationStatus !== 'SUCCESS').length,
  };
}
