import type {FastifyInstance} from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
const states=['OPEN','REVIEWING','RESOLVED'];
const idOf=(id:string)=>{if(!/^[1-9]\d{0,19}$/.test(id))throw new ApiError(400,'INVALID_INPUT','리포트 번호를 확인해 주세요.');const value=BigInt(id);if(value>18446744073709551615n)throw new ApiError(400,'INVALID_INPUT','리포트 번호를 확인해 주세요.');return value;};
const row=(v:any)=>({...v,id:String(v.id),events:undefined});
async function targetCounts(id:bigint){
 const rows=await prisma.$queryRaw<Array<{active:bigint;total:bigint}>>`SELECT COUNT(DISTINCT IF(resolved_at IS NULL,CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,'')),NULL)) AS active,COUNT(DISTINCT CONCAT(COALESCE(CAST(security_id AS CHAR),symbol,event_key),':',COALESCE(fiscal_year,0),':',COALESCE(period_type,''))) AS total FROM collection_bug_occurrences WHERE report_id=${id}`;
 return {activeTargets:Number(rows[0]?.active??0),totalTargets:Number(rows[0]?.total??0)};
}
export async function collectionBugReportRoutes(app:FastifyInstance){
 app.get('/collection/bug-reports/summary',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');
  const groups=await prisma.collectionBugReport.groupBy({by:['state'],_count:{_all:true},_max:{lastSeenAt:true}});
  return {data:{open:groups.find(g=>g.state==='OPEN')?._count._all??0,reviewing:groups.find(g=>g.state==='REVIEWING')?._count._all??0,resolved:groups.find(g=>g.state==='RESOLVED')?._count._all??0,lastSeenAt:groups.map(g=>g._max.lastSeenAt).filter((d):d is Date=>d!==null).sort((a,b)=>b.getTime()-a.getTime())[0]??null}};
 });
 app.get<{Querystring:{state?:string;offset?:string;date?:string}}>('/collection/bug-reports',async(request,reply)=>{
  reply.header('Cache-Control','no-store');const state=request.query.state??'UNRESOLVED';
  const offset=Number(request.query.offset??0),date=request.query.date;
  if(!['ALL','UNRESOLVED',...states].includes(state)||!Number.isSafeInteger(offset)||offset<0||offset>100000||date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const start=date?new Date(date+'T00:00:00+09:00'):undefined;
  if(start&&(!Number.isFinite(start.getTime())||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(start)!==date))throw new ApiError(400,'INVALID_INPUT','조회일을 확인해 주세요.');
  const rows=await prisma.collectionBugReport.findMany({where:{...(state==='ALL'?{}:state==='UNRESOLVED'?{state:{in:['OPEN','REVIEWING']}}:{state}),...(start?{events:{some:{observedAt:{gte:start,lt:new Date(start.getTime()+86400000)}}}}:{})},orderBy:[{lastSeenAt:'desc'},{id:'desc'}],skip:offset,take:21});
  return {data:{rows:await Promise.all(rows.slice(0,20).map(async r=>({...row(r),...await targetCounts(r.id)}))),hasNext:rows.length>20,nextOffset:offset+20}};
 });
 app.get<{Params:{id:string}}>('/collection/bug-reports/:id',async(request,reply)=>{
  reply.header('Cache-Control','no-store');const report=await prisma.collectionBugReport.findUnique({where:{id:idOf(request.params.id)},include:{events:{orderBy:[{observedAt:'desc'},{eventKey:'desc'}],take:50}}});
  if(!report)throw new ApiError(404,'NOT_FOUND','리포트가 없습니다.');
  const ids=[...new Set(report.events.flatMap(e=>e.securityId?[e.securityId]:[]))];
  const securities=await prisma.security.findMany({where:{id:{in:ids}},select:{id:true,name:true,symbol:true}});
  const names=new Map(securities.map(s=>[String(s.id),s]));
  return {data:{...row(report),...await targetCounts(report.id),events:report.events.map(e=>({...e,reportId:e.reportId?.toString(),securityId:e.securityId?.toString(),runId:e.runId?.toString(),securityName:names.get(String(e.securityId))?.name??null}))}};
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
