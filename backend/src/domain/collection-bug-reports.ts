import {createHash} from 'node:crypto';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import type {MetricValues} from '@roxstock/shared/domain/period-valuation';
export type BugEvent={sourceKey:string;feature:string;code:string;severity:'ERROR'|'WARNING';summary:string;observedAt:Date;securityId?:bigint;symbol?:string;fiscalYear?:number;periodType?:string;runId?:bigint;metric?:string};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export const safeBugCode=(v:unknown,fallback='COLLECTION_FAILED')=>typeof v==='string'&&/^(?:(?:KIS|DART|HISTORICAL|SHARES|ACCOUNTS|VALUATION|SUPPLEMENT|MANUAL|HTTP|TASK|DAILY|SOURCE|COLLECTION|SCHEDULE|API|KRX|NAVER|PRICE|PERIOD|DATABASE|DB|PRISMA)_[A-Z0-9_]{1,60}|[0-9]{3})$/.test(v)?v:fallback;
const reviewReasons:Record<string,string>={CLOSING_MONTH_CHANGED:'결산월·결산주기 확인 필요',CLOSING_MONTH_UNAVAILABLE:'결산월 근거 부족',MULTIPLE_ANNUAL_PERIODS:'연중 복수 결산기간 확인 필요',CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION:'정정공시 원본 검증 필요',CORRECTION_RELATION_UNVERIFIED:'정정공시 관계 확인 필요'};
export function collectionFailureDetails(item:{diagnostics:unknown;message:string|null}){
 const d=object(item.diagnostics),fromMessage=(item.message??'').split(/[:·\s]+/).map(v=>safeBugCode(v,'')).find(Boolean);
 const code=safeBugCode(d.originalCode??d.code??d.errorCode??fromMessage);
 if(code==='DART_SOURCE_REVIEW'){
  const reason=typeof d.validationResult==='string'&&/^[A-Z][A-Z0-9_]{1,60}$/.test(d.validationResult)?d.validationResult:null;
  return {code:reason?'DART_REVIEW_'+reason:code,severity:'WARNING' as const,summary:reason?reviewReasons[reason]??'공시 원천 검증 보류':'공시 원천 검증 보류 · 기간·정정 관계 확인 필요'};
 }
 return {code,severity:'ERROR' as const,summary:'수집 항목 처리 실패 · 원천 응답 또는 저장 처리 확인 필요'};
}
const featureOf=(job:string)=>job.startsWith('investor')?'investor-trends':job==='VALUATION_SUPPLEMENT'?'dart-financial-statements':job==='daily-account-snapshots'?'account-snapshots':job==='realtime-selected-prices'?'realtime-prices':job;
/** Only allowlisted diagnostic codes and typed context are stored; never provider bodies or error text. */
export function periodBugEvents(row:{securityId:bigint;fiscalYear:number;periodType:string;status:string;values:unknown;reasons:unknown;supplemental:unknown;attempts:number;updatedAt:Date;collectionSymbol?:string|null;provenance?:unknown}):BugEvent[]{
 if(object(row.provenance).calculationState==='FISCAL_DURATION_REVIEW_REQUIRED')return [{sourceKey:'period:'+row.securityId+':'+row.fiscalYear+':'+row.periodType+':'+row.attempts+':fiscal-duration',feature:'dart-financial-statements',code:'DART_REVIEW_FISCAL_DURATION_UNVERIFIED',severity:'WARNING',summary:'실제 회계기간 길이 확인 필요 · 연환산 지표 계산 보류',observedAt:row.updatedAt,securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType}];
 if(row.status==='SUCCESS'||valueCompletion(object(row.values) as Partial<MetricValues>).complete)return [];
 const values=object(row.values),reasons=object(row.reasons),errors=object(object(row.supplemental).errors);
 const keys=['eps','bps','per','pbr','roe'].filter(k=>values[k]==null&&!((k==='per'&&values.eps!=null&&Number(values.eps)<=0)||(k==='pbr'&&values.bps!=null&&Number(values.bps)<=0)));
 if(!keys.length)return [];
 return keys.map(metric=>{
  const reason=String(reasons[metric]??'');
  const code=safeBugCode(errors[metric+'Code']??(metric==='per'||metric==='pbr'?errors.priceCode:undefined),/기준.*미확인|액면분할/.test(reason)?'PERIOD_PRICE_BASIS_UNCONFIRMED':'PERIOD_'+metric.toUpperCase()+'_MISSING');
  return {sourceKey:'period:'+row.securityId+':'+row.fiscalYear+':'+row.periodType+':'+row.attempts+':'+metric+':'+code,feature:'dart-financial-statements',code,severity:row.status==='FAILED'?'ERROR':'WARNING',summary:metric.toUpperCase()+' 보완 미완료 · 동일 기간 자료 또는 계산 기준 확인 필요',observedAt:row.updatedAt,securityId:row.securityId,symbol:row.collectionSymbol??undefined,fiscalYear:row.fiscalYear,periodType:row.periodType,metric};
 });
}
export async function saveBugEvent(db:PrismaClient,event:BugEvent){
 const eventKey=hash(event.sourceKey),fingerprint=hash(event.feature+':'+event.code+':'+(event.metric??''));
 return db.$transaction(async tx=>{
  const inserted=await tx.collectionBugOccurrence.createMany({data:{eventKey,observedAt:event.observedAt,securityId:event.securityId,symbol:event.symbol&&/^[A-Z0-9]{6}$/.test(event.symbol)?event.symbol:null,fiscalYear:event.fiscalYear,periodType:event.periodType,runId:event.runId,metric:event.metric},skipDuplicates:true});
  if(!inserted.count){
   // Reclassify legacy generic occurrences without creating another occurrence or replay count.
   await tx.$queryRaw`SELECT event_key FROM collection_bug_occurrences WHERE event_key=${eventKey} FOR UPDATE`;
   const current=await tx.collectionBugOccurrence.findUnique({where:{eventKey},include:{report:true}});
   if(!current?.report||current.report.code!=='COLLECTION_FAILED'||event.code==='COLLECTION_FAILED')return false;
   const old=current.report;
   await tx.$queryRaw`SELECT id FROM collection_bug_reports WHERE id=${old.id} FOR UPDATE`;
   const target=await tx.collectionBugReport.upsert({where:{fingerprint},create:{fingerprint,feature:event.feature,code:event.code,severity:event.severity,summary:event.summary,occurrences:1,firstSeenAt:event.observedAt,lastSeenAt:event.observedAt,state:old.state,reviewNote:old.reviewNote,resolvedAt:old.resolvedAt},update:{occurrences:{increment:1}}});
   await tx.collectionBugOccurrence.update({where:{eventKey},data:{reportId:target.id}});
   const range=await tx.collectionBugOccurrence.aggregate({where:{reportId:target.id},_min:{observedAt:true},_max:{observedAt:true}});
   await tx.collectionBugReport.update({where:{id:target.id},data:{firstSeenAt:range._min.observedAt!,lastSeenAt:range._max.observedAt!}});
   const left=await tx.collectionBugOccurrence.count({where:{reportId:old.id}});
   if(!left)await tx.collectionBugReport.delete({where:{id:old.id}});
   else{const remaining=await tx.collectionBugOccurrence.aggregate({where:{reportId:old.id},_min:{observedAt:true},_max:{observedAt:true}});await tx.collectionBugReport.update({where:{id:old.id},data:{occurrences:left,firstSeenAt:remaining._min.observedAt!,lastSeenAt:remaining._max.observedAt!}});}
   return true;
  }
  const report=await tx.collectionBugReport.upsert({where:{fingerprint},create:{fingerprint,feature:event.feature,code:event.code,severity:event.severity,summary:event.summary,occurrences:1,firstSeenAt:event.observedAt,lastSeenAt:event.observedAt},update:{occurrences:{increment:1}}});
  await tx.collectionBugReport.updateMany({where:{id:report.id,firstSeenAt:{gt:event.observedAt}},data:{firstSeenAt:event.observedAt}});
  await tx.collectionBugReport.updateMany({where:{id:report.id,lastSeenAt:{lt:event.observedAt}},data:{lastSeenAt:event.observedAt}});
  if(event.severity==='ERROR'&&report.severity!=='ERROR')await tx.collectionBugReport.update({where:{id:report.id},data:{severity:'ERROR'}});
  if(report.state==='RESOLVED'&&(!report.resolvedAt||event.observedAt>report.resolvedAt))await tx.collectionBugReport.update({where:{id:report.id},data:{state:'OPEN',resolvedAt:null}});
  await tx.collectionBugOccurrence.update({where:{eventKey},data:{reportId:report.id}});return true;
 });
}
/** Bounded legacy repair. Exact source hashes preserve occurrence identity and counts. */
export async function reclassifyBugReportsPage(db:PrismaClient,after?:string){
 await db.collectionBugReport.updateMany({where:{severity:'ERROR',OR:[{code:'DART_SOURCE_REVIEW'},{code:{startsWith:'DART_REVIEW_'}}]},data:{severity:'WARNING'}});
 const events=await db.collectionBugOccurrence.findMany({where:{report:{code:'COLLECTION_FAILED'},...(after?{eventKey:{gt:after}}:{})},orderBy:{eventKey:'asc'},take:50,include:{report:{select:{feature:true}}}});let changed=0;
 for(const e of events){if(!e.runId)continue;
  const items=await db.collectorRunItem.findMany({where:{runId:e.runId,status:'FAILED',securityId:e.securityId,OR:[{createdAt:e.observedAt},{observedAt:e.observedAt}]},take:30});
  const item=items.find(i=>hash('item:'+i.id+':'+(i.observedAt&&i.observedAt>i.createdAt?i.observedAt:i.createdAt).toISOString())===e.eventKey);
  if(!item)continue;const classification=collectionFailureDetails(item);if(classification.code==='COLLECTION_FAILED')continue;
  if(await saveBugEvent(db,{sourceKey:'item:'+item.id+':'+e.observedAt.toISOString(),feature:e.report!.feature,...classification,observedAt:e.observedAt,securityId:e.securityId??undefined,runId:e.runId,symbol:e.symbol??undefined}))changed++;
 }
 return {scanned:events.length,changed,cursor:events.at(-1)?.eventKey,hasNext:events.length===50};
}
let legacyRepairCursor:string|undefined;
/** Replay a small overlap; durable occurrence keys prevent duplicate counts and deleted reports resurfacing. */
export async function scanCollectionBugs(db:PrismaClient,now=new Date()){
 const state=await db.collectionBugScanState.upsert({where:{key:'collection-errors'},create:{key:'collection-errors',scannedAt:now},update:{}});
 const repaired=await reclassifyBugReportsPage(db,legacyRepairCursor);legacyRepairCursor=repaired.hasNext?repaired.cursor:undefined;
 const since=new Date(state.scannedAt.getTime()-300000);let count=repaired.changed;
 let after:{updatedAt:Date;securityId:bigint;fiscalYear:number;periodType:string}|undefined;
 for(;;){
  const seek=after?{OR:[{updatedAt:{gt:after.updatedAt}},{updatedAt:after.updatedAt,securityId:{gt:after.securityId}},{updatedAt:after.updatedAt,securityId:after.securityId,fiscalYear:{gt:after.fiscalYear}},{updatedAt:after.updatedAt,securityId:after.securityId,fiscalYear:after.fiscalYear,periodType:{gt:after.periodType}}]}:{};
  const rows=await db.periodValuation.findMany({where:{AND:[{updatedAt:{gte:since,lte:now},status:{not:'SUCCESS'}},seek]},orderBy:[{updatedAt:'asc'},{securityId:'asc'},{fiscalYear:'asc'},{periodType:'asc'}],take:100});
  for(const row of rows)for(const event of periodBugEvents(row))if(await saveBugEvent(db,event))count++;
  if(rows.length<100)break;after=rows.at(-1)!;
 }
 for(let skip=0;;skip+=100){
  const items=await db.collectorRunItem.findMany({where:{OR:[{createdAt:{gte:since,lte:now}},{observedAt:{gte:since,lte:now}}],status:'FAILED'},include:{run:{select:{jobType:true,provider:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}],skip,take:100});
  for(const item of items){const observedAt=item.observedAt&&item.observedAt>item.createdAt?item.observedAt:item.createdAt;const classification=collectionFailureDetails(item);if(await saveBugEvent(db,{sourceKey:'item:'+item.id+':'+observedAt.toISOString(),feature:featureOf(item.run.jobType),...classification,observedAt,securityId:item.securityId??undefined,symbol:item.symbol,runId:item.runId}))count++;}
  if(items.length<100)break;
 }
 for(let skip=0;;skip+=100){
  const runs=await db.collectorRun.findMany({where:{finishedAt:{gte:since,lte:now},status:{in:['FAILED','PARTIAL']}},include:{items:{where:{status:'FAILED'},take:1,select:{id:true}}},orderBy:[{finishedAt:'asc'},{id:'asc'}],skip,take:100});
  for(const run of runs){const m=object(run.metadata);const results=Array.isArray(m.results)?m.results:[];let emitted=false;
   for(const result of results)for(const source of ['dart','valuation']){const task=object(object(result.tasks)[source]);if(task.state!=='FAILED')continue;emitted=true;const code=safeBugCode(task.code);if(await saveBugEvent(db,{sourceKey:'run:'+run.id+':'+result.fiscalYear+':'+result.period+':'+source,feature:featureOf(run.jobType),code,severity:code==='DART_SOURCE_REVIEW'?'WARNING':'ERROR',summary:code==='DART_SOURCE_REVIEW'?'공시 원천 검증 보류':(source==='dart'?'재무제표':'가치지표')+' 수집 요청 실패',observedAt:run.finishedAt!,securityId:/^\d+$/.test(String(m.securityId))?BigInt(m.securityId):undefined,symbol:m.symbol,fiscalYear:Number.isInteger(result.fiscalYear)?result.fiscalYear:undefined,periodType:['ANNUAL','Q1','Q2','Q3'].includes(result.period)?result.period:undefined,runId:run.id}))count++;}
   if(!emitted&&!run.items.length&&(run.status==='FAILED'||run.failureCount>0)){const code=safeBugCode(run.failureReason);if(await saveBugEvent(db,{sourceKey:'run:'+run.id,feature:featureOf(run.jobType),code,severity:'ERROR',summary:'수집 작업 실행 실패 · 작업 기록 확인 필요',observedAt:run.finishedAt!,runId:run.id}))count++;}
  }
  if(runs.length<100)break;
 }
 for(let skip=0;;skip+=100){
  const rows=await db.realtimeCollectorIssue.findMany({where:{occurredAt:{gte:since,lte:now}},orderBy:[{occurredAt:'asc'},{id:'asc'}],skip,take:100});
  for(const issue of rows)if(await saveBugEvent(db,{sourceKey:'realtime:'+issue.id,feature:'realtime-prices',code:'PRICE_REALTIME_'+(/^[A-Z_]{1,20}$/.test(issue.stage)?issue.stage:'REQUEST')+'_FAILED',severity:'ERROR',summary:'실시간 주가 수집·저장 처리 오류',observedAt:issue.occurredAt,symbol:issue.symbol??undefined}))count++;
  if(rows.length<100)break;
 }
 await db.collectionBugScanState.updateMany({where:{key:'collection-errors',scannedAt:{lt:now}},data:{scannedAt:now}});return count;
}
export function startCollectionBugReporter(db:PrismaClient,onError:()=>void){
 let pending:Promise<unknown>|undefined,stopped=false;
 const tick=()=>{if(stopped||pending)return;pending=scanCollectionBugs(db).catch(onError).finally(()=>{pending=undefined;});};
 tick();const timer=setInterval(tick,60000);timer.unref();
 return async()=>{stopped=true;clearInterval(timer);await pending;};
}
