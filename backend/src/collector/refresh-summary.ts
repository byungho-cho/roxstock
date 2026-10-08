import type { ManualRefreshMetadata } from './dart-manual-refresh.js';
/** Counts are report-level, not metric-level; one report can have multiple missing metrics. */
export function refreshSummary(results: NonNullable<ManualRefreshMetadata['results']>) {
  const confirmed = results.filter(r => r.status === 'SUCCESS');
  return {
    processed: results.length, disclosureCompleted: confirmed.length,
    valuationCompleted: confirmed.filter(r => r.valuationStatus === 'SUCCESS').length,
    noDisclosure: results.filter(r => r.status === 'NO_DATA').length,
    disclosureFailed: results.filter(r => r.status === 'FAILED').length,
    supplementFailed: confirmed.filter(r => r.valuationStatus !== 'SUCCESS').length,
  };
}
