import {createHash} from 'node:crypto';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import type {MetricValues} from '@roxstock/shared/domain/period-valuation';
export type BugEvent={sourceKey:string;feature:string;code:string;severity:'ERROR'|'WARNING';summary:string;observedAt:Date;securityId?:bigint;symbol?:string;fiscalYear?:number;periodType?:string;runId?:bigint;metric?:string};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export const safeBugCode=(v:unknown,fallback='COLLECTION_FAILED')=>typeof v==='string'&&/^(?:(?:KIS|DART|HISTORICAL|SHARES|ACCOUNTS|VALUATION|SUPPLEMENT|MANUAL|HTTP|TASK|DAILY|SOURCE|COLLECTION|SCHEDULE|API|KRX|NAVER|PRICE|PERIOD)_[A-Z0-9_]{1,60}|[0-9]{3})$/.test(v)?v:fallback;
const featureOf=(job:string)=>job.startsWith('investor')?'investor-trends':job==='VALUATION_SUPPLEMENT'?'dart-financial-statements':job==='daily-account-snapshots'?'account-snapshots':job==='realtime-selected-prices'?'realtime-prices':job;
/** Only allowlisted diagnostic codes and typed context are stored; never provider bodies or error text. */
export function periodBugEvents(row:{securityId:bigint;fiscalYear:number;periodType:string;status:string;values:unknown;reasons:unknown;supplemental:unknown;attempts:number;updatedAt:Date;collectionSymbol?:string|null}):BugEvent[]{
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
  if(!inserted.count)return false;
  const report=await tx.collectionBugReport.upsert({where:{fingerprint},create:{fingerprint,feature:event.feature,code:event.code,severity:event.severity,summary:event.summary,occurrences:1,firstSeenAt:event.observedAt,lastSeenAt:event.observedAt},update:{occurrences:{increment:1}}});
  await tx.collectionBugReport.updateMany({where:{id:report.id,firstSeenAt:{gt:event.observedAt}},data:{firstSeenAt:event.observedAt}});
  await tx.collectionBugReport.updateMany({where:{id:report.id,lastSeenAt:{lt:event.observedAt}},data:{lastSeenAt:event.observedAt}});
  if(event.severity==='ERROR'&&report.severity!=='ERROR')await tx.collectionBugReport.update({where:{id:report.id},data:{severity:'ERROR'}});
  if(report.state==='RESOLVED'&&(!report.resolvedAt||event.observedAt>report.resolvedAt))await tx.collectionBugReport.update({where:{id:report.id},data:{state:'OPEN',resolvedAt:null}});
  await tx.collectionBugOccurrence.update({where:{eventKey},data:{reportId:report.id}});return true;
 });
}
/** Replay a small overlap; durable occurrence keys prevent duplicate counts and deleted reports resurfacing. */
export async function scanCollectionBugs(db:PrismaClient,now=new Date()){
 const state=await db.collectionBugScanState.upsert({where:{key:'collection-errors'},create:{key:'collection-errors',scannedAt:now},update:{}});
 const since=new Date(state.scannedAt.getTime()-300000);let count=0;
 let after:{updatedAt:Date;securityId:bigint;fiscalYear:number;periodType:string}|undefined;
 for(;;){
  const seek=after?{OR:[{updatedAt:{gt:after.updatedAt}},{updatedAt:after.updatedAt,securityId:{gt:after.securityId}},{updatedAt:after.updatedAt,securityId:after.securityId,fiscalYear:{gt:after.fiscalYear}},{updatedAt:after.updatedAt,securityId:after.securityId,fiscalYear:after.fiscalYear,periodType:{gt:after.periodType}}]}:{};
  const rows=await db.periodValuation.findMany({where:{AND:[{updatedAt:{gte:since,lte:now},status:{not:'SUCCESS'}},seek]},orderBy:[{updatedAt:'asc'},{securityId:'asc'},{fiscalYear:'asc'},{periodType:'asc'}],take:100});
  for(const row of rows)for(const event of periodBugEvents(row))if(await saveBugEvent(db,event))count++;
  if(rows.length<100)break;after=rows.at(-1)!;
 }
 for(let skip=0;;skip+=100){
  const items=await db.collectorRunItem.findMany({where:{OR:[{createdAt:{gte:since,lte:now}},{observedAt:{gte:since,lte:now}}],status:'FAILED'},include:{run:{select:{jobType:true,provider:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}],skip,take:100});
  for(const item of items){const diagnostic=object(item.diagnostics),observedAt=item.observedAt&&item.observedAt>item.createdAt?item.observedAt:item.createdAt;const code=safeBugCode(diagnostic.code??diagnostic.errorCode??item.message);if(await saveBugEvent(db,{sourceKey:'item:'+item.id+':'+observedAt.toISOString(),feature:featureOf(item.run.jobType),code,severity:'ERROR',summary:'수집 항목 처리 실패 · 원천 응답 또는 저장 처리 확인 필요',observedAt,securityId:item.securityId??undefined,symbol:item.symbol,runId:item.runId}))count++;}
  if(items.length<100)break;
 }
 for(let skip=0;;skip+=100){
  const runs=await db.collectorRun.findMany({where:{finishedAt:{gte:since,lte:now},status:{in:['FAILED','PARTIAL']}},include:{items:{where:{status:'FAILED'},take:1,select:{id:true}}},orderBy:[{finishedAt:'asc'},{id:'asc'}],skip,take:100});
  for(const run of runs){const m=object(run.metadata);const results=Array.isArray(m.results)?m.results:[];let emitted=false;
   for(const result of results)for(const source of ['dart','valuation']){const task=object(object(result.tasks)[source]);if(task.state!=='FAILED')continue;emitted=true;const code=safeBugCode(task.code);if(await saveBugEvent(db,{sourceKey:'run:'+run.id+':'+result.fiscalYear+':'+result.period+':'+source,feature:featureOf(run.jobType),code,severity:'ERROR',summary:(source==='dart'?'재무제표':'가치지표')+' 수집 요청 실패',observedAt:run.finishedAt!,securityId:/^\d+$/.test(String(m.securityId))?BigInt(m.securityId):undefined,symbol:m.symbol,fiscalYear:Number.isInteger(result.fiscalYear)?result.fiscalYear:undefined,periodType:['ANNUAL','Q1','Q2','Q3'].includes(result.period)?result.period:undefined,runId:run.id}))count++;}
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
