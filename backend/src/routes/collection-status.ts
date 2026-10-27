import {publicSecurityDataResult} from '@roxstock/shared/domain/security-data';
import {dartProgress,dartDisplayStatus,dartStatusWhere,type DartDisplayStatus} from '@roxstock/shared/collection/dart-task-status';
import {eligibleWhere} from '@roxstock/shared/collection/collection-policy';
import {dartTaskScope,dartTaskPeriodScope,dartWorkerStatus,temporaryDartHistory} from '@roxstock/shared/collection/dart-backfill';
import {newsCollectionState} from '@roxstock/shared/news/state';
import {runViews,effectiveResult} from './collection-run-view.js';
import {dailyScheduleHealth, skipKind} from '@roxstock/shared/domain/collection-health';
import {collectionPublicMessage,collectionPublicMetadata} from '../domain/collection-public-message.js';
import {publicDartReview} from '@roxstock/shared/domain/dart-review';
import type { FastifyInstance } from 'fastify';
import {collectionPageRoutes} from './collection-pages.js';
import { prisma } from '../auth/scoped-db.js';
import { getSeoulClock } from '@roxstock/shared/collection/time';
import { CollectionJobRepository as PrismaDartRepository } from '@roxstock/shared/collection/job-repository';
import { loadCollectorConfig } from '@roxstock/shared/collection/config';
import { dartWindowOpen, dartPriorityWindowOpen, publicHolidayDates, holidayCalendarStatus } from '@roxstock/shared/collection/dart-policy';

interface CollectionJob { id: string; name: string; jobType: string; schedule: string; hour?: number; }
const jobs: CollectionJob[] = [
  { id: 'security-master', name: '종목 마스터', jobType: 'security-master', schedule: '매일 06:00', hour: 6 },
  { id: 'realtime-prices', name: '선택 종목 실시간 주가', jobType: 'realtime-selected-prices', schedule: '평일 장 구간, 60초 간격' },
  { id: 'market-prices', name: '전체 종목 주가', jobType: 'market-prices', schedule: '거래일 20:00 · 확인된 휴장일 생략', hour: 20 },
  { id: 'account-snapshots', name: '일별 계좌 스냅샷', jobType: 'daily-account-snapshots', schedule: '매일 23:00', hour: 23 },
  {id:'stock-news',name:'종목소식',jobType:'stock-news',schedule:'최초 배포 당일 1회 · 다음 날부터 매일 06:00 KST',hour:6},
  { id: 'investor-trends', name: '투자동향', jobType: 'investor-trends', schedule: '시험 수집 KST 18·21시 · 10/16부터, 3년 보충 보류' },
  { id: 'dart-financial-statements', name: '종목 데이터 수집', jobType: 'dart-financial-statements', schedule: '우선종목 매일 16–06시 · 일반종목 평일 18–06시, 주말·공휴일 종일' },
];

type Run = Awaited<ReturnType<typeof prisma.collectorRun.findFirst>>;
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
const safeReason=collectionPublicMessage;
const localSchedule = (hour: number, now = new Date()): Date => {
  const clock = getSeoulClock(now);
  const base = Date.parse(`${clock.dateKey}T${String(hour).padStart(2, '0')}:00:00+09:00`);
  const next = base > now.getTime() ? base : base + 86_400_000;
  return new Date(next);
};

async function currentRun(jobType: string) {
  return prisma.collectorRun.findFirst({ where: { jobType, NOT: {items:{some:{message:'another execution holds the collector lock'}}} }, orderBy: [{startedAt:'desc'},{id:'desc'}] });
}
async function lastSuccessfulRun(jobType: string) {
  return prisma.collectorRun.findFirst({ where: { jobType, status: { in: ['investor-trends','stock-news'].includes(jobType)?['SUCCESS']:['SUCCESS', 'PARTIAL'] } }, orderBy: [{startedAt:'desc'},{id:'desc'}] });
}
async function priorityOverdueCount(cutoff: Date): Promise<number> {
  const ids = await new PrismaDartRepository(prisma).prioritySecurityIds();
  return prisma.dartSecurityState.count({where:{securityId:{in:ids},security:{...eligibleWhere('dart-financial-statements'),securityType:'STOCK',dartCorpMapping:{isNot:null}},OR:[{priorityCheckedAt:null},{priorityCheckedAt:{lt:cutoff}}]}});
}

async function statusFor(job: CollectionJob, run: NonNullable<Run>, now: Date, realtime?: Awaited<ReturnType<typeof prisma.realtimeWorkerState.findUnique>>) {
  if (job.id === 'security-master' && !process.env.DATA_GO_KR_SERVICE_KEY?.trim()) return 'NOT_CONFIGURED';
  if (job.id === 'realtime-prices') {
    if (!realtime) return process.env.COLLECTOR_REALTIME_ENABLED === 'false' ? 'NOT_CONFIGURED' : 'DELAYED';
    const alive = realtime.heartbeatAt && now.getTime() - realtime.heartbeatAt.getTime() <= 90_000;
    if (!alive) return 'DELAYED';
    if (realtime.workerStatus === 'DISABLED') return 'NOT_CONFIGURED';
    if (realtime.marketSession === 'OUT_OF_SESSION') return 'WAITING';
    if (!realtime.targetCount) return 'NO_DATA';
    if (realtime.saveFailureCount || realtime.publishFailureCount) return 'PARTIAL';
    if (realtime.staleCount || (realtime.lastSourcePriceAt && now.getTime() - realtime.lastSourcePriceAt.getTime() > 180_000)) return 'DELAYED';
    if (realtime.sourceFailureCount) return 'PARTIAL';
    return 'RUNNING';
  }
  if (job.id === 'dart-financial-statements') {
    if (!process.env.DART_API_KEY?.trim()) return 'NOT_CONFIGURED';
    if (run.status === 'RUNNING') return 'RUNNING';
    if (run.status === 'FAILED') return 'FAILED';
    if (run.status === 'PARTIAL') return 'PARTIAL';
    return 'WAITING';
  }
  if (run.status === 'RUNNING') return 'RUNNING';
  if (run.status === 'FAILED') return 'FAILED';
  if (run.status === 'PARTIAL') return 'PARTIAL';
  return run.id === 0n ? 'WAITING' : run.status === 'SUCCESS' ? 'OK' : run.status === 'SKIPPED' ? 'SKIPPED' : 'WAITING';
}

async function summary() {
  const now = new Date();
  const [runs, successfulRuns, realtime, price, accounts, latestSnapshot, latestDartFiling] = await Promise.all([
    Promise.all(jobs.map((job) => currentRun(job.jobType))),
    Promise.all(jobs.map((job) => lastSuccessfulRun(job.jobType))),
    prisma.realtimeWorkerState.findUnique({ where: { id: 'selected-prices' } }),
    prisma.marketPrice.findFirst({ orderBy: { priceUpdatedAt: 'desc' }, select: { priceUpdatedAt: true } }),
    prisma.account.count({ where: { isActive: true } }),
    prisma.dailyAccountSnapshot.findFirst({ orderBy: { snapshotDate: 'desc' }, select: { snapshotDate: true } }),
    prisma.dartFinancialFiling.findFirst({ where: { isWithdrawn: false }, orderBy: { collectedAt: 'desc' }, select: { collectedAt: true, receiptDate: true, periodEndDate: true } }),
  ]);
  const masterItem = successfulRuns[0] ? await prisma.collectorRunItem.findFirst({ where: { runId: successfulRuns[0].id, symbol: { startsWith: 'MASTER:' }, status: 'SUCCESS' }, select: { symbol: true } }) : null;
  const features = await Promise.all(jobs.map(async (job, index) => {
    const run = runs[index];
    const view=(await runViews(run?[run.id]:[])).get(String(run?.id));
    const duplicate=await prisma.collectorRun.findFirst({where:{jobType:job.jobType,items:{some:{message:'another execution holds the collector lock'}}},orderBy:[{startedAt:'desc'},{id:'desc'}]});
    const actualRecent=view?{...view,skipped:view.skipped+view.stale,processed:view.success+view.failed}:{target:0,processed:0,success:0,failed:0,skipped:0,excluded:0,skipReasons:{}};
    const excluded=actualRecent.excluded,skipReasons=actualRecent.skipReasons;
    const itemCounts=view?.target?[view]:[];
    const result=run&&view?effectiveResult(run,view):run?.status;
    const recorded=itemCounts.length>0||!run||run.successCount+run.failureCount+run.skippedCount+run.staleCount===0;
    const recent=recorded?{...actualRecent,excluded}:{target:null,processed:null,success:null,failed:null,skipped:null};
    const resultScope={label:recorded?'최근 실행 대상 결과':'이전 실행의 대상별 결과 미기록',runId:run?String(run.id):'0',startedAt:iso(run?.startedAt)};
    if(job.id==='stock-news'){
      const news=await newsCollectionState(prisma,now);
      return {id:job.id,name:job.name,schedule:`${news.intervalHours}시간마다 · 기준 ${news.startTime} KST`,status:news.status,lastAttemptAt:news.lastAttemptAt,lastSuccessAt:news.lastFullSuccessAt,lastCollectedAt:news.lastFinishedAt,lastDataAt:news.lastNewStoredAt,nextAt:news.nextAt,statsGeneratedAt:now.toISOString(),recent:{...recent,success:run?.successCount??0},resultScope:{...resultScope,label:'신규 소식 저장 건수 · 제공처 결과는 종목소식 수집 상태에서 확인'},skipReasons,news,lastExecution:run?{id:String(run.id),status:run.status,originalStatus:run.status,startedAt:iso(run.startedAt),finishedAt:iso(run.finishedAt)}:null,lastError:safeReason(run?.failureReason)};
    }
    if(job.id==='investor-trends'){
      const history=await prisma.collectorRun.findFirst({where:{jobType:'investor-trends-backfill',provider:'KIS_API'},orderBy:{id:'desc'}});
      const progress=history?.metadata as {from?:string;targetCount?:number;complete?:number;failed?:number;totalPages?:number;exhausted?:number;updatedAt?:string}|null;
      const backfill=history?{id:String(history.id),status:history.status,from:progress?.from??null,total:progress?.targetCount??null,complete:progress?.complete??0,failed:progress?.failed??0,pages:progress?.totalPages??0,exhausted:progress?.exhausted??0,updatedAt:progress?.updatedAt??null}:null;
      const counts=view?.investor??{rawOnly:0,quantityStored:0,waiting:0,failed:0,other:0};
      const stored=run?await prisma.investorFlowDaily.findFirst({orderBy:[{tradeDate:'desc'},{updatedAt:'desc'}],select:{tradeDate:true,updatedAt:true}}):null;
      const hours=(process.env.INVESTOR_COLLECTION_HOURS??'18,21').split(',').map(Number).filter(h=>Number.isInteger(h)&&h>=0&&h<=23);
      const next=hours.length?new Date(Math.min(...hours.map(h=>localSchedule(h,now).getTime()))):null;
      // A one-off preview run is not evidence that an automatic worker is deployed here.
      const scheduled=process.env.INVESTOR_MONITOR_SCHEDULE_ENABLED==='true';
      const scheduleState=scheduled&&hours.length?dailyScheduleHealth(now,hours,run??null,10,30):null;
      return {id:job.id,name:job.name,schedule:hours.length?`시험 KST ${hours.map(h=>String(h).padStart(2,'0')+':00').join('·')} · 10/16부터`:job.schedule,status:result==='SUCCESS'?'OK':await statusFor(job,run??emptyRun(job.jobType,now),now),
        lastAttemptAt:iso(run?.startedAt),lastSuccessAt:iso(result==='SUCCESS'?run?.finishedAt:successfulRuns[index]?.finishedAt),lastCollectedAt:iso(run?.finishedAt),lastDataAt:iso(stored?.tradeDate),statsGeneratedAt:now.toISOString(),nextAt:scheduled?iso(next):null,
        recent:{...recent,success:(recent.success??0)+counts.quantityStored,processed:(recent.processed??0)+counts.quantityStored,skipped:Math.max(0,(recent.skipped??0)-counts.quantityStored)},resultScope,skipReasons,lastExecution:run?{id:String(run.id),status:result,originalStatus:run.status,startedAt:iso(run.startedAt),finishedAt:iso(run.finishedAt)}:null,scheduleState,lastError:safeReason(run?.failureReason),
        investor:{...counts,backfill,dataScope:'현재 연결 DB의 기록',scheduleEnabled:scheduled,notice:'원격 격리 시험 DB 기록은 포함하지 않습니다. 수량 또는 금액을 검증해 저장한 대상은 수집 성공으로 집계합니다. 미제공 항목은 수집 실패와 구분합니다. 한국투자증권 금액 원본은 백만원 단위입니다. 네이버 신규 수집은 중지했습니다. 시장별 순매수 금액을 별도 범위로 저장합니다. 시장 수량 단위와 공급자 확정 여부는 미확인입니다.'}};
    }
    if (job.id === 'dart-financial-statements') {
      const run=await prisma.collectorRun.findFirst({where:{jobType:job.jobType,metadata:{path:'$.phase',equals:'SECURITY_DATA'}},orderBy:{id:'desc'}});
      const lastSuccess=await prisma.collectorRun.findFirst({where:{jobType:job.jobType,status:'SUCCESS',metadata:{path:'$.phase',equals:'SECURITY_DATA'}},orderBy:{id:'desc'}});
      const cursor=await prisma.securityDataCursor.findUnique({where:{id:1}}),m=run?.metadata as Record<string,any>|null,c=m?.phase==='SECURITY_DATA'?m.counts??{}:{};
      return {id:job.id,name:'종목 데이터 수집',schedule:'1시간 간격 · 신규·정정 공시 추적',status:run?.status==='RUNNING'?'RUNNING':process.env.SECURITY_DATA_COLLECTION_ENABLED!=='true'?'NOT_CONFIGURED':run?.status==='FAILED'?'FAILED':run?.status==='PARTIAL'?'PARTIAL':run?.status==='SUCCESS'?'OK':'WAITING',lastAttemptAt:iso(run?.startedAt),lastSuccessAt:iso(lastSuccess?.finishedAt),lastCollectedAt:iso(run?.finishedAt),lastDataAt:iso(latestDartFiling?.collectedAt),statsGeneratedAt:now.toISOString(),nextAt:iso(cursor?.nextCheckAt),recent:{...recent,target:c.target??0,success:c.success??0,failed:c.failed??0,skipped:c.skipped??0},unresolved:c.unresolved??0,resultScope,phase:'SECURITY_DATA',collectionState:'SECURITY_DATA',lastExecution:run?{id:String(run.id),status:run.status,startedAt:iso(run.startedAt),finishedAt:iso(run.finishedAt)}:null};
    }
    const config = loadCollectorConfig();
    const hours = job.id==='account-snapshots'?config.snapshotHours:job.id==='market-prices'?[config.priceCollectionHour]:job.id==='security-master'?[config.securityMasterHour]:[];
    const scheduleState=hours.length?dailyScheduleHealth(now,hours,run??null,10,job.id==='market-prices'?120:job.id==='security-master'?30:10):null;
    const state = await statusFor(job, run ? {...run,status:result as NonNullable<Run>['status']} : emptyRun(job.jobType, now), now, realtime);
    let nextAt: Date | null = job.hour === undefined ? null : localSchedule(job.hour, now);
    if (job.id === 'realtime-prices') nextAt = null;
    if (job.id === 'dart-financial-statements') nextAt = null;
    return { id: job.id, name: job.name, schedule: job.schedule, status: state,
      lastAttemptAt: iso(job.id === 'realtime-prices' ? realtime?.lastCycleStartedAt : run?.startedAt), lastSuccessAt: iso(job.id === 'realtime-prices' ? realtime?.lastPriceReceivedAt : successfulRuns[index]?.finishedAt),
      lastDataAt: job.id === 'realtime-prices' ? iso(realtime?.lastSourcePriceAt) : job.id === 'market-prices' ? iso(price?.priceUpdatedAt) : job.id === 'account-snapshots' ? iso(latestSnapshot?.snapshotDate) : job.id === 'security-master' && masterItem ? `${masterItem.symbol.slice(7, 11)}-${masterItem.symbol.slice(11, 13)}-${masterItem.symbol.slice(13, 15)}T00:00:00.000Z` : iso(successfulRuns[index]?.finishedAt), statsGeneratedAt: now.toISOString(), nextAt: scheduleState?.nextAt ?? iso(nextAt),
      recent,resultScope,skipReasons,lastExecution:run?{id:String(run.id),status:result,originalStatus:run.status,startedAt:iso(run.startedAt),finishedAt:iso(run.finishedAt)}:null,scheduleState,
      duplicateRequest:duplicate&&(!run||duplicate.startedAt>=run.startedAt)?{id:String(duplicate.id),startedAt:iso(duplicate.startedAt),reason:'잠금 충돌 · 본 실행과 별도 요청'}:null,
      lastCollectedAt:iso(run?.finishedAt),lastError: safeReason(run?.failureReason), ...(job.id === 'realtime-prices' ? { realtime: realtime && {
        workerStatus: realtime.workerStatus, heartbeatAt: iso(realtime.heartbeatAt), session: realtime.marketSession,
        cycleStartedAt: iso(realtime.lastCycleStartedAt), cycleFinishedAt: iso(realtime.lastCycleFinishedAt),
        lastPriceReceivedAt: iso(realtime.lastPriceReceivedAt), lastSourcePriceAt: iso(realtime.lastSourcePriceAt), lastSsePublishedAt: iso(realtime.lastSsePublishedAt), lastDbSavedAt: iso(realtime.lastDbSavedAt),
        sourceError: safeReason(realtime.lastSourceError), publishError: safeReason(realtime.lastPublishError), saveError: safeReason(realtime.lastSaveError),
        counts: { target: realtime.targetCount, received: realtime.receivedCount, sourceFailed: realtime.sourceFailureCount, stale: realtime.staleCount, published: realtime.publishedCount, publishFailed: realtime.publishFailureCount, saved: realtime.savedCount, saveFailed: realtime.saveFailureCount },
      } } : job.id === 'account-snapshots' ? { accountTargetCount: accounts } : {}) };
  }));
  return { data: { generatedAt: now.toISOString(), timezone: 'Asia/Seoul', features } };
}

function emptyRun(jobType: string, now: Date): NonNullable<Run> {
  return { id: 0n, jobType, provider: '', status: 'SKIPPED', startedAt: now, finishedAt: null, successCount: 0, failureCount: 0, staleCount: 0, skippedCount: 0, failureReason: null, metadata: null } as NonNullable<Run>;
}

interface DetailQuery { from?: string; to?: string; result?: string; symbol?: string; market?: string; accountId?: string; phase?: string; limit?: number; offset?: number; overview?: string; }
const dateFilter = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;

export async function collectionStatusRoutes(app: FastifyInstance) {
  await collectionPageRoutes(app);
  app.get<{Querystring:{status?:string;scope?:string;offset?:string}}>('/collection/dart/tasks',async(request,reply)=>{
    const allowed:DartDisplayStatus[]=['SUCCESS','NOT_DUE','NO_FILING','DATA_UNAVAILABLE','EXCLUDED','REVIEW_REQUIRED','PENDING','PROCESSING','FAILED'];
    const status=request.query.status as DartDisplayStatus;
    if(!allowed.includes(status)||!['all','priority'].includes(request.query.scope??'all'))return reply.code(400).send({error:{code:'INVALID_FILTER',message:'유효한 상태·범위를 선택해 주세요.'}});
    const priority=request.query.scope==='priority',priorityIds=priority?await new PrismaDartRepository(prisma).prioritySecurityIds():[];
    const ids=priority?(await prisma.security.findMany({where:{...(status==='EXCLUDED'?{}:{...eligibleWhere('dart-financial-statements'),dartCorpMapping:{isNot:null}}),id:{in:priorityIds},securityType:'STOCK'},select:{id:true}})).map(stock=>stock.id):undefined;
    const offset=Number(request.query.offset??0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return reply.code(400).send({error:{code:'INVALID_OFFSET',message:'잘못된 페이지입니다.'}});
    const now=new Date();
    const where={AND:[status==='EXCLUDED'?dartTaskPeriodScope(now):dartTaskScope(now),status==='EXCLUDED'?{OR:[dartStatusWhere('EXCLUDED'),{security:{collectionExcluded:true}},{security:{excludedFeatures:{array_contains:'dart-financial-statements'}}}]}:dartStatusWhere(status),...(ids?[{securityId:{in:ids}}]:[])]};
    const [total,rows]=await prisma.$transaction(async tx=>Promise.all([
      tx.dartBackfillTask.count({where}),tx.dartBackfillTask.findMany({where,orderBy:{id:'asc'},skip:offset,take:50,include:{security:{select:{symbol:true,name:true,collectionExcluded:true,excludedFeatures:true}}}}),
    ]),{isolationLevel:'RepeatableRead'});
    return {data:{total,nextOffset:offset+rows.length<total?offset+rows.length:null,items:rows.map(task=>({
      id:String(task.id),symbol:task.security.symbol,name:task.security.name,year:task.fiscalYear,reportCode:task.reportCode,period:task.periodType,
      status:status==='EXCLUDED'?'EXCLUDED':dartDisplayStatus(task.status,task.errorCode),needsSupplement:task.needsSupplement,reason:status==='EXCLUDED'&&task.security.collectionExcluded?'사용자 설정: 모든 수집 제외':status==='EXCLUDED'&&Array.isArray(task.security.excludedFeatures)&&task.security.excludedFeatures.includes('dart-financial-statements')?'사용자 설정: DART 수집 제외':safeReason(task.errorMessage)??task.errorCode,nextCheckAt:iso(task.nextAttemptAt),checkedAt:iso(task.lastAttemptAt),
    }))}};
  });
  app.get('/collection/status', async () => {
    const [run, price] = await Promise.all([
      currentRun('market-prices'),
      prisma.marketPrice.findFirst({ orderBy: { priceUpdatedAt: 'desc' }, select: { priceUpdatedAt: true } }),
    ]);
    const view=run?(await runViews([run.id])).get(String(run.id)):null;
    return { data: { latestRun: run ? { id: run.id.toString(), status: view?effectiveResult(run,view):run.status, originalStatus:run.status, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, successCount: run.successCount, failureCount: run.failureCount, failureReason: run.failureReason } : null, latestPriceAt: price?.priceUpdatedAt.toISOString() ?? null, manualRunAvailable: false, settingsAvailable: false } };
  });
  app.get('/collection/monitoring', async () => summary());
  app.get<{ Params: { feature: string }; Querystring: DetailQuery }>('/collection/monitoring/:feature', async (request, reply) => {
    const feature = jobs.find((job) => job.id === request.params.feature);
    if (!feature) return reply.code(404).send({ error: { code: 'COLLECTION_FEATURE_NOT_FOUND', message: 'Unknown collection feature.' } });
    const q = request.query;
    const wantedStatus = q.result?.toUpperCase();
    const toExclusive = dateFilter(q.to);
    if (toExclusive) toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const validStatus = wantedStatus && ['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED', 'RUNNING'].includes(wantedStatus) ? wantedStatus : undefined;
    const validMarket = q.market && ['KOSPI', 'KOSDAQ', 'KONEX', 'OTHER'].includes(q.market) ? q.market : undefined;
    const where = { jobType: feature.jobType, ...(dateFilter(q.from) || toExclusive ? { startedAt: { ...(dateFilter(q.from) ? { gte: dateFilter(q.from) } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } } : {}), ...(q.phase ? { metadata: { path: ['phase'], equals: q.phase } } : {}), ...(validStatus ? { status: validStatus as never } : {}) };
    const runs = q.overview === '1' ? [] : await prisma.collectorRun.findMany({ where, orderBy: [{startedAt:'desc'},{id:'desc'}], take: Math.min(100, Math.max(1, Number(q.limit ?? 30))), skip: Math.max(0, Number(q.offset ?? 0)) });
    const filteredRuns = wantedStatus ? runs.filter((run) => run.status === wantedStatus) : runs;
    const runIds = filteredRuns.map((run) => run.id);
    const items = q.overview === '1' ? [] : await prisma.collectorRunItem.findMany({ where: { runId: { in: runIds }, ...(validStatus ? { status: validStatus as never } : {}), ...(q.symbol ? { symbol: { contains: q.symbol } } : {}), ...(validMarket ? { security: { is: { marketType: validMarket as never } } } : {}), ...(q.accountId && feature.id === 'account-snapshots' ? { symbol: `account:${q.accountId}` } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, include: { security: { select: { symbol: true, name: true, marketType: true } } } });
    const now = new Date();
    const views=await runViews(runIds);
    const detail: Record<string, unknown> = { id: feature.id, name: feature.name, generatedAt: now.toISOString(), runs: filteredRuns.map((run) => ({ id: run.id.toString(), status: effectiveResult(run,views.get(String(run.id))!), originalStatus:run.status, excluded:views.get(String(run.id))?.excluded??null, startedAt: iso(run.startedAt), finishedAt: iso(run.finishedAt), success: run.successCount+(feature.id==='investor-trends'?(views.get(String(run.id))?.investor.quantityStored??0):0), failed: run.failureCount, skipped: run.skippedCount, target: run.successCount + run.failureCount + run.staleCount + run.skippedCount, failureReason: safeReason(run.failureReason), metadata: collectionPublicMetadata(run.metadata) })),
      items: items.map((item) => ({ symbol: item.symbol, security: item.security, status: feature.id==='investor-trends'&&item.status==='STALE'&&item.message?.startsWith('PARTIAL_FIELDS:')?'SUCCESS':item.status, reason: safeReason(item.message),securityData:publicSecurityDataResult(item.diagnostics),sourceReview:publicDartReview(item.diagnostics,item.message,item.symbol), occurredAt: iso(item.createdAt), observedAt: iso(item.observedAt) })), nextOffset: q.offset ? Number(q.offset) + filteredRuns.length : filteredRuns.length };
    if (feature.id === 'realtime-prices') {
      const realtime = await prisma.realtimeWorkerState.findUnique({ where: { id: 'selected-prices' } });
      const [aggregates, issues] = await Promise.all([
        prisma.realtimeCycleAggregate.findMany({ where: { minuteStartedAt: { gte: dateFilter(q.from) ?? new Date(now.getTime() - 7 * 86_400_000), ...(toExclusive ? { lt: toExclusive } : {}) } }, orderBy: { minuteStartedAt: 'desc' }, take: 500 }),
        prisma.realtimeCollectorIssue.findMany({ where: { occurredAt: { gte: dateFilter(q.from) ?? new Date(now.getTime() - 30 * 86_400_000), ...(toExclusive ? { lt: toExclusive } : {}) } }, orderBy: { occurredAt: 'desc' }, take: 100 }),
      ]);
      detail.realtime = { state: realtime, aggregates, issues: issues.map((issue) => ({ at: iso(issue.occurredAt), stage: issue.stage, symbol: issue.symbol, reason: safeReason(issue.message) })) };
    }
    if (feature.id === 'dart-financial-statements') {
      const [state, usage, priorityDelayed, universeDelayed] = await Promise.all([
        prisma.dartCollectorState.findUnique({ where: { id: 1 } }),
        prisma.dartApiDailyUsage.findMany({ where: { usageDate: { gte: dateFilter(q.from) ?? new Date(now.getTime() - 30 * 86_400_000) } }, orderBy: { usageDate: 'desc' }, take: 90 }),
        priorityOverdueCount(new Date(now.getTime() - 86_400_000)),
        prisma.dartSecurityState.count({ where: { security: { ...eligibleWhere('dart-financial-statements'),isActive: true, securityType: 'STOCK', dartCorpMapping: { isNot: null } }, OR: [{ universeCheckedAt: null }, { universeCheckedAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } }] } }),
      ]);
      const repo = new PrismaDartRepository(prisma);
      const priorityIds=await repo.prioritySecurityIds();
      const ids=(await prisma.security.findMany({where:{...eligibleWhere('dart-financial-statements'),id:{in:priorityIds},securityType:'STOCK',dartCorpMapping:{isNot:null}},select:{id:true}})).map(stock=>stock.id);
      const [taskCounts,priorityCounts,errorGroups] = await prisma.$transaction(async tx=>Promise.all([
        tx.dartBackfillTask.groupBy({by:['status','errorCode','needsSupplement'],where:dartTaskScope(now),_count:{_all:true}}),
        tx.dartBackfillTask.groupBy({by:['status','errorCode','needsSupplement'],where:{...dartTaskScope(now),securityId:{in:ids}},_count:{_all:true}}),
        tx.dartBackfillTask.groupBy({by:['errorCode'],where:{...dartTaskScope(now),status:'FAILED'},_count:{_all:true}}),
      ]),{isolationLevel:'RepeatableRead'});
      const allProgress=dartProgress(taskCounts),priorityProgress=dartProgress(priorityCounts);
      detail.dart = { holidayCalendar: holidayCalendarStatus(now), priority: {...priorityProgress,securities:ids.length}, reviewRequired:allProgress.reviewRequired, errors:errorGroups.map(row=>({code:row.errorCode??'UNKNOWN',count:row._count._all})), phase: state?.phase ?? 'NOT_INITIALIZED', backfill: { ...allProgress,completedAt: iso(state?.backfillCompletedAt) },
        current: { priorityCheckedWithinDay: priorityDelayed, universeOver90Days: universeDelayed }, usage: usage.map((row) => ({ date: iso(row.usageDate), apiCalls: row.apiCallCount, companyChecks: row.companyCheckCount, noData: row.noDataCount, failures: row.errorCount })) };
    }
    return { data: detail };
  });
}

