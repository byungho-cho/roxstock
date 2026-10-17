import {leaseOwnerId} from '@roxstock/shared/collection/manual-requests';
import {withFinancialLease,withoutFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {CollectionExcluded,withCollection} from '@roxstock/shared/collection/collection-policy';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {validateDartFiling,requireDartReportPeriod} from './dart-filing-validation.js';
import {dartDiagnostic, recordDartFailure} from '@roxstock/shared/collection/dart-diagnostics';
import {collectionPasses} from './dart-order.js';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@roxstock/shared/prisma';
import { collectorLog as log } from '@roxstock/shared/collection/logger';
import { DartApiError, OpenDartProvider, normalizeDartFinancialRows, type DartFinancialRow, type DartPeriodType, type DartReportCode } from './dart-provider.js';
import { PrismaDartRepository, type DartBackfillTaskRecord, type DartSecurityRecord } from './dart-repository.js';
import { getSeoulClock } from '@roxstock/shared/collection/time';
import { dartWindowOpen, dartPriorityWindowOpen, dartFailure, retryDecision } from '@roxstock/shared/collection/dart-policy';

export interface DartCollectorConfig {
  apiKey: string; dailyCallLimit: number; minDelayMs: number; backfillStartYear: number;
  backfillCompanyLimit: number; universeBatchSize: number; windowStartHour: number; windowEndHour: number;
  priorityWindowStartHour?: number; priorityWindowEndHour?: number;
  corpRefreshHours: number; enabled: boolean; restDayAllDay?: boolean; holidayDates?: string[];
}

const reports: Record<string, { period: DartPeriodType; code: DartReportCode }> = {
  '11013': { period: 'Q1', code: '11013' }, '11012': { period: 'Q2', code: '11012' },
  '11014': { period: 'Q3', code: '11014' }, '11011': { period: 'ANNUAL', code: '11011' },
};
const activeWindow = (now: Date, config: DartCollectorConfig) => dartWindowOpen(now, config.windowStartHour, config.windowEndHour, config.holidayDates, config.restDayAllDay ?? true);

const priorityWindow = (now: Date, config: DartCollectorConfig) => dartPriorityWindowOpen(now, config.priorityWindowStartHour, config.priorityWindowEndHour);

export async function runDartCollectorCycle(prisma: PrismaClient, config: DartCollectorConfig, now = new Date(), serviceManual?:()=>Promise<boolean>) {
  prisma=collectionClient(prisma);
  const repo = new PrismaDartRepository(prisma);
  const owner = randomUUID();
  if (!config.enabled) return { status: 'DISABLED' as const };
  if (!config.apiKey) return { status: 'NOT_CONFIGURED' as const };
  if (!activeWindow(now, config) && !priorityWindow(now, config)) return { status: 'OUTSIDE_WINDOW' as const };
  const dayKey = getSeoulClock(now).dateKey;
  const priorState = await repo.getState();
  const blockedCode = priorState?.lastError?.split(':', 1)[0];
  if (priorState?.lastRunAt && getSeoulClock(priorState.lastRunAt).dateKey === dayKey && ['020', 'DAILY_CALL_LIMIT'].includes(blockedCode ?? '')) return { status: 'QUOTA_BLOCKED' as const };
  const usage = await repo.getDailyUsage(now);
  if ((usage?.apiCallCount ?? 0) >= config.dailyCallLimit) return { status: 'QUOTA_BLOCKED' as const };
  const turn=await prisma.valuationSupplementScan?.findUnique({where:{id:1},select:{automaticTurnUntil:true,heartbeatAt:true}});
  if(turn?.automaticTurnUntil&&turn.automaticTurnUntil>now&&turn.heartbeatAt&&now.getTime()-turn.heartbeatAt.getTime()<90_000)return {status:'YIELDED' as const};
  if (!await repo.acquireLock(owner, 900)) return { status: 'LOCKED' as const };
  let runId: bigint | undefined;
  let stage='PLAN';
  // Invoked only outside collection transactions: the loop and durable task cursor remain intact.
  const checkpoint=async()=>{
    if(!serviceManual)return;
    const pending=await prisma.collectorRun.findFirst({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.manualState',equals:'QUEUED'}},orderBy:[{startedAt:'asc'},{id:'asc'}]});
    if(!pending)return;
    await repo.releaseLock(owner);
    try{await new Promise(resolve=>setTimeout(resolve,config.minDelayMs));await withoutFinancialLease(serviceManual);}finally{
      await new Promise(resolve=>setTimeout(resolve,config.minDelayMs));
      if(!await repo.acquireLock(owner,900))throw new DartApiError('LOCK_LOST','Automatic collection paused: execution lease changed.');
    }
  };

  let succeeded=0,failures=0,skipped=0;

  let apiErrors = 0;
  let priorityLane = false;
  const callAllowed = () => priorityLane ? priorityWindow(new Date(), config) : activeWindow(new Date(), config);
  let stoppedCode: string | null = null;
  const dart = new OpenDartProvider({
    apiKey: config.apiKey, dailyCallLimit: config.dailyCallLimit, minDelayMs: config.minDelayMs,
    reserveCall: async (limit) => {
      if (!callAllowed()) throw new DartApiError('SCHEDULE_WINDOW_ENDED', 'Collection window ended.');
      return repo.reserveApiCall(limit, new Date(), owner);
    },
    isCallAllowed: callAllowed,
    onApiStatus: async (status) => repo.recordApiResult(status === '013' ? 'NO_DATA' : 'ERROR'),
  });

  return withFinancialLease(owner,async()=>{try {
    const priorBusinessYear = Number(getSeoulClock(now).dateKey.slice(0, 4)) - 1;
    const state = await repo.getState();
    runId = (await repo.createRun('dart-financial-statements', 'OPEN_DART', { ownerId:leaseOwnerId(owner), phase: state?.backfillCompletedAt ? 'CURRENT' : 'BACKFILL', dailyCallLimit: config.dailyCallLimit, minDelayMs: config.minDelayMs })).id;
    const priorityIds = await repo.prioritySecurityIds();
    const prioritySet = new Set(priorityIds.map(String));
    const mappingUpdatedAt = await repo.corpCodeMappingsSyncedAt();
    const refreshAfter = mappingUpdatedAt ? now.getTime() - mappingUpdatedAt.getTime() >= config.corpRefreshHours * 3_600_000 : true;
    let corpSyncSucceeded = false;
    if (refreshAfter && (activeWindow(now, config) || (priorityWindow(now, config) && priorityIds.length))) {
      priorityLane = !activeWindow(now, config);
      try {
        stage='CORP_FETCH';
    const mappings = await dart.fetchCorporations();
        stage='CORP_SYNC';
    await repo.syncCorporations(mappings, now);
        corpSyncSucceeded = true;
      } catch (error) {
        apiErrors += 1;
        log('warn', 'DART corporation map refresh failed', { code: error instanceof DartApiError ? error.code : 'UNKNOWN' });
        throw error;
      }
    }
    stage='PLAN';
    await repo.ensureBackfillPlan(config.backfillStartYear, priorBusinessYear + 1, now);
    stage='MARK_UNMAPPED';
    if (corpSyncSucceeded) await repo.markUnmappedTasksNotApplicable(now);
    stage='TASK_QUERY';
    await repo.resetInterruptedTasks();
    let processed = 0;

    let noFiling = 0;


    let companyChecks = 0;
    const latestState = await repo.getState();
    if (!latestState?.backfillCompletedAt) {
      // Both initial history and current filings obey their lane-specific window.
      if (activeWindow(now, config) || (priorityWindow(now, config) && priorityIds.length)) await repo.startUpToDailyCompanyLimit(config.backfillCompanyLimit, now, !activeWindow(now, config));
      stage='TASK_QUERY';
    const companies = await repo.listStartedBackfillSecurities();
      const rank = new Map(priorityIds.map((id,index)=>[String(id),index]));
      companies.sort((a,b)=>(rank.get(String(a.id)) ?? 1000000)-(rank.get(String(b.id)) ?? 1000000));
      let stop = false;
      const priorityCompanies=await repo.listPhase2Securities('PRIORITY',100000,now,true);
      const schedule=collectionPasses(priorityCompanies,companies,priorBusinessYear+1);
      for (const pass of schedule) {
      for (const security of pass.items) {
        priorityLane = prioritySet.has(String(security.id));
        if (!callAllowed()) continue;
        await repo.markCompanyChecked(security.id, 'BACKFILL', new Date());
        companyChecks += 1;
        if (!security.corpCode) {
          stage='MARK_UNMAPPED';
    await repo.markAllSecurityTasksNotApplicable(security.id, 'DART_CORP_CODE_NOT_MAPPED', 'No exact DART company mapping.');
          continue;
        }
        for (const task of (await repo.listTasksForSecurity(security.id)).filter(t=>t.fiscalYear===pass.year)) {
          await checkpoint();
          if (!callAllowed()) break;
          const taskNow = new Date();
          const spec = reports[task.reportCode];
          if (!spec) continue;
          stage = 'LIST';

          try {
           await withCollection(prisma,security.id,'dart-financial-statements',async()=>{
            await repo.updateTask(task.id,{status:'PROCESSING',attempts:task.attempts+1,lastAttemptAt:taskNow,errorCode:null,errorMessage:null});processed++;
            const reportList = await repo.cachedReports(security.corpCode!, task.fiscalYear, () => dart.listPeriodicReports(security.corpCode!, task.fiscalYear));
            const report = reportList.find(item=>item.reportCode===spec.code&&!item.withdrawn);
            if (!report) {
              await repo.updateTask(task.id,{status:'NO_FILING',processedAt:new Date(),selectedReceiptNo:null,errorCode:'NO_PERIODIC_FILING',errorMessage:null,nextAttemptAt:null});
              await repo.addRunItem(runId!,security,task,'NO_DATA','공시 목록에 대상 보고서가 없습니다.'); noFiling += 1; return;
            }
            requireDartReportPeriod(report,security.corpCode!,task.fiscalYear);
            stage = 'FETCH';
            const filing = await getCfsThenOfs(dart,security.corpCode!,task.fiscalYear,spec.code);
            if (!filing.rows.length) {
              await repo.updateTask(task.id,{status:'NO_FILING',selectedReceiptNo:report.receiptNo,processedAt:new Date(),errorCode:'ROWS_NOT_PUBLISHED',errorMessage:null,nextAttemptAt:null});
              await repo.addRunItem(runId!,security,task,'NO_DATA','보고서는 있으나 재무자료가 없습니다.'); noFiling += 1; return;
            }
            stage = 'VERIFY_SOURCE';
            const source = validateDartFiling({corpCode:security.corpCode!,taskFiscalYear:task.fiscalYear,report,rows:filing.rows,fsDivision:filing.division});
            stage = 'NORMALIZE';
            const values = normalizeDartFinancialRows(filing.rows);
            stage = 'SAVE';
            const saved = await repo.saveFiling({securityId:security.id,fiscalYear:task.fiscalYear,periodType:report.periodType,reportCode:spec.code,fsDivision:filing.division,...source,collectedAt:new Date(),values});
            await repo.updateTask(task.id,{status:'SUCCESS',selectedReceiptNo:report.receiptNo,diagnostics:source.sourceValidation as unknown as import('@roxstock/shared/prisma').Prisma.InputJsonValue,processedAt:new Date(),errorCode:null,errorMessage:null,nextAttemptAt:null});
            await repo.addRunItem(runId!,security,task,'SUCCESS',saved.created?undefined:'동일 접수번호 저장됨'); succeeded += 1;
           },security);
          } catch(error) {
            if(error instanceof CollectionExcluded){skipped++;await repo.addRunItem(runId!,security,task,'SKIPPED',error.message);continue;}
            log('warn','DART task primary failure',{runId,...dartDiagnostic(error,stage)});
            const failure = dartFailure(error,stage,config.apiKey);
            const retry = retryDecision(failure.code,task.attempts+1,new Date());
            try{await withCollection(prisma,security.id,'dart-financial-statements',async()=>{
            await repo.updateTask(task.id,{status:retry.status,errorCode:retry.code,diagnostics:{...dartDiagnostic(error,stage).context,originalCode:failure.code,stage,attempt:task.attempts+1,runId:String(runId),symbol:security.symbol,corpCode:security.corpCode,taskFiscalYear:task.fiscalYear,apiFiscalYear:task.fiscalYear,reportCode:task.reportCode},errorMessage:`${failure.code}: ${failure.message}`,nextAttemptAt:retry.nextAttemptAt,processedAt:null,...(retry.stop ? {attempts:task.attempts} : {})});
            await repo.markSecurityError(security.id,`${failure.code}: ${failure.message}`);
            },security);}catch(changed){if(changed instanceof CollectionExcluded){skipped++;await repo.addRunItem(runId!,security,task,'SKIPPED',changed.message);continue;}throw changed;}
            if (retry.stop) { stoppedCode = failure.code; stop = true; skipped += 1; break; }
            apiErrors += 1; failures += 1;
            await repo.addRunItem(runId!,security,task,'FAILED',`${retry.code}: ${failure.code}: ${failure.message}`,{...dartDiagnostic(error,stage).context,originalCode:failure.code,stage,attempt:task.attempts+1,runId:String(runId),symbol:security.symbol});
            log('warn','DART task failed',{runId,...dartDiagnostic(error,stage),symbol:security.symbol,year:task.fiscalYear,report:task.reportCode,stage,code:failure.code,attempt:task.attempts+1,review:retry.code==='REVIEW_REQUIRED'});
          }
        }
        await repo.completeSecurityIfDone(security.id);
        if (stop) break;
      }
      if(stop)break;
      }
      await repo.markBackfillCompleteIfReady();
    } else {
      stage='TASK_QUERY';
    const priority = await repo.listPhase2Securities('PRIORITY', 500);
      // Exclude every priority stock from the general lane, even when its window is closed.
      const universe = activeWindow(now, config) ? (await repo.listPhase2Securities('UNIVERSE', config.universeBatchSize)).filter((security) => !prioritySet.has(security.id.toString())) : [];
      let quotaReached = false;
      for (const [phase, securities] of [['PRIORITY', priority], ['UNIVERSE', universe]] as const) {
        priorityLane = phase === 'PRIORITY';
        if (!callAllowed()) continue;
        for (let fiscalYear=priorBusinessYear+1;fiscalYear>=2015;fiscalYear--) {
        for (const security of securities) {
          if (!callAllowed()) break;
          await checkpoint();
          await repo.markCompanyChecked(security.id, phase, new Date());
          companyChecks += 1;
          try {
           await withCollection(prisma,security.id,'dart-financial-statements',async()=>{
            if (!security.corpCode) { await repo.setPhase2Check(security.id, phase, new Date(), 'DART_CORP_CODE_NOT_MAPPED'); await repo.addPhase2RunItem(runId!, security, 'NOT_APPLICABLE', 'DART corporation code is not mapped for this stock.'); return; }
            const businessYears = [fiscalYear];
            let updated = false;
            for (const fiscalYear of businessYears) {
              stage='LIST'; const filings = await repo.cachedReports(security.corpCode!, fiscalYear, () => dart.listPeriodicReports(security.corpCode!, fiscalYear));
              for (const report of filings) {
                if(fiscalYear<2020&&report.periodType!=='ANNUAL')continue;
                if (!callAllowed()) throw new DartApiError('SCHEDULE_WINDOW_ENDED', 'Collection window ended.');
                requireDartReportPeriod(report,security.corpCode!,fiscalYear);
                if (await repo.hasStoredReceipt(report.receiptNo)) continue;
                stage='FETCH'; const fetched = await getCfsThenOfs(dart, security.corpCode, fiscalYear, report.reportCode);
                if (!fetched.rows.length) continue;
                stage='VERIFY_SOURCE'; const source=validateDartFiling({corpCode:security.corpCode!,taskFiscalYear:fiscalYear,report,rows:fetched.rows,fsDivision:fetched.division});
                const spec = reports[report.reportCode]!;
                stage='NORMALIZE'; const values=normalizeDartFinancialRows(fetched.rows);
                stage='SAVE'; await repo.saveFiling({ securityId: security.id, fiscalYear, periodType: spec.period, reportCode: spec.code,
                  fsDivision: fetched.division, ...source, collectedAt: new Date(), values });
                updated = true;
              }
            }
            await repo.setPhase2Check(security.id, phase, new Date()); processed += 1; succeeded += 1;
            await repo.addPhase2RunItem(runId!, security, 'SUCCESS', updated ? '신규 정정 또는 변경 보고서를 저장했습니다.' : '공시 목록에 변경은 없고 기존 판본을 유지했습니다.');
            if (updated) log('info', 'DART new filing stored', { symbol: security.symbol });
           },security);
          } catch (error) {
            if(error instanceof CollectionExcluded){skipped++;await repo.addPhase2RunItem(runId!,security,'SKIPPED',error.message);continue;}
            if (error instanceof DartApiError && error.code === 'SCHEDULE_WINDOW_ENDED') {
              stoppedCode = error.code; quotaReached = true; skipped += 1; break;
            }
            const diagnostic=dartDiagnostic(error,stage);log('warn','DART phase2 failure',{runId,...diagnostic});
            try{await withCollection(prisma,security.id,'dart-financial-statements',()=>repo.setPhase2Check(security.id,phase,new Date(),dartDiagnostic(error,stage).code),security);}catch(changed){if(changed instanceof CollectionExcluded){skipped++;await repo.addPhase2RunItem(runId!,security,'SKIPPED',changed.message);continue;}throw changed;}
            failures += 1; apiErrors += 1;
            await repo.addPhase2RunItem(runId!, security, 'FAILED', `${diagnostic.code}: ${diagnostic.message}`,{...diagnostic.context,originalCode:diagnostic.code,stage,runId:String(runId),symbol:security.symbol});
            if (error instanceof DartApiError && (error.quotaExceeded || error.code === 'SCHEDULE_WINDOW_ENDED')) { stoppedCode = error.code; quotaReached = true; break; }
          }
          if (quotaReached || !callAllowed()) break;
        }
        if (quotaReached || !callAllowed()) break;
        }
        if (quotaReached) break;
      }
    }
    const usage = await repo.getDailyUsage();
    const status = failures ? (succeeded || noFiling ? 'PARTIAL' : 'FAILED') : 'SUCCESS';
    stage='RUN_FINISH';
    await repo.finishRun(runId, status, { success: succeeded, failed: failures, skipped }, failures ? 'Some DART requests failed; pending tasks remain resumable.' : undefined,
      { phase: latestState?.backfillCompletedAt ? 'CURRENT' : 'BACKFILL', companyChecks, apiCalls: usage?.apiCallCount ?? 0, noFiling, apiErrors });
    stage='STATE_UPDATE';
    await repo.updateStateError(stoppedCode ? `${stoppedCode}: collection paused` : failures ? 'Some DART tasks failed; see task errors and review queue.' : null);
    await repo.cleanupRealtimeRetention();
    return { status, processed, succeeded, noFiling, failures, apiCalls: usage?.apiCallCount ?? 0 };
  } catch (error) {
    const failure=await recordDartFailure(error,stage,runId,[
      ...(runId?[{stage:'RUN_FINISH',write:(reason:string)=>repo.finishRun(runId!,'FAILED',{success:succeeded,failed:failures+1,skipped},reason)}]:[]),
      {stage:'STATE_UPDATE',write:(reason:string)=>repo.updateStateError(reason)},
    ]);
    return {status:'FAILED' as const,errorCode:failure.code};
  } finally {
    try { await repo.releaseLock(owner); } catch(error) { log('error','DART lock release failed',{runId,...dartDiagnostic(error,'LOCK_RELEASE')}); }
  }
  });
}

export async function getCfsThenOfs(provider: OpenDartProvider, corpCode: string, year: number, reportCode: DartReportCode) {
  const cfs = await provider.fetchFinancials(corpCode, year, reportCode, 'CFS');
  if (cfs.length) return { division: 'CFS' as const, rows: cfs };
  const ofs = await provider.fetchFinancials(corpCode, year, reportCode, 'OFS');
  return { division: 'OFS' as const, rows: ofs };
}

export function parseDartDate(value: string): Date {
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
}
