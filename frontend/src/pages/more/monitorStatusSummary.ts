/** Counts collection features, rather than the records processed by each collector. */
export function summarizeMonitorStatuses(features:readonly {status:string}[]) {
  const counts={completed:0,failed:0,warning:0,waiting:0,running:0};
  for(const {status} of features) {
    if(['OK','SUCCESS','NO_FILING','NOT_APPLICABLE','SKIPPED'].includes(status))counts.completed++;
    else if(status==='FAILED')counts.failed++;
    else if(status==='RUNNING')counts.running++;
    else if(['WAITING','NO_DATA'].includes(status))counts.waiting++;
    else counts.warning++;
  }
  return counts;
}
