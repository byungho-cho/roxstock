import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
export async function bugWindow(db:PrismaClient,date?:string){
 const window=await db.collectionBugReportingWindow.findUnique({where:{id:1}});
 if(!window)throw new ApiError(503,'REPORT_WINDOW_MISSING','리포팅 시작 기준을 확인할 수 없습니다.');
 let from=window.reportingFrom,to:Date|undefined;
 if(date){const day=new Date(date+'T00:00:00+09:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+day)||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(day)!==date)throw new ApiError(400,'INVALID_INPUT','조회일을 확인해 주세요.');from=new Date(Math.max(+from,+day));to=new Date(+day+86400000);}
 return {from,to,reportingFrom:window.reportingFrom,where:{observedAt:{gte:from,...(to?{lt:to}:{})}}};
}
export async function visibleBugReports(db:PrismaClient,date?:string){
 const window=await bugWindow(db,date);
 const groups=await db.collectionBugOccurrence.groupBy({by:['reportId'],where:{...window.where,reportId:{not:null}},_count:{_all:true},_min:{observedAt:true},_max:{observedAt:true}});
 const reports=await db.collectionBugReport.findMany({where:{id:{in:groups.flatMap(g=>g.reportId===null?[]:[g.reportId])}}});
 const stats=new Map(groups.map(g=>[String(g.reportId),g]));
 const rows=await Promise.all(reports.map(async r=>{
  const s=stats.get(String(r.id))!;
  const counts=await db.$queryRaw<Array<{active:bigint;total:bigint;pending:bigint}>>(Prisma.sql`SELECT SUM(resolved_at IS NULL) AS pending,COUNT(DISTINCT IF(resolved_at IS NULL,CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,'')),NULL)) AS active,COUNT(DISTINCT CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,''))) AS total FROM collection_bug_occurrences WHERE report_id=${r.id} AND observed_at>=${window.from} ${window.to?Prisma.sql`AND observed_at<${window.to}`:Prisma.empty}`);
  return {...r,id:String(r.id),occurrences:s._count._all,firstSeenAt:s._min.observedAt,lastSeenAt:s._max.observedAt,activeTargets:Number(counts[0]?.active??0),totalTargets:Number(counts[0]?.total??0),pendingEvents:Number(counts[0]?.pending??0)};
 }));
 rows.sort((a,b)=>+(b.lastSeenAt??0)-+(a.lastSeenAt??0)||(BigInt(a.id)>BigInt(b.id)?-1:1));
 return {window,rows};
}
export function reviewWindowRows(rows:Awaited<ReturnType<typeof visibleBugReports>>['rows']){
 const reviewed=rows.filter(r=>r.state==='REVIEWING');if(!reviewed.length)return null;
 return {id:'review-pending',feature:'reviewed-backlog',code:'REVIEW_PENDING_SUMMARY',severity:reviewed.some(r=>r.severity==='ERROR')?'ERROR':'WARNING',summary:'검토한 미해결 항목 · 추가 근거 확인 및 보완 대기',state:'REVIEWING',occurrences:reviewed.reduce((s,r)=>s+r.pendingEvents,0),historyOccurrences:reviewed.reduce((s,r)=>s+r.occurrences,0),activeTargets:reviewed.reduce((s,r)=>s+r.activeTargets,0),totalTargets:reviewed.reduce((s,r)=>s+r.totalTargets,0),firstSeenAt:reviewed.map(r=>r.firstSeenAt!).sort((a,b)=>+a-+b)[0],lastSeenAt:reviewed.map(r=>r.lastSeenAt!).sort((a,b)=>+b-+a)[0],memberCount:reviewed.length,reviewNote:null};
}
export async function reviewWindowSummary(db:PrismaClient,rows:Awaited<ReturnType<typeof visibleBugReports>>['rows'],window:Awaited<ReturnType<typeof bugWindow>>){
 const summary=reviewWindowRows(rows);if(!summary)return null;
 const ids=rows.filter(r=>r.state==='REVIEWING').map(r=>BigInt(r.id));
 const counts=await db.$queryRaw<Array<{active:bigint;total:bigint}>>(Prisma.sql`SELECT COUNT(DISTINCT IF(resolved_at IS NULL,CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,'')),NULL)) AS active,COUNT(DISTINCT CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,''))) AS total FROM collection_bug_occurrences WHERE report_id IN (${Prisma.join(ids)}) AND observed_at>=${window.from} ${window.to?Prisma.sql`AND observed_at<${window.to}`:Prisma.empty}`);
 return {...summary,activeTargets:Number(counts[0]?.active??0),totalTargets:Number(counts[0]?.total??0)};
}
