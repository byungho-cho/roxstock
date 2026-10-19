import {publicDartReview} from '@roxstock/shared/domain/dart-review';
import {runViews,effectiveResult} from './collection-run-view.js';
import {skipKind} from '@roxstock/shared/domain/collection-health';
import {collectionPublicMessage,collectionPublicMetadata} from '../domain/collection-public-message.js';
import {exclusionReason,type CollectionFeature} from '@roxstock/shared/collection/collection-policy';
import {createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {Prisma} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';

type Query = {limit?: string; cursor?: string; result?: string; phase?: string; symbol?: string; market?: string; accountId?: string; from?: string; to?: string;runId?:string};
type Cursor = {v: 1; scope: string; at: string; id: string; ceiling: string};
const jobs: Record<string,string> = {'stock-news':'stock-news','security-master':'security-master','realtime-prices':'realtime-selected-prices','market-prices':'market-prices','account-snapshots':'daily-account-snapshots','dart-financial-statements':'dart-financial-statements','investor-trends':'investor-trends'};
const reason=collectionPublicMessage;
const statuses = {runs:['SUCCESS','PARTIAL','FAILED','SKIPPED','RUNNING'],items:['SUCCESS','FAILED','STALE','SKIPPED','NO_DATA','NOT_APPLICABLE']};
function date(value?: string) {
  if (!value) return undefined;
  const d = new Date(value+'T00:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+d) || d.toISOString().slice(0,10)!==value) throw Error('Invalid date');
  return d;
}
export function pageCondition(feature: string, stream: string, q: Query) {
  const limit = q.limit === undefined ? 50 : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('Invalid limit');
  const status = q.result?.toUpperCase();
  if (status && !statuses[stream as 'runs'|'items'].includes(status)) throw Error('Invalid status');
  if(q.market && !['KOSPI','KOSDAQ','KONEX','OTHER'].includes(q.market)) throw Error('Invalid market');
  if(q.phase && !['BACKFILL','CURRENT'].includes(q.phase)) throw Error('Invalid phase');
  const from=date(q.from), to=date(q.to);
  if(from && to && from>to) throw Error('Invalid range');
  if(to) to.setUTCDate(to.getUTCDate()+1);
  const scope=createHash('sha256').update(JSON.stringify([feature,stream,limit,status??'',q.phase??'',q.symbol??'',q.market??'',q.accountId??'',q.from??'',q.to??'',q.runId??''])).digest('hex');
  let cursor: Cursor | undefined;
  if(q.cursor) {
    if(q.cursor.length>2048) throw Error('Invalid cursor');
    cursor=JSON.parse(Buffer.from(q.cursor,'base64url').toString());
    if(!cursor || cursor.v!==1 || cursor.scope!==scope || !/^\d+$/.test(cursor.id) || !/^\d+$/.test(cursor.ceiling) || !Number.isFinite(Date.parse(cursor.at)) || BigInt(cursor.id)>BigInt(cursor.ceiling) || BigInt(cursor.ceiling)>18446744073709551615n) throw Error('Invalid cursor');
  }
  const range = from || to ? {...(from && {gte:from}),...(to && {lt:to})} : undefined;
  const item: Prisma.CollectorRunItemWhereInput={...(feature==='security-master'?{NOT:{symbol:{startsWith:'MASTER:'}}}:{}),...(q.symbol && {symbol:{contains:q.symbol}}),...(q.market && {security:{is:{marketType:q.market as never}}}),...(q.accountId && feature==='account-snapshots' && {symbol:`account:${q.accountId}`})};
  if(q.runId&&!/^\d{1,20}$/.test(q.runId))throw Error('Invalid run');
  const run: Prisma.CollectorRunWhereInput={jobType:jobs[feature],...(q.runId?{id:BigInt(q.runId)}:{}),...(q.phase && {metadata:{path:'$.phase',equals:q.phase}})};
  const where: Prisma.CollectorRunWhereInput | Prisma.CollectorRunItemWhereInput = stream==='runs'
    ? {...run,...(range && {startedAt:range}),...(status && {status:status as never}),...(Object.keys(item).length>0 && {items:{some:item}})}
    : {...item,run:{is:run},...(range && {createdAt:range}),...(status && {status:status as never})};
  return {where,limit,cursor,scope};
}
export function pageBoundary(at: string, id: string, field: string) {
  return {OR:[{[field]:{lt:new Date(at)}},{[field]:new Date(at),id:{lt:BigInt(id)}}]};
}
export async function collectionPageRoutes(app: FastifyInstance) {
  for(const stream of ['runs','items'] as const) app.get<{Params:{feature:string};Querystring:Query}>(`/collection/monitoring/:feature/${stream}`,async(request,reply)=>{
    const feature=request.params.feature;
    if(!jobs[feature]) return reply.code(404).send({error:{code:'COLLECTION_FEATURE_NOT_FOUND',message:'Unknown collection feature.'}});
    let condition: ReturnType<typeof pageCondition>;
    try{condition=pageCondition(feature,stream,request.query);}catch{return reply.code(400).send({error:{code:'INVALID_MONITOR_PAGE',message:'조회 조건 또는 페이지 커서가 올바르지 않습니다.'}});}
    const {where,limit,cursor,scope}=condition;
    // Immutable ID ceiling excludes new records, including backdated inserts, from subsequent pages.
    const ceiling=cursor ? BigInt(cursor.ceiling) : (stream==='runs'
      ? (await prisma.collectorRun.aggregate({where:where as Prisma.CollectorRunWhereInput,_max:{id:true}}))._max.id
      : (await prisma.collectorRunItem.aggregate({where:where as Prisma.CollectorRunItemWhereInput,_max:{id:true}}))._max.id) ?? 0n;
    const field=stream==='runs'?'startedAt':'createdAt';
    const paged={AND:[where,{id:{lte:ceiling}},...(cursor?[pageBoundary(cursor.at,cursor.id,field)]:[])]};
    // Only one lookahead row is read; entire historical collections are never materialized.
    const records=stream==='runs'
      ? await prisma.collectorRun.findMany({where:paged as Prisma.CollectorRunWhereInput,orderBy:[{startedAt:'desc'},{id:'desc'}],take:limit+1})
      : await prisma.collectorRunItem.findMany({where:paged as Prisma.CollectorRunItemWhereInput,orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit+1,include:{run:{select:{metadata:true}},security:{select:{id:true,isActive:true,symbol:true,name:true,marketType:true,securityType:true,registrationSource:true,collectionExcluded:true,excludedFeatures:true,collectionRevision:true}}}});
    const hasNext=records.length>limit, visible=records.slice(0,limit);
    const views=await runViews(visible.filter(record=>'startedAt' in record).map(record=>record.id));
    const rows=visible.map(record=> 'startedAt' in record
      ? {id:record.id.toString(),status:effectiveResult(record,views.get(String(record.id))!),originalStatus:record.status,excluded:views.get(String(record.id))?.excluded??null,skipReasons:views.get(String(record.id))?.skipReasons??{},startedAt:record.startedAt.toISOString(),finishedAt:record.finishedAt?.toISOString()??null,target:views.get(String(record.id))?.target || record.successCount+record.failureCount+record.staleCount+record.skippedCount,success:views.get(String(record.id))?.target?views.get(String(record.id))!.success:record.successCount,failed:views.get(String(record.id))?.target?views.get(String(record.id))!.failed:record.failureCount,skipped:views.get(String(record.id))?.target?views.get(String(record.id))!.skipped+views.get(String(record.id))!.stale:record.skippedCount,failureReason:reason(record.failureReason),metadata:collectionPublicMetadata(record.metadata)}
      : {id:record.id.toString(),symbol:record.symbol,recordedSymbol:(/^\d+:\d{4}:(?:ANNUAL|Q[1-4])$/.test(record.symbol)?((record.run?.metadata as {symbol?:string}|null)?.symbol??null):/^[A-Z0-9]{6}(?::|$)/.test(record.symbol)?record.symbol.split(':')[0]:null),security:'security' in record&&record.security ? {...record.security,id:String(record.security.id),automaticExclusion:record.security.symbol.toUpperCase().startsWith('Z99'),exclusionReason:exclusionReason(record.security,feature as CollectionFeature)} : null,status:record.status,reason:reason(record.message),sourceReview:publicDartReview(record.diagnostics),skipKind:record.status==='SKIPPED'?skipKind(record.message):record.status,runId:String(record.runId),occurredAt:record.createdAt.toISOString(),observedAt:record.observedAt?.toISOString()??null});
    const last=visible.at(-1);
    const nextCursor=hasNext && last ? Buffer.from(JSON.stringify({v:1,scope,at:('startedAt' in last?last.startedAt:last.createdAt).toISOString(),id:last.id.toString(),ceiling:ceiling.toString()} satisfies Cursor)).toString('base64url') : null;
    let note:string|undefined;
    if(stream==='items'&&request.query.runId&&rows.length===0){const run=await prisma.collectorRun.findFirst({where:{id:BigInt(request.query.runId),jobType:jobs[feature]}});const recorded=run?await prisma.collectorRunItem.count({where:{runId:run.id,...(feature==='security-master'?{NOT:{symbol:{startsWith:'MASTER:'}}}:{})}}):0;if(run&&!recorded&&run.successCount+run.failureCount+run.skippedCount>0)note='이전 실행에는 개별 대상 결과가 기록되지 않았습니다. 원본 실행 집계는 실행 이력에서 확인할 수 있습니다.';}
    return {data:{rows,hasNext,nextCursor,...(note?{note}:{})}};
  });
}
