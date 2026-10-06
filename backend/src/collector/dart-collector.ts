import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/index.js';
import { collectorLog as log } from './logger.js';
import { DartApiError, OpenDartProvider, normalizeDartFinancialRows, type DartFinancialRow, type DartPeriodType, type DartReportCode } from './dart-provider.js';
import { PrismaDartRepository, type DartBackfillTaskRecord, type DartSecurityRecord } from './dart-repository.js';
import { getSeoulClock } from './time.js';
import { dartWindowOpen, dartFailure, retryDecision } from './dart-policy.js';

export interface DartCollectorConfig {
  apiKey: string; dailyCallLimit: number; minDelayMs: number; backfillStartYear: number;
  backfillCompanyLimit: number; universeBatchSize: number; windowStartHour: number; windowEndHour: number;
  corpRefreshHours: number; enabled: boolean; restDayAllDay?: boolean; holidayDates?: string[];
}

const reports: Record<string, { period: DartPeriodType; code: DartReportCode }> = {
  '11013': { period: 'Q1', code: '11013' }, '11012': { period: 'Q2', code: '11012' },
  '11014': { period: 'Q3', code: '11014' }, '11011': { period: 'ANNUAL', code: '11011' },
};
const activeWindow = (now: Date, config: DartCollectorConfig) => dartWindowOpen(now, config.windowStartHour, config.windowEndHour, config.holidayDates, config.restDayAllDay ?? true);

export async function runDartCollectorCycle(prisma: PrismaClient, config: DartCollectorConfig, now = new Date()) {
  const repo = new PrismaDartRepository(prisma);
  const owner = randomUUID();
  if (!config.enabled) return { status: 'DISABLED' as const };
  if (!config.apiKey) return { status: 'NOT_CONFIGURED' as const };
  const dayKey = getSeoulClock(now).dateKey;
  const priorState = await repo.getState();
  const blockedCode = priorState?.lastError?.split(':', 1)[0];
  if (priorState?.lastRunAt && getSeoulClock(priorState.lastRunAt).dateKey === dayKey && ['020', 'DAILY_CALL_LIMIT'].includes(blockedCode ?? '')) return { status: 'QUOTA_BLOCKED' as const };
  const usage = await repo.getDailyUsage(now);
  if ((usage?.apiCallCount ?? 0) >= config.dailyCallLimit) return { status: 'QUOTA_BLOCKED' as const };
  if (!await repo.acquireLock(owner, 900)) return { status: 'LOCKED' as const };
  let runId: bigint | undefined;
  let apiErrors = 0;
  let outsideWindowAllowed = false;
  let stoppedCode: string | null = null;
  const dart = new OpenDartProvider({
    apiKey: config.apiKey, dailyCallLimit: config.dailyCallLimit, minDelayMs: config.minDelayMs,
    reserveCall: async (limit) => (outsideWindowAllowed || activeWindow(new Date(), config)) && repo.reserveApiCall(limit, new Date(), owner),
    isCallAllowed: () => outsideWindowAllowed || activeWindow(new Date(), config),
    onApiStatus: async (status) => repo.recordApiResult(status === '013' ? 'NO_DATA' : 'ERROR'),
  });

  try {
    const priorBusinessYear = Number(getSeoulClock(now).dateKey.slice(0, 4)) - 1;
    const state = await repo.getState();
    runId = (await repo.createRun('dart-financial-statements', 'OPEN_DART', { phase: state?.backfillCompletedAt ? 'CURRENT' : 'BACKFILL', dailyCallLimit: config.dailyCallLimit, minDelayMs: config.minDelayMs })).id;
    const priorityIds = await repo.prioritySecurityIds();
    const prioritySet = new Set(priorityIds.map(String));
    const mappingUpdatedAt = await repo.corpCodeMappingsSyncedAt();
    const refreshAfter = mappingUpdatedAt ? now.getTime() - mappingUpdatedAt.getTime() >= config.corpRefreshHours * 3_600_000 : true;
    let corpSyncSucceeded = false;
    if (refreshAfter && (activeWindow(now, config) || priorityIds.length)) {
      outsideWindowAllowed = priorityIds.length > 0;
      try {
        const mappings = await dart.fetchCorporations();
        await repo.syncCorporations(mappings, now);
        corpSyncSucceeded = true;
      } catch (error) {
        apiErrors += 1;
        log('warn', 'DART corporation map refresh failed', { code: error instanceof DartApiError ? error.code : 'UNKNOWN' });
        throw error;
      }
    }
    await repo.ensureBackfillPlan(config.backfillStartYear, priorBusinessYear, now);
    if (corpSyncSucceeded) await repo.markUnmappedTasksNotApplicable(now);
    await repo.resetInterruptedTasks();
    let processed = 0;
    let succeeded = 0;
    let noFiling = 0;
    let failures = 0;
    let skipped = 0;
    let companyChecks = 0;
    const latestState = await repo.getState();
    if (!latestState?.backfillCompletedAt) {
      // Priority stocks are eligible throughout the day, including initial history collection.
      if (activeWindow(now, config) || priorityIds.length) await repo.startUpToDailyCompanyLimit(config.backfillCompanyLimit, now, !activeWindow(now, config));
      const companies = await repo.listStartedBackfillSecurities();
      const rank = new Map(priorityIds.map((id,index)=>[String(id),index]));
      companies.sort((a,b)=>(rank.get(String(a.id)) ?? 1000000)-(rank.get(String(b.id)) ?? 1000000));
      let stop = false;
      for (const security of companies) {
        outsideWindowAllowed = prioritySet.has(String(security.id));
        if (!outsideWindowAllowed && !activeWindow(new Date(), config)) continue;
        await repo.markCompanyChecked(security.id, 'BACKFILL', new Date());
        companyChecks += 1;
        if (!security.corpCode) {
          await repo.markAllSecurityTasksNotApplicable(security.id, 'DART_CORP_CODE_NOT_MAPPED', 'No exact DART company mapping.');
          continue;
        }
        for (const task of await repo.listTasksForSecurity(security.id)) {
          if (!outsideWindowAllowed && !activeWindow(new Date(), config)) break;
          const taskNow = new Date();
          const spec = reports[task.reportCode];
          if (!spec) continue;
          let stage = 'LIST';
          await repo.updateTask(task.id, {status:'PROCESSING',attempts:task.attempts+1,lastAttemptAt:taskNow,errorCode:null,errorMessage:null});
          processed += 1;
          try {
            const reportList = await repo.cachedReports(security.corpCode, task.fiscalYear, () => dart.listPeriodicReports(security.corpCode!, task.fiscalYear));
            const report = reportList.find(item=>item.reportCode===spec.code&&!item.withdrawn);
            if (!report) {
              await repo.updateTask(task.id,{status:'NO_FILING',processedAt:new Date(),selectedReceiptNo:null,errorCode:'NO_PERIODIC_FILING',errorMessage:null,nextAttemptAt:null});
              await repo.addRunItem(runId,security,task,'NO_DATA','공시 목록에 대상 보고서가 없습니다.'); noFiling += 1; continue;
            }
            stage = 'FETCH';
            const filing = await getCfsThenOfs(dart,security.corpCode,task.fiscalYear,spec.code);
            if (filing.rows.some(row=>row.receiptNo!==report.receiptNo)) {
              await prisma.dartReportCache.deleteMany({where:{corpCode:security.corpCode,fiscalYear:task.fiscalYear}});
              throw new DartApiError('RECEIPT_MISMATCH', `Selected ${report.receiptNo}; financial response ${filing.rows[0]?.receiptNo ?? 'empty'}.`);
            }
            if (!filing.rows.length) {
              await repo.updateTask(task.id,{status:'NO_FILING',selectedReceiptNo:report.receiptNo,processedAt:new Date(),errorCode:'ROWS_NOT_PUBLISHED',errorMessage:null,nextAttemptAt:null});
              await repo.addRunItem(runId,security,task,'NO_DATA','보고서는 있으나 재무자료가 없습니다.'); noFiling += 1; continue;
            }
            stage = 'NORMALIZE';
            const values = normalizeDartFinancialRows(filing.rows);
            stage = 'SAVE';
            const saved = await repo.saveFiling({securityId:security.id,fiscalYear:task.fiscalYear,periodType:report.periodType,reportCode:spec.code,fsDivision:filing.division,receiptNo:report.receiptNo,reportName:report.reportName,receiptDate:parseDartDate(report.receiptDate),periodEndDate:endOfFiscalPeriod(task.fiscalYear,task.periodType),collectedAt:new Date(),values});
            await repo.updateTask(task.id,{status:'SUCCESS',selectedReceiptNo:report.receiptNo,processedAt:new Date(),errorCode:null,errorMessage:null,nextAttemptAt:null});
            await repo.addRunItem(runId,security,task,'SUCCESS',saved.created?undefined:'동일 접수번호 저장됨'); succeeded += 1;
          } catch(error) {
            const failure = dartFailure(error,stage,config.apiKey);
            const retry = retryDecision(failure.code,task.attempts+1,new Date());
            await repo.updateTask(task.id,{status:retry.status,errorCode:retry.code,errorMessage:`${failure.code}: ${failure.message}`,nextAttemptAt:retry.nextAttemptAt,processedAt:null,...(retry.stop ? {attempts:task.attempts} : {})});
            await repo.markSecurityError(security.id,`${failure.code}: ${failure.message}`);
            if (retry.stop) { stoppedCode = failure.code; stop = true; skipped += 1; break; }
            apiErrors += 1; failures += 1;
            await repo.addRunItem(runId,security,task,'FAILED',`${retry.code}: ${failure.code}: ${failure.message}`);
            log('warn','DART task failed',{symbol:security.symbol,year:task.fiscalYear,report:task.reportCode,stage,code:failure.code,attempt:task.attempts+1,review:retry.code==='REVIEW_REQUIRED'});
          }
        }
        await repo.completeSecurityIfDone(security.id);
        if (stop) break;
      }
      await repo.markBackfillCompleteIfReady();
    } else {
      const priority = await repo.listPhase2Securities('PRIORITY', 500);
      const priorityIds = new Set(priority.map((security) => security.id.toString()));
      const universe = activeWindow(now, config) ? (await repo.listPhase2Securities('UNIVERSE', config.universeBatchSize)).filter((security) => !priorityIds.has(security.id.toString())) : [];
      let quotaReached = false;
      for (const [phase, securities] of [['PRIORITY', priority], ['UNIVERSE', universe]] as const) {
        outsideWindowAllowed = phase === 'PRIORITY';
        for (const security of securities) {
          await repo.markCompanyChecked(security.id, phase, new Date());
          companyChecks += 1;
          try {
            if (!security.corpCode) { await repo.setPhase2Check(security.id, phase, new Date(), 'DART_CORP_CODE_NOT_MAPPED'); await repo.addPhase2RunItem(runId, security, 'NOT_APPLICABLE', 'DART corporation code is not mapped for this stock.'); continue; }
            const businessYears = [...new Set([priorBusinessYear, Number(getSeoulClock(new Date()).dateKey.slice(0, 4))])];
            let updated = false;
            for (const fiscalYear of businessYears) {
              const filings = await repo.cachedReports(security.corpCode, fiscalYear, () => dart.listPeriodicReports(security.corpCode!, fiscalYear));
              for (const report of filings) {
                if (await repo.hasStoredReceipt(report.receiptNo)) continue;
                const fetched = await getCfsThenOfs(dart, security.corpCode, fiscalYear, report.reportCode);
                if (!fetched.rows.length) continue;
                if (fetched.rows.some((row) => row.receiptNo !== report.receiptNo)) throw new DartApiError('RECEIPT_MISMATCH', 'Financial statement response did not match the selected disclosure receipt number.');
                const spec = reports[report.reportCode]!;
                await repo.saveFiling({ securityId: security.id, fiscalYear, periodType: spec.period, reportCode: spec.code,
                  fsDivision: fetched.division, receiptNo: report.receiptNo, reportName: report.reportName,
                  receiptDate: parseDartDate(report.receiptDate), periodEndDate: endOfFiscalPeriod(fiscalYear, spec.period), collectedAt: new Date(), values: normalizeDartFinancialRows(fetched.rows) });
                updated = true;
              }
            }
            await repo.setPhase2Check(security.id, phase, new Date()); processed += 1; succeeded += 1;
            await repo.addPhase2RunItem(runId, security, 'SUCCESS', updated ? '신규 정정 또는 변경 보고서를 저장했습니다.' : '공시 목록에 변경은 없고 기존 판본을 유지했습니다.');
            if (updated) log('info', 'DART new filing stored', { symbol: security.symbol });
          } catch (error) {
            failures += 1; apiErrors += 1;
            await repo.setPhase2Check(security.id, phase, new Date(), error instanceof DartApiError ? error.code : 'COLLECTOR_ERROR');
            await repo.addPhase2RunItem(runId, security, 'FAILED', error instanceof DartApiError ? `${error.code}: ${error.message}` : 'Unexpected failure; details were redacted.');
            if (error instanceof DartApiError && (error.quotaExceeded || error.code === 'SCHEDULE_WINDOW_ENDED')) { stoppedCode = error.code; quotaReached = true; break; }
          }
          if (quotaReached || (phase === 'UNIVERSE' && !activeWindow(new Date(), config))) break;
        }
        if (quotaReached) break;
      }
    }
    const usage = await repo.getDailyUsage();
    const status = failures ? (succeeded || noFiling ? 'PARTIAL' : 'FAILED') : 'SUCCESS';
    await repo.finishRun(runId, status, { success: succeeded, failed: failures, skipped }, failures ? 'Some DART requests failed; pending tasks remain resumable.' : undefined,
      { phase: latestState?.backfillCompletedAt ? 'CURRENT' : 'BACKFILL', companyChecks, apiCalls: usage?.apiCallCount ?? 0, noFiling, apiErrors });
    await repo.updateStateError(stoppedCode ? `${stoppedCode}: collection paused` : failures ? 'Some DART tasks failed; see task errors and review queue.' : null);
    await repo.cleanupRealtimeRetention();
    return { status, processed, succeeded, noFiling, failures, apiCalls: usage?.apiCallCount ?? 0 };
  } catch (error) {
    if (runId) await repo.finishRun(runId, 'FAILED', { success: 0, failed: 1, skipped: 0 }, error instanceof DartApiError ? `${error.code}: ${error.message}` : 'DART collector failed; sensitive request details were redacted.');
    await repo.updateStateError(error instanceof DartApiError ? `${error.code}: ${error.message}` : 'DART collector failed; sensitive request details were redacted.');
    if (!(error instanceof DartApiError && error.quotaExceeded)) log('error', 'DART collector cycle failed', { code: error instanceof DartApiError ? error.code : 'UNKNOWN' });
    return { status: 'FAILED' as const, errorCode: error instanceof DartApiError ? error.code : 'COLLECTOR_ERROR' };
  } finally {
    await repo.releaseLock(owner);
  }
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
export function endOfFiscalPeriod(year: number, period: DartPeriodType): Date {
  const month = period === 'Q1' ? 3 : period === 'Q2' ? 6 : period === 'Q3' ? 9 : 12;
  return new Date(Date.UTC(year, month, 0, 12));
}


