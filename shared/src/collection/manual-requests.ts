import {collectionIdentity,CollectionExcluded} from './collection-policy.js';
import {collectionClient} from '../lib/collection-client.js';
import {createHash,randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma,CollectorRun} from '../generated/prisma/index.js';
import {ApiError} from '../lib/api-error.js';
import {getSeoulClock} from './time.js';
import {CollectionJobRepository as PrismaDartRepository} from './job-repository.js';
import type {DartPeriodType,DartReportCode} from './dart-types.js';
export type ManualTaskState='QUEUED'|'RUNNING'|'SUCCESS'|'PARTIAL'|'FAILED'|'NO_DATA'|'UNAVAILABLE'|'SKIPPED';
export type ManualTaskResult={state:ManualTaskState;code?:string;durationMs?:number};
export const manualLimits={requestMs:20_000,taskMs:120_000,runMs:600_000,queueMs:1_800_000};

export const manualJson=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const manualPeriods=(m:ManualRefreshMetadata)=>m.period==='ALL'?['ANNUAL','Q1','Q2','Q3'] as DartPeriodType[]:[m.period];
const json=manualJson,allPeriods=manualPeriods;
export const manualReports: Record<DartPeriodType, DartReportCode> = { Q1: '11013', Q2: '11012', Q3: '11014', ANNUAL: '11011' };
export interface ManualRefreshMetadata { phase: 'MANUAL'; executionMode?: 'MANUAL_PROTOTYPE'; refreshMode?:'FULL'|'SUPPLEMENT';clientRequestId?:string;acceptedAt?:string;executionStartedAt?:string;lastProgressAt?:string;waitReason?:'CHECKING'|'AUTOMATIC'|'PREVIOUS_REQUEST'|'LOCK';waitReasonChangedAt?:string;relatedRunId?:string;financialCollectedAt?:string;supplementUpdatedAt?:string;deadlineAt?:string;lockOwner?:string;terminalCode?:string; securityId: string; symbol?:string;collectionRevision?:number; fiscalYear: number; startYear?: number; endYear?: number; period: DartPeriodType | 'ALL'; manualState: 'QUEUED' | 'PROCESSING' | 'FINISHED'; progress?: { currentYear: number; currentPeriod?: DartPeriodType; tasks?:{dart:ManualTaskResult;valuation:ManualTaskResult};stage: 'DISCLOSURE' | 'FINANCIALS' | 'VALUATION' | 'REPORT_DONE'; completed: number; total: number }; results?: Array<{ tasks?:{dart:ManualTaskResult;valuation:ManualTaskResult}; fiscalYear?: number; kind?:string; collectionState?:string; financialComplete?:boolean; disclosureChecked?:boolean; valuationStatus?: string; valuationReasons?: Record<string,string>; valuationErrors?: Record<string,string>; period: DartPeriodType; status: 'SUCCESS' | 'NO_DATA' | 'FAILED' | 'SKIPPED'; code?: string; created?: boolean }> }
export function parseManualRefresh(body: unknown): { fiscalYear: number; startYear: number; endYear: number; period: DartPeriodType | 'ALL'; refreshMode:'FULL'|'SUPPLEMENT';clientRequestId?:string } {
  const b = body as Record<string, unknown> | null;
  const startYear = b?.startYear ?? b?.fiscalYear, endYear = b?.endYear ?? b?.fiscalYear;
  const currentYear = Number(getSeoulClock(new Date()).dateKey.slice(0,4));
  if ([startYear,endYear].some(y=>typeof y !== 'number' || !Number.isInteger(y) || y < 2015 || y > currentYear) || Number(startYear)>Number(endYear))
    throw new ApiError(400,'INVALID_INPUT','시작연도·종료연도는 2015년부터 현재 연도까지이며 시작연도가 종료연도보다 늦을 수 없습니다.');
  if (typeof b?.period !== 'string' || !['Q1','Q2','Q3','ANNUAL','ALL'].includes(b.period)) throw new ApiError(400,'INVALID_INPUT','갱신범위를 확인해 주세요.');
  if(b?.refreshMode!==undefined&&!['FULL','SUPPLEMENT'].includes(String(b.refreshMode)))throw new ApiError(400,'INVALID_INPUT','갱신 방식을 확인해 주세요.');
  if(b?.clientRequestId!==undefined&&(typeof b.clientRequestId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(b.clientRequestId)))throw new ApiError(400,'INVALID_INPUT','요청 식별자를 확인해 주세요.');
  return {...(typeof b?.clientRequestId==='string'?{clientRequestId:b.clientRequestId}:{}),refreshMode:b?.refreshMode==='SUPPLEMENT'?'SUPPLEMENT':'FULL',fiscalYear:Number(startYear),startYear:Number(startYear),endYear:Number(endYear),period:b.period as DartPeriodType|'ALL'};
}
export async function enqueueManualRefresh(db: PrismaClient, securityId: bigint, input: ReturnType<typeof parseManualRefresh>) {
  db=collectionClient(db);
  let identity;try{identity=await collectionIdentity(db,securityId,input.refreshMode==='SUPPLEMENT'?'valuation':'dart-financial-statements');}catch(error){if(error instanceof CollectionExcluded)throw new ApiError(409,'COLLECTION_EXCLUDED',error.message);throw error;}
  const security = await db.security.findUnique({ where: { id: securityId }, select: { id: true, isActive: true, securityType: true } });
  if (!security?.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
  if (security.securityType !== 'STOCK') throw new ApiError(422, 'DART_NOT_APPLICABLE', '재무제표 수집 대상 주식이 아닙니다.');
  const repo = new PrismaDartRepository(db);
  const owner = randomUUID();
  const lock = 'dart-manual-enqueue';
  if (!await repo.acquireLock(owner, 30, lock)) throw new ApiError(409, 'DART_REFRESH_BUSY', '요청 접수 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    if(input.clientRequestId){const previous=await db.collectorRun.findFirst({where:{jobType:'dart-financial-statements',AND:[{metadata:{path:'$.phase',equals:'MANUAL'}},{metadata:{path:'$.securityId',equals:securityId.toString()}},{metadata:{path:'$.clientRequestId',equals:input.clientRequestId}}]},orderBy:{startedAt:'desc'}});if(previous){const accepted=previous.metadata as unknown as ManualRefreshMetadata;if((accepted.startYear??accepted.fiscalYear)!==input.startYear||(accepted.endYear??accepted.fiscalYear)!==input.endYear||accepted.period!==input.period||(accepted.refreshMode??'FULL')!==input.refreshMode)throw new ApiError(409,'REFRESH_REQUEST_MISMATCH','갱신 조건이 변경되었습니다. 다시 실행해 주세요.');return previous;}}
    let existing = await db.collectorRun.findFirst({ where: { jobType: 'dart-financial-statements', status: 'RUNNING', AND: [{ metadata: { path: '$.phase', equals: 'MANUAL' } }, { metadata: { path: '$.securityId', equals: securityId.toString() } }] }, orderBy: { startedAt: 'desc' } });
    if(existing&&(existing.metadata as unknown as ManualRefreshMetadata).executionMode==='MANUAL_PROTOTYPE'&&await expireManualRun(db,existing))existing=null;
    if (existing) throw new ApiError(409, 'DART_REFRESH_IN_PROGRESS', '이 종목의 업데이트가 이미 진행 중입니다.');
    const pending = await db.collectorRun.count({ where: { jobType: 'dart-financial-statements', status: 'RUNNING', metadata: { path: '$.phase', equals: 'MANUAL' } } });
    if (pending >= 20) throw new ApiError(429, 'DART_REFRESH_QUEUE_FULL', '업데이트 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    const metadata: ManualRefreshMetadata = { phase: 'MANUAL', executionMode:'MANUAL_PROTOTYPE', securityId: securityId.toString(),symbol:identity.symbol,collectionRevision:identity.collectionRevision, ...input, manualState: 'QUEUED',acceptedAt:new Date().toISOString(),waitReason:'CHECKING',waitReasonChangedAt:new Date().toISOString() };
    return db.collectorRun.create({ data: { jobType: 'dart-financial-statements', provider: 'OPEN_DART', status: 'RUNNING', metadata: metadata as unknown as Prisma.InputJsonValue } });
  } finally { await repo.releaseLock(owner, lock); }
}


/** Durable terminal transition, including orphaned workers; only the matching owner lease is removed. */
export async function expireManualRun(db:PrismaClient,run:CollectorRun,now=Date.now()){
 const m=run.metadata as unknown as ManualRefreshMetadata;
 if(run.status!=='RUNNING'||m.phase!=='MANUAL')return false;
 const expires=m.deadlineAt?Date.parse(m.deadlineAt):run.startedAt.getTime()+(m.manualState==='QUEUED'?manualLimits.queueMs:manualLimits.runMs+60_000);
 if(now<expires)return false;
 const results=[...(m.results??[])];for(let year=m.startYear??m.fiscalYear;year<=(m.endYear??m.fiscalYear);year++)for(const period of allPeriods(m))if(!results.some(r=>r.fiscalYear===year&&r.period===period))results.push({fiscalYear:year,period,status:'FAILED',code:'MANUAL_RUN_TIMEOUT',valuationStatus:'FAILED',tasks:{dart:{state:'FAILED',code:'DART_TIMEOUT'},valuation:{state:'FAILED',code:'VALUATION_TIMEOUT'}}});
 const terminal={...m,results,manualState:'FINISHED',terminalCode:'MANUAL_RUN_TIMEOUT',progress:m.progress?{...m.progress,tasks:{dart:{state:'FAILED',code:'DART_TIMEOUT'},valuation:{state:'FAILED',code:'VALUATION_TIMEOUT'}}}:undefined};
 const changed=await db.collectorRun.updateMany({where:{id:run.id,status:'RUNNING',metadata:{equals:run.metadata as Prisma.InputJsonValue}},data:{status:results.some(r=>r.status==='SUCCESS'||r.valuationStatus==='SUCCESS')?'PARTIAL':'FAILED',finishedAt:new Date(now),failureReason:'MANUAL_RUN_TIMEOUT',metadata:json(terminal)}});
 // Keep an active lease until its owner exits or its TTL expires. Expiry never unlocks running I/O.
 if(changed.count)console.info(JSON.stringify({event:'manual_refresh_expired',requestId:String(run.id),at:new Date(now).toISOString(),deadlineAt:new Date(expires).toISOString(),ownerId:m.lockOwner?leaseOwnerId(m.lockOwner):null}));
 return Boolean(changed.count);
}

/** Independent of status polling. Terminal CAS preserves completed results. */
export async function sweepManualRequests(db:PrismaClient){
 const runs=await db.collectorRun.findMany({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.phase',equals:'MANUAL'}},orderBy:[{startedAt:'asc'},{id:'asc'}]});
 for(const run of runs){if(!await expireManualRun(db,run)&&(run.metadata as unknown as ManualRefreshMetadata).manualState==='QUEUED')await manualTrace(db,run);}
}
export async function manualWait(db:PrismaClient,run:CollectorRun,reason:NonNullable<ManualRefreshMetadata['waitReason']>,relatedRunId?:string){
 const m=run.metadata as unknown as ManualRefreshMetadata;
 if(m.manualState!=='QUEUED'||m.waitReason===reason&&m.relatedRunId===relatedRunId)return;
 await db.collectorRun.updateMany({where:{id:run.id,status:'RUNNING',metadata:{path:'$.manualState',equals:'QUEUED'}},data:{metadata:manualJson({...m,waitReason:reason,waitReasonChangedAt:new Date().toISOString(),relatedRunId})}});
}

export const leaseOwnerId=(owner:string)=>createHash('sha256').update(owner).digest('hex').slice(0,16);
/** Public trace deliberately excludes raw lease credentials. RUNNING alone is not evidence. */
export async function manualTrace(db:PrismaClient,run:CollectorRun){
 const m=run.metadata as unknown as ManualRefreshMetadata;
 let waitReason:ManualRefreshMetadata['waitReason']=m.manualState==='QUEUED'?'CHECKING':undefined;
 let relatedRunId:string|undefined;
 const lease=m.manualState==='QUEUED'?await db.collectorLock.findUnique({where:{jobName:'dart-financial-statements'}}):null;
 const active=lease&&lease.lockedUntil.getTime()>Date.now()&&Date.now()-lease.updatedAt.getTime()<120_000;
 if(m.manualState==='QUEUED'&&active){
   const ownerId=leaseOwnerId(lease.ownerToken);
   const ownerRun=await db.collectorRun.findFirst({where:{jobType:{in:['dart-financial-statements','VALUATION_SUPPLEMENT']},status:'RUNNING',OR:[{metadata:{path:'$.ownerId',equals:ownerId}},{metadata:{path:'$.lockOwner',equals:lease.ownerToken}}]},orderBy:{startedAt:'desc'}});
   relatedRunId=ownerRun?.id.toString();
   waitReason=ownerRun?( (ownerRun.metadata as {phase?:string}).phase==='MANUAL'?'PREVIOUS_REQUEST':'AUTOMATIC'):'LOCK';
 }
 if(m.manualState==='QUEUED')await manualWait(db,run,waitReason??'CHECKING',relatedRunId);
 return {acceptedAt:m.acceptedAt??run.startedAt.toISOString(),executionStartedAt:m.executionStartedAt??null,lastProgressAt:m.lastProgressAt??null,
   waitReason:waitReason??null,waitReasonChangedAt:m.waitReason===waitReason?m.waitReasonChangedAt??null:new Date().toISOString(),relatedRunId:relatedRunId??m.relatedRunId??null,
   financialCollectedAt:m.financialCollectedAt??null,supplementUpdatedAt:m.supplementUpdatedAt??null};
}
