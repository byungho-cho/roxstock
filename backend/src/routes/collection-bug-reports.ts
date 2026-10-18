import type {FastifyInstance} from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
const states=['OPEN','REVIEWING','RESOLVED'];
const idOf=(id:string)=>{if(!/^[1-9]\d{0,19}$/.test(id))throw new ApiError(400,'INVALID_INPUT','리포트 번호를 확인해 주세요.');const value=BigInt(id);if(value>18446744073709551615n)throw new ApiError(400,'INVALID_INPUT','리포트 번호를 확인해 주세요.');return value;};
const row=(v:any)=>({...v,id:String(v.id),events:undefined});
const reviewedId='review-pending';
const reviewedWhere=(start?:Date)=>({state:'REVIEWING',...(start?{events:{some:{observedAt:{gte:start,lt:new Date(start.getTime()+86400000)}}}}:{})});
async function reviewedSummary(start?:Date){
 const where=reviewedWhere(start),[range,errors]=await Promise.all([prisma.collectionBugReport.aggregate({where,_count:{_all:true},_sum:{occurrences:true},_min:{firstSeenAt:true},_max:{lastSeenAt:true}}),prisma.collectionBugReport.count({where:{...where,severity:'ERROR'}})]);
 if(!range._count._all)return null;
 const counts=await prisma.$queryRaw<Array<{active:bigint;total:bigint;pendingEvents:bigint}>>`SELECT SUM(e.resolved_at IS NULL) AS pendingEvents,COUNT(DISTINCT IF(e.resolved_at IS NULL,CONCAT(COALESCE(CAST(e.security_id AS CHAR),e.symbol,e.event_key),':',COALESCE(e.fiscal_year,0),':',COALESCE(e.period_type,'')),NULL)) AS active,COUNT(DISTINCT CONCAT(COALESCE(CAST(e.security_id AS CHAR),e.symbol,e.event_key),':',COALESCE(e.fiscal_year,0),':',COALESCE(e.period_type,''))) AS total FROM collection_bug_occurrences e JOIN collection_bug_reports r ON r.id=e.report_id WHERE r.state='REVIEWING' AND (${start??null} IS NULL OR EXISTS (SELECT 1 FROM collection_bug_occurrences d WHERE d.report_id=r.id AND d.observed_at>=${start??null} AND d.observed_at<${start?new Date(start.getTime()+86400000):null}))`;
 return {id:reviewedId,feature:'reviewed-backlog',code:'REVIEW_PENDING_SUMMARY',severity:errors?'ERROR':'WARNING',summary:'검토한 미해결 항목 · 추가 근거 확인 및 보완 대기',state:'REVIEWING',occurrences:Number(counts[0]?.pendingEvents??0),historyOccurrences:range._sum.occurrences??0,firstSeenAt:range._min.firstSeenAt,lastSeenAt:range._max.lastSeenAt,reviewNote:null,activeTargets:Number(counts[0]?.active??0),totalTargets:Number(counts[0]?.total??0),memberCount:range._count._all};
}
async function targetCounts(id:bigint){
 const rows=await prisma.$queryRaw<Array<{active:bigint;total:bigint}>>`SELECT COUNT(DISTINCT IF(resolved_at IS NULL,CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,'')),NULL)) AS active,COUNT(DISTINCT CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,''))) AS total FROM collection_bug_occurrences WHERE report_id=${id}`;
 return {activeTargets:Number(rows[0]?.active??0),totalTargets:Number(rows[0]?.total??0)};
}
export async function collectionBugReportRoutes(app:FastifyInstance){
 app.get('/collection/bug-reports/summary',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');
  const groups=await prisma.collectionBugReport.groupBy({by:['state'],_count:{_all:true},_max:{lastSeenAt:true}});
  return {data:{open:groups.find(g=>g.state==='OPEN')?._count._all??0,reviewing:groups.some(g=>g.state==='REVIEWING')?1:0,resolved:groups.find(g=>g.state==='RESOLVED')?._count._all??0,lastSeenAt:groups.map(g=>g._max.lastSeenAt).filter((d):d is Date=>d!==null).sort((a,b)=>b.getTime()-a.getTime())[0]??null}};
 });
 app.get<{Querystring:{state?:string;offset?:string;date?:string}}>('/collection/bug-reports',async(request,reply)=>{
  reply.header('Cache-Control','no-store');const state=request.query.state??'UNRESOLVED';
  const offset=Number(request.query.offset??0),date=request.query.date;
  if(!['ALL','UNRESOLVED',...states].includes(state)||!Number.isSafeInteger(offset)||offset<0||offset>100000||date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const start=date?new Date(date+'T00:00:00+09:00'):undefined;
  if(start&&(!Number.isFinite(start.getTime())||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(start)!==date))throw new ApiError(400,'INVALID_INPUT','조회일을 확인해 주세요.');
  const grouped=state==='UNRESOLVED'||state==='REVIEWING',summary=grouped?await reviewedSummary(start):null;
  if(state==='REVIEWING')return {data:{rows:offset===0&&summary?[summary]:[],hasNext:false,nextOffset:offset+20}};
  const capacity=20-(summary&&offset===0?1:0);
  const rows=await prisma.collectionBugReport.findMany({where:{...(state==='ALL'?{}:state==='UNRESOLVED'?{state:'OPEN'}:{state}),...(start?{events:{some:{observedAt:{gte:start,lt:new Date(start.getTime()+86400000)}}}}:{})},orderBy:[{lastSeenAt:'desc'},{id:'desc'}],skip:Math.max(0,offset-(summary?1:0)),take:capacity+1});
  return {data:{rows:[...(summary&&offset===0?[summary]:[]),...await Promise.all(rows.slice(0,capacity).map(async r=>({...row(r),...await targetCounts(r.id)})))],hasNext:rows.length>capacity,nextOffset:offset+20}};
 });
 app.get<{Params:{id:string};Querystring:{memberOffset?:string}}>('/collection/bug-reports/:id',async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  if(request.params.id===reviewedId){
   const offset=Number(request.query.memberOffset??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new ApiError(400,'INVALID_INPUT','조회 위치를 확인해 주세요.');
   const summary=await reviewedSummary();if(!summary)throw new ApiError(404,'NOT_FOUND','검토 중인 항목이 없습니다.');
   const [members,events]=await Promise.all([prisma.collectionBugReport.findMany({where:reviewedWhere(),orderBy:[{severity:'asc'},{lastSeenAt:'desc'},{id:'desc'}],skip:offset,take:51}),prisma.collectionBugOccurrence.findMany({where:{resolvedAt:null,report:reviewedWhere()},include:{report:{select:{code:true,summary:true}}},orderBy:[{observedAt:'desc'},{eventKey:'desc'}],take:50})]);
   const securities=await prisma.security.findMany({where:{id:{in:[...new Set(events.flatMap(e=>e.securityId?[e.securityId]:[]))]}},select:{id:true,name:true,symbol:true}}),names=new Map(securities.map(s=>[String(s.id),s]));
   return {data:{...summary,members:await Promise.all(members.slice(0,50).map(async r=>({...row(r),...await targetCounts(r.id)}))),hasNextMembers:members.length>50,memberOffset:offset,events:events.map(e=>({...e,report:undefined,code:e.report?.code,summary:e.report?.summary,reportId:e.reportId?.toString(),securityId:e.securityId?.toString(),runId:e.runId?.toString(),symbol:e.symbol??names.get(String(e.securityId))?.symbol??null,securityName:names.get(String(e.securityId))?.name??null}))}};
  }
  const report=await prisma.collectionBugReport.findUnique({where:{id:idOf(request.params.id)},include:{events:{orderBy:[{observedAt:'desc'},{eventKey:'desc'}],take:50}}});
  if(!report)throw new ApiError(404,'NOT_FOUND','리포트가 없습니다.');
  const ids=[...new Set(report.events.flatMap(e=>e.securityId?[e.securityId]:[]))];
  const securities=await prisma.security.findMany({where:{id:{in:ids}},select:{id:true,name:true,symbol:true}});
  const names=new Map(securities.map(s=>[String(s.id),s]));
  return {data:{...row(report),...await targetCounts(report.id),events:report.events.map(e=>({...e,reportId:e.reportId?.toString(),securityId:e.securityId?.toString(),runId:e.runId?.toString(),symbol:e.symbol??names.get(String(e.securityId))?.symbol??null,securityName:names.get(String(e.securityId))?.name??null}))}};
 });
 app.patch<{Params:{id:string};Body:{state?:string;note?:string}}>('/collection/bug-reports/:id',async request=>{
  const {state,note}=request.body??{};if(!state||!states.includes(state)||note!==undefined&&(typeof note!=='string'||note.length>1000))throw new ApiError(400,'INVALID_INPUT','검토 상태와 메모를 확인해 주세요.');
  const id=idOf(request.params.id);const found=await prisma.collectionBugReport.findUnique({where:{id}});if(!found)throw new ApiError(404,'NOT_FOUND','리포트가 없습니다.');
  return {data:row(await prisma.$transaction(async tx=>{
   const at=new Date();await tx.$queryRaw`SELECT id FROM collection_bug_reports WHERE id=${id} FOR UPDATE`;
   if(state==='RESOLVED')await tx.collectionBugOccurrence.updateMany({where:{reportId:id,resolvedAt:null},data:{resolvedAt:at,resolution:'MANUAL_REVIEW'}});
   else if(found.state==='RESOLVED')await tx.collectionBugOccurrence.updateMany({where:{reportId:id,resolution:'MANUAL_REVIEW'},data:{resolvedAt:null,resolution:null}});
   return tx.collectionBugReport.update({where:{id},data:{state,...(note===undefined?{}:{reviewNote:note}),resolvedAt:state==='RESOLVED'?at:null}});
  }))};
 });
 app.delete<{Params:{id:string}}>('/collection/bug-reports/:id',async request=>{
  const id=idOf(request.params.id);const result=await prisma.$transaction(async tx=>{const deleted=await tx.collectionBugReport.deleteMany({where:{id,state:'RESOLVED'}});if(deleted.count)await tx.collectionBugOccurrence.updateMany({where:{reportId:null},data:{securityId:null,symbol:null,fiscalYear:null,periodType:null,runId:null,metric:null}});return deleted;});
  if(!result.count)throw new ApiError(409,'REPORT_NOT_RESOLVED','해결 완료한 리포트만 삭제할 수 있습니다.');return {data:{deleted:true}};
 });
}
