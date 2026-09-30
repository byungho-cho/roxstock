import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/index.js';
import { collectorLog as log } from './logger.js';
import { DartApiError, OpenDartProvider, normalizeDartFinancialRows, type DartFinancialRow, type DartPeriodType, type DartReportCode } from './dart-provider.js';
import { PrismaDartRepository, type DartBackfillTaskRecord, type DartSecurityRecord } from './dart-repository.js';
import { getSeoulClock, isHourInOvernightWindow } from './time.js';

export interface DartCollectorConfig {
  apiKey: string; dailyCallLimit: number; minDelayMs: number; backfillStartYear: number;
  backfillCompanyLimit: number; universeBatchSize: number; windowStartHour: number; windowEndHour: number;
  corpRefreshHours: number; enabled: boolean;
}

const reports: Record<string, { period: DartPeriodType; code: DartReportCode }> = {
  '11013': { period: 'Q1', code: '11013' }, '11012': { period: 'Q2', code: '11012' },
  '11014': { period: 'Q3', code: '11014' }, '11011': { period: 'ANNUAL', code: '11011' },
};
const activeWindow = (now: Date, config: DartCollectorConfig) => isHourInOvernightWindow(getSeoulClock(now).hour, config.windowStartHour, config.windowEndHour);

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
    const mappingUpdatedAt = await repo.corpCodeMappingsSyncedAt();
    const refreshAfter = mappingUpdatedAt ? now.getTime() - mappingUpdatedAt.getTime() >= config.corpRefreshHours * 3_600_000 : true;
    let corpSyncSucceeded = false;
    const backfillInProgress = !state?.backfillCompletedAt;
    if (refreshAfter && (!backfillInProgress || activeWindow(now, config))) {
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
    const refreshedState = await repo.getState();
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
      if (activeWindow(now, config)) await repo.startUpToDailyCompanyLimit(config.backfillCompanyLimit, now);
      const companies = await repo.listStartedBackfillSecurities();
      for (const security of companies) {
        if (!activeWindow(new Date(), config)) break;
        await repo.markCompanyChecked(security.id, 'BACKFILL', new Date());
        companyChecks += 1;
        try {
          if (!security.corpCode) {
            await repo.markSecurityError(security.id, 'DART_CORP_CODE_NOT_MAPPED');
            await repo.markAllSecurityTasksNotApplicable(security.id, 'DART_CORP_CODE_NOT_MAPPED', 'No exact listed stock code mapping was found in the DART corporation-code list.');
            continue;
          }
          let reportListCache = new Map<number, Awaited<ReturnType<typeof dart.listPeriodicReports>>>();
          for (const task of await repo.listTasksForSecurity(security.id)) {
            if (!activeWindow(new Date(), config)) break;
            const taskNow = new Date();
            const taskRecord: DartBackfillTaskRecord = task;
            const reportSpec = reports[taskRecord.reportCode];
            if (!reportSpec) continue;
            await repo.updateTask(taskRecord.id, { status: 'PROCESSING', attempts: taskRecord.attempts + 1, lastAttemptAt: taskNow, errorCode: null, errorMessage: null });
            processed += 1;
            let reportList = reportListCache.get(taskRecord.fiscalYear);
            if (!reportList) {
              reportList = await dart.listPeriodicReports(security.corpCode, taskRecord.fiscalYear);
              reportListCache.set(taskRecord.fiscalYear, reportList);
            }
            const report = reportList.find((item) => item.reportCode === reportSpec.code && !item.withdrawn);
            if (!report) {
              await repo.updateTask(taskRecord.id, { status: 'NO_FILING', lastAttemptAt: taskNow, processedAt: new Date(), selectedReceiptNo: null, errorCode: 'NO_PERIODIC_FILING', errorMessage: null });
              await repo.addRunItem(runId, security, taskRecord, 'NO_DATA', '공시 목록에서 대상 정기보고서를 찾지 못했습니다.'); noFiling += 1;
              continue;
            }
            const filing = await getCfsThenOfs(dart, security.corpCode, taskRecord.fiscalYear, reportSpec.code);
            if (filing.rows.some((row) => row.receiptNo !== report.receiptNo)) throw new DartApiError('RECEIPT_MISMATCH', 'Financial statement response did not match the selected disclosure receipt number.');
            if (!filing.rows.length) {
              await repo.updateTask(taskRecord.id, { status: 'NO_FILING', selectedReceiptNo: report.receiptNo, lastAttemptAt: taskNow, processedAt: new Date(), errorCode: 'FINANCIAL_ROWS_NOT_PUBLISHED', errorMessage: null });
              await repo.addRunItem(runId, security, taskRecord, 'NO_DATA', '보고서는 확인했지만 재무제표 자료가 아직 공개되지 않았습니다.'); noFiling += 1;
              continue;
            }
            const values = normalizeDartFinancialRows(filing.rows);
            const saved = await repo.saveFiling({ securityId: security.id, fiscalYear: taskRecord.fiscalYear, periodType: report.periodType, reportCode: reportSpec.code,
              fsDivision: filing.division, receiptNo: report.receiptNo, reportName: report.reportName,
              receiptDate: parseDartDate(report.receiptDate), periodEndDate: endOfFiscalPeriod(taskRecord.fiscalYear, taskRecord.periodType), collectedAt: new Date(), values });
            await repo.updateTask(taskRecord.id, { status: 'SUCCESS', selectedReceiptNo: report.receiptNo, lastAttemptAt: taskNow, processedAt: new Date(), errorCode: null, errorMessage: null });
            await repo.addRunItem(runId, security, taskRecord, 'SUCCESS', saved.created ? undefined : '동일 접수번호가 이미 저장되어 중복 입력을 건너뛰었습니다.');
            succeeded += 1;
          }
          await repo.completeSecurityIfDone(security.id);
        } catch (error) {
          const code = error instanceof DartApiError ? error.code : 'COLLECTOR_ERROR';
          const message = error instanceof DartApiError ? error.message : 'Unexpected collector failure; details were redacted.';
          apiErrors += 1; failures += 1;
          await repo.markSecurityError(security.id, `${code}: ${message}`);
          const paused = code === 'DAILY_CALL_LIMIT' || code === 'SCHEDULE_WINDOW_ENDED' || (error instanceof DartApiError && error.quotaExceeded);
          await repo.settleInterruptedTasks(runId, security, paused ? 'PENDING' : 'FAILED', code, message, new Date());
          if (paused) break;
          log('warn', 'DART company backfill failed', { symbol: security.symbol, code });
        }
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
              const filings = await dart.listPeriodicReports(security.corpCode, fiscalYear);
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
            if (error instanceof DartApiError && (error.quotaExceeded || error.code === 'SCHEDULE_WINDOW_ENDED')) { quotaReached = true; break; }
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
    await repo.updateStateError(failures ? 'Some DART collection requests failed; failed tasks will retry.' : null);
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

async function getCfsThenOfs(provider: OpenDartProvider, corpCode: string, year: number, reportCode: DartReportCode) {
  const cfs = await provider.fetchFinancials(corpCode, year, reportCode, 'CFS');
  if (cfs.length) return { division: 'CFS' as const, rows: cfs };
  const ofs = await provider.fetchFinancials(corpCode, year, reportCode, 'OFS');
  return { division: 'OFS' as const, rows: ofs };
}

function parseDartDate(value: string): Date {
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
}
function endOfFiscalPeriod(year: number, period: DartPeriodType): Date {
  const month = period === 'Q1' ? 3 : period === 'Q2' ? 6 : period === 'Q3' ? 9 : 12;
  return new Date(Date.UTC(year, month, 0, 12));
}
