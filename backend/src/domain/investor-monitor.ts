type ItemGroup={status:string;message:string|null;_count:{_all:number}};
/** These are target counts, never investor-row counts or complete collection successes. */
export function investorMonitorCounts(groups:ItemGroup[]){
 const counts={rawOnly:0,quantityStored:0,waiting:0,failed:0,other:0};
 for(const group of groups){
  const key=group.status==='FAILED'?'failed':group.status==='STALE'&&group.message?.startsWith('RAW_OBSERVATION_ONLY:')?'rawOnly':group.status==='STALE'&&group.message?.startsWith('PARTIAL_FIELDS:')?'quantityStored':group.status==='SKIPPED'&&group.message?.startsWith('NO_CURRENT_DATA:')?'waiting':'other';
  counts[key]+=group._count._all;
 }
 return counts;
}
