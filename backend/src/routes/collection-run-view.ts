import {skipKind, priceRunResult} from '@roxstock/shared/domain/collection-health';
import {prisma} from '../auth/scoped-db.js';
import {investorMonitorCounts} from '../domain/investor-monitor.js';

export async function runViews(ids: bigint[]) {
  const groups = ids.length ? await prisma.collectorRunItem.groupBy({where:{runId:{in:ids},NOT:{symbol:{startsWith:'MASTER:'}}},by:['runId','status','message'],_count:{_all:true}}) : [];
  return new Map(ids.map(id => {
    const rows=groups.filter(row=>row.runId===id);
    const count=(status:string)=>rows.filter(row=>row.status===status).reduce((n,row)=>n+row._count._all,0);
    const excluded=rows.filter(row=>row.status==='SKIPPED'&&skipKind(row.message)==='EXCLUDED').reduce((n,row)=>n+row._count._all,0);
    const reasons=Object.fromEntries(['EXCLUDED','LOCK_CONFLICT','INACTIVE','IDENTITY_CHANGED','UNKNOWN'].map(kind=>[kind,rows.filter(row=>row.status==='SKIPPED'&&skipKind(row.message)===kind).reduce((n,row)=>n+row._count._all,0)]));
    return [String(id),{target:rows.reduce((n,row)=>n+row._count._all,0),success:count('SUCCESS'),failed:count('FAILED'),stale:count('STALE'),skipped:count('SKIPPED')+count('NO_DATA')+count('NOT_APPLICABLE'),excluded,skipReasons:reasons,investor:investorMonitorCounts(rows)}];
  }));
}

export function effectiveResult(run:{jobType:string;status:string;failureReason:string|null;successCount:number;failureCount:number;skippedCount:number;staleCount:number},view:Awaited<ReturnType<typeof runViews>> extends Map<string,infer V>?V:never) {
  if(run.jobType!=='market-prices'||run.status==='RUNNING'||run.status==='FAILED'||run.failureReason||!view?.target) return run.status;
  if(view.target!==run.successCount+run.failureCount+run.skippedCount+run.staleCount) return run.status;
  return priceRunResult(view,view.excluded);
}
