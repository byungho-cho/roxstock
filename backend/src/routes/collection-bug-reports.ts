import type {FastifyInstance} from 'fastify';
import {prisma} from '../auth/scoped-db.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
const states=['OPEN','REVIEWING','RESOLVED'];
const idOf=(id:string)=>{if(!/^[1-9]\d{0,19}$/.test(id))throw new ApiError(400,'INVALID_INPUT','리포트 번호를 확인해 주세요.');const value=BigInt(id);if(value>18446744073709551615n)throw new ApiError(400,'INVALID_INPUT','리포트 번호를 확인해 주세요.');return value;};
const row=(v:any)=>({...v,id:String(v.id),events:undefined});
import {visibleBugReports,reviewWindowSummary} from '../domain/bug-report-window.js';

export async function collectionBugReportRoutes(app:FastifyInstance){
 app.get('/collection/bug-reports/summary',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');const {rows,window}=await visibleBugReports(prisma);
  return {data:{open:rows.filter(r=>r.state==='OPEN').length,reviewing:rows.some(r=>r.state==='REVIEWING')?1:0,resolved:rows.filter(r=>r.state==='RESOLVED').length,lastSeenAt:rows[0]?.lastSeenAt??null,reportingFrom:window.reportingFrom}};
 });
 app.get<{Querystring:{state?:string;offset?:string;date?:string}}>('/collection/bug-reports',async(request,reply)=>{
  reply.header('Cache-Control','no-store');const state=request.query.state??'UNRESOLVED',offset=Number(request.query.offset??0);
  if(!['ALL','UNRESOLVED',...states].includes(state)||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const {rows,window}=await visibleBugReports(prisma,request.query.date),summary=await reviewWindowSummary(prisma,rows,window);
  const selected=state==='REVIEWING'?(summary?[summary]:[]):state==='UNRESOLVED'?[...(summary?[summary]:[]),...rows.filter(r=>r.state==='OPEN')]:rows.filter(r=>state==='ALL'||r.state===state);
  return {data:{rows:selected.slice(offset,offset+20),hasNext:selected.length>offset+20,nextOffset:offset+20,reportingFrom:window.reportingFrom}};
 });
 app.get<{Params:{id:string};Querystring:{memberOffset?:string}}>('/collection/bug-reports/:id',async(request,reply)=>{
  reply.header('Cache-Control','no-store');const {rows,window}=await visibleBugReports(prisma);
  const reviewed=request.params.id==='review-pending',report=reviewed?await reviewWindowSummary(prisma,rows,window):rows.find(r=>r.id===String(idOf(request.params.id)));
  if(!report)throw new ApiError(404,'NOT_FOUND','새 리포팅 목록에 없는 항목입니다. 기존 이력은 보관되어 있습니다.');
  const offset=Number(request.query.memberOffset??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new ApiError(400,'INVALID_INPUT','조회 위치를 확인해 주세요.');
  const members=rows.filter(r=>r.state==='REVIEWING');
  const events=await prisma.collectionBugOccurrence.findMany({where:{...window.where,...(reviewed?{resolvedAt:null,reportId:{in:members.map(r=>BigInt(r.id))}}:{reportId:BigInt(report.id)})},orderBy:[{observedAt:'desc'},{eventKey:'desc'}],take:50,include:{report:{select:{code:true,summary:true}}}});
  const stocks=await prisma.security.findMany({where:{id:{in:[...new Set(events.flatMap(e=>e.securityId?[e.securityId]:[]))]}},select:{id:true,name:true,symbol:true}}),names=new Map(stocks.map(s=>[String(s.id),s]));
  return {data:{...report,...(reviewed?{members:members.slice(offset,offset+50),hasNextMembers:members.length>offset+50,memberOffset:offset}:{}),reportingFrom:window.reportingFrom,events:events.map(e=>({...e,report:undefined,code:e.report?.code,summary:e.report?.summary,reportId:e.reportId?.toString(),securityId:e.securityId?.toString(),runId:e.runId?.toString(),symbol:e.symbol??names.get(String(e.securityId))?.symbol??null,securityName:names.get(String(e.securityId))?.name??null}))}};
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
