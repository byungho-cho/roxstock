import { Prisma, PrismaClient } from '../generated/prisma/index.js';
import { getSeoulClock, toDatabaseDate } from './time.js';
import type { DartCorporation, DartFinancialValues, DartPeriodType, DartReport, DartReportCode } from './dart-provider.js';

const REPORTS: Array<{ reportCode: DartReportCode; periodType: DartPeriodType }> = [
  { reportCode: '11013', periodType: 'Q1' },
  { reportCode: '11012', periodType: 'Q2' },
  { reportCode: '11014', periodType: 'Q3' },
  { reportCode: '11011', periodType: 'ANNUAL' },
];

export interface DartBackfillTaskRecord {
  id: bigint;
  securityId: bigint;
  fiscalYear: number;
  reportCode: DartReportCode;
  periodType: DartPeriodType;
  attempts: number;
}

export interface DartSecurityRecord { id: bigint; symbol: string; securityType: string; corpCode: string | null; }

export class PrismaDartRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async acquireLock(owner: string, ttlSeconds: number, jobName = 'dart-financial-statements'): Promise<boolean> {
    const changed = await this.prisma.$executeRaw`
      INSERT INTO collector_locks (job_name, owner_token, locked_until, created_at, updated_at)
      VALUES (${jobName}, ${owner}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${ttlSeconds} SECOND), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        owner_token = IF(locked_until < UTC_TIMESTAMP(3), VALUES(owner_token), owner_token),
        locked_until = IF(locked_until < UTC_TIMESTAMP(3), VALUES(locked_until), locked_until),
        updated_at = IF(locked_until < UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), updated_at)
    `;
    if (!changed) return false;
    const rows = await this.prisma.$queryRaw<Array<{ owner_token: string }>>`SELECT owner_token FROM collector_locks WHERE job_name = ${jobName}`;
    return rows[0]?.owner_token === owner;
  }

  async releaseLock(owner: string, jobName = 'dart-financial-statements'): Promise<void> {
    await this.prisma.collectorLock.deleteMany({ where: { jobName, ownerToken: owner } });
  }

  async getState() {
    return this.prisma.dartCollectorState.findUnique({ where: { id: 1 } });
  }

  async setState(update: { phase?: string; backfillStartYear?: number; backfillEndYear?: number | null; backfillInitializedAt?: Date | null; corpCodeSyncedAt?: Date | null; backfillCompletedAt?: Date | null; phase2StartedAt?: Date | null; lastRunAt?: Date | null; lastError?: string | null }) {
    return this.prisma.dartCollectorState.upsert({
      where: { id: 1 },
      create: { id: 1, phase: update.phase ?? 'BACKFILL', backfillStartYear: update.backfillStartYear ?? 2015, ...update },
      update,
    });
  }

  async corpCodeMappingsSyncedAt(): Promise<Date | null> {
    const state = await this.prisma.dartCollectorState.findUnique({ where: { id: 1 }, select: { corpCodeSyncedAt: true } });
    if (state?.corpCodeSyncedAt) return state.corpCodeSyncedAt;
    const latest = await this.prisma.dartCorpMapping.findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } });
    return latest?.syncedAt ?? null;
  }

  async syncCorporations(corporations: DartCorporation[], syncedAt = new Date()): Promise<{ matched: number; unmatched: number; ambiguous: number }> {
    const securities = await this.prisma.security.findMany({
      where: { isActive: true }, select: { id: true, symbol: true },
    });
    const bySymbol = new Map(securities.map((item) => [item.symbol.replace(/^A(?=\d{6}$)/, ''), item.id]));
    const corpBySymbol = new Map<string, DartCorporation[]>();
    for (const corp of corporations) {
      if (!/^\d{6}$/.test(corp.stockCode)) continue;
      corpBySymbol.set(corp.stockCode, [...(corpBySymbol.get(corp.stockCode) ?? []), corp]);
    }
    const candidates = [...corpBySymbol.entries()].filter(([, entries]) => entries.length === 1);
    const ambiguous = [...corpBySymbol.values()].filter((entries) => entries.length > 1).length;
    const mapped = candidates.flatMap(([symbol, entries]) => {
      const corp = entries[0]!;
      const securityId = bySymbol.get(symbol);
      return securityId === undefined ? [] : [{ securityId, corpCode: corp.corpCode, stockCode: symbol, corpName: corp.corpName, sourceModifiedAt: corp.modifiedDate || null, syncedAt }];
    });
    await this.prisma.$transaction(async (tx) => {
      // Replace the full, successfully parsed DART list so removed or changed mappings cannot linger.
      await tx.dartCorpMapping.deleteMany({});
      for (let i = 0; i < mapped.length; i += 500) {
        await tx.dartCorpMapping.createMany({ data: mapped.slice(i, i + 500), skipDuplicates: true });
      }
    });
    await this.setState({ corpCodeSyncedAt: syncedAt });
    return { matched: mapped.length, unmatched: securities.length - mapped.length, ambiguous };
  }

  async ensureBackfillPlan(startYear: number, endYear: number, initializedAt = new Date()): Promise<void> {
    const existing = await this.getState();
    const historicalPlanActive = !existing?.backfillCompletedAt;
    if (!existing?.backfillInitializedAt) await this.setState({ phase: 'BACKFILL', backfillStartYear: startYear, backfillEndYear: endYear });
    const securities = await this.prisma.security.findMany({ where: { isActive: true }, select: { id: true } });
    const known = await this.prisma.dartSecurityState.findMany({ select: { securityId: true } });
    const knownIds = new Set(known.map((item) => item.securityId.toString()));
    const missingSecurities = securities.filter(({ id }) => !knownIds.has(id.toString()));
    for (let i = 0; i < missingSecurities.length; i += 500) {
      const slice = missingSecurities.slice(i, i + 500);
      await this.prisma.dartSecurityState.createMany({ data: slice.map(({ id }) => ({ securityId: id })), skipDuplicates: true });
      const tasks = historicalPlanActive ? slice.flatMap(({ id }) => {
        const result: Array<{ securityId: bigint; fiscalYear: number; reportCode: DartReportCode; periodType: DartPeriodType }> = [];
        for (let year = existing?.backfillEndYear ?? endYear; year >= (existing?.backfillStartYear ?? startYear); year -= 1) {
          for (const report of REPORTS) result.push({ securityId: id, fiscalYear: year, ...report });
        }
        return result;
      }) : [];
      for (let j = 0; j < tasks.length; j += 1000) {
        await this.prisma.dartBackfillTask.createMany({ data: tasks.slice(j, j + 1000), skipDuplicates: true });
      }
    }
    if (!existing?.backfillInitializedAt) await this.setState({ phase: 'BACKFILL', backfillStartYear: startYear, backfillEndYear: endYear, backfillInitializedAt: initializedAt, lastError: null });
    if (historicalPlanActive) await this.prisma.dartBackfillTask.updateMany({ where: { status: 'PENDING', security: { isActive: false } }, data: { status: 'NOT_APPLICABLE', processedAt: initializedAt, errorCode: 'SECURITY_INACTIVE', errorMessage: 'Security became inactive before its backfill was started.' } });
  }

  async resetInterruptedTasks(): Promise<number> {
    const result = await this.prisma.dartBackfillTask.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'PENDING', errorCode: 'PROCESS_RESTARTED', errorMessage: 'The previous collector process stopped before completing this report.' } });
    return result.count;
  }

  async startUpToDailyCompanyLimit(limit: number, now = new Date()): Promise<void> {
    const day = toDatabaseDate(getSeoulClock(now).dateKey);
    const alreadyStartedToday = await this.prisma.dartSecurityState.count({ where: { backfillStartedAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) } } });
    const slots = Math.max(0, limit - alreadyStartedToday);
    if (!slots) return;
    const candidates = await this.prisma.dartSecurityState.findMany({
      where: { backfillStartedAt: null, backfillCompletedAt: null, security: { isActive: true, securityType: 'STOCK', dartCorpMapping: { isNot: null } } },
      select: { securityId: true }, orderBy: { securityId: 'asc' }, take: slots,
    });
    if (!candidates.length) return;
    await this.prisma.dartSecurityState.updateMany({ where: { securityId: { in: candidates.map((x) => x.securityId) }, backfillStartedAt: null }, data: { backfillStartedAt: now, lastError: null } });
  }

  async listStartedBackfillSecurities(now = new Date()): Promise<DartSecurityRecord[]> {
    const states = await this.prisma.dartSecurityState.findMany({
      where: { backfillStartedAt: { not: null }, backfillCompletedAt: null,
        security: { isActive: true, dartBackfillTasks: { some: { OR: [{ status: 'PENDING' }, { status: 'PROCESSING' }, { status: 'FAILED', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }] } } } },
      select: { securityId: true, security: { select: { symbol: true, securityType: true, dartCorpMapping: { select: { corpCode: true } } } } },
      orderBy: { backfillStartedAt: 'asc' },
    });
    return states.map((item) => ({ id: item.securityId, symbol: item.security.symbol, securityType: item.security.securityType, corpCode: item.security.dartCorpMapping?.corpCode ?? null }));
  }

  async listTasksForSecurity(securityId: bigint, now = new Date()): Promise<DartBackfillTaskRecord[]> {
    const tasks = await this.prisma.dartBackfillTask.findMany({
      where: { securityId, OR: [{ status: 'PENDING' }, { status: 'PROCESSING' }, { status: 'FAILED', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }] },
      select: { id: true, securityId: true, fiscalYear: true, reportCode: true, periodType: true, attempts: true },
      orderBy: [{ fiscalYear: 'desc' }, { reportCode: 'asc' }],
    });
    return tasks as DartBackfillTaskRecord[];
  }

  async markCompanyChecked(securityId: bigint, phase: string, now = new Date()): Promise<void> {
    const usageDate = toDatabaseDate(getSeoulClock(now).dateKey);
    const result = await this.prisma.dartDailyCompanyCheck.createMany({ data: [{ usageDate, securityId, phase, checkedAt: now }], skipDuplicates: true });
    if (result.count) {
      await this.prisma.dartApiDailyUsage.upsert({ where: { usageDate }, create: { usageDate, companyCheckCount: 1 }, update: { companyCheckCount: { increment: 1 } } });
    }
  }

  async reserveApiCall(limit: number, now = new Date(), owner?: string): Promise<boolean> {
    if (owner) await this.prisma.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 900 SECOND), updated_at=UTC_TIMESTAMP(3) WHERE job_name='dart-financial-statements' AND owner_token=${owner}`;
    const usageDate = toDatabaseDate(getSeoulClock(now).dateKey);
    const changed = await this.prisma.$executeRaw`
      INSERT INTO dart_api_daily_usage (usage_date, api_call_count, company_check_count, error_count, no_data_count, updated_at)
      VALUES (${usageDate}, 1, 0, 0, 0, UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        api_call_count = IF(api_call_count < ${limit}, api_call_count + 1, api_call_count),
        updated_at = IF(api_call_count < ${limit}, UTC_TIMESTAMP(3), updated_at)
    `;
    if (changed > 0) await this.setState({ lastRunAt: now, lastError: null });
    return changed > 0;
  }

  async recordApiResult(status: 'ERROR' | 'NO_DATA', now = new Date()): Promise<void> {
    const usageDate = toDatabaseDate(getSeoulClock(now).dateKey);
    const column = status === 'ERROR' ? 'errorCount' : 'noDataCount';
    await this.prisma.dartApiDailyUsage.upsert({ where: { usageDate }, create: { usageDate, [column]: 1 }, update: { [column]: { increment: 1 } } });
  }

  async getDailyUsage(now = new Date()) {
    return this.prisma.dartApiDailyUsage.findUnique({ where: { usageDate: toDatabaseDate(getSeoulClock(now).dateKey) } });
  }

  async updateTask(taskId: bigint, update: { status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'NO_FILING' | 'NOT_APPLICABLE' | 'FAILED'; attempts?: number; selectedReceiptNo?: string | null; lastAttemptAt?: Date; nextAttemptAt?: Date | null; processedAt?: Date | null; errorCode?: string | null; errorMessage?: string | null }) {
    return this.prisma.dartBackfillTask.update({ where: { id: taskId }, data: update });
  }

  async markTasks(securityId: bigint, fiscalYear: number, reportCode: string, status: 'NO_FILING' | 'NOT_APPLICABLE' | 'FAILED', now: Date, errorCode?: string, errorMessage?: string) {
    await this.prisma.dartBackfillTask.updateMany({
      where: { securityId, fiscalYear, reportCode, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      data: { status, attempts: { increment: status === 'FAILED' ? 1 : 0 }, processedAt: status === 'FAILED' ? null : now,
        lastAttemptAt: now, nextAttemptAt: status === 'FAILED' ? new Date(now.getTime() + 24 * 60 * 60_000) : null,
        errorCode: errorCode ?? null, errorMessage: errorMessage?.slice(0, 1000) ?? null },
    });
  }

  async saveFiling(input: {
    securityId: bigint; fiscalYear: number; periodType: DartPeriodType; reportCode: DartReportCode; fsDivision: 'CFS' | 'OFS';
    receiptNo: string; reportName: string; receiptDate: Date; periodEndDate: Date; collectedAt: Date; values: DartFinancialValues;
  }): Promise<{ created: boolean; supersedesReceiptNo: string | null }> {
    const current = await this.prisma.dartFinancialFiling.findUnique({ where: { receiptNo: input.receiptNo }, select: { id: true, accountSources:true } });
    if (current) {
      const existing=current.accountSources&&typeof current.accountSources==='object'&&!Array.isArray(current.accountSources)?current.accountSources:{};
      const additions=Object.fromEntries(Object.entries(input.values.accountSources).filter(([key])=>!(key in existing)));
      await this.prisma.dartFinancialFiling.update({where:{id:current.id},data:{normalizationVersion:2,accountSources:{...existing,...additions} as Prisma.InputJsonValue,collectedAt:input.collectedAt}});
      return { created: false, supersedesReceiptNo: null };
    }
    const previous = await this.prisma.dartFinancialFiling.findFirst({
      where: { securityId: input.securityId, fiscalYear: input.fiscalYear, reportCode: input.reportCode, fsDivision: input.fsDivision },
      orderBy: [{ receiptDate: 'desc' }, { collectedAt: 'desc' }], select: { receiptNo: true },
    });
    const values = input.values;
    try {
      await this.prisma.dartFinancialFiling.create({ data: {
        securityId: input.securityId, fiscalYear: input.fiscalYear, periodType: input.periodType, reportCode: input.reportCode,
        fsDivision: input.fsDivision, receiptNo: input.receiptNo, supersedesReceiptNo: previous?.receiptNo ?? null,
        reportName: input.reportName.slice(0, 300), receiptDate: input.receiptDate, periodEndDate: input.periodEndDate,
        collectedAt: input.collectedAt, source: 'OPEN_DART', isWithdrawn: false, normalizationVersion:2,
        revenueQuarter: values.revenueQuarter === null ? null : new Prisma.Decimal(values.revenueQuarter),
        revenueYtd: values.revenueYtd === null ? null : new Prisma.Decimal(values.revenueYtd),
        operatingProfitQuarter: values.operatingProfitQuarter === null ? null : new Prisma.Decimal(values.operatingProfitQuarter),
        operatingProfitYtd: values.operatingProfitYtd === null ? null : new Prisma.Decimal(values.operatingProfitYtd),
        netIncomeQuarter: values.netIncomeQuarter === null ? null : new Prisma.Decimal(values.netIncomeQuarter),
        netIncomeYtd: values.netIncomeYtd === null ? null : new Prisma.Decimal(values.netIncomeYtd),
        totalAssets: values.totalAssets === null ? null : new Prisma.Decimal(values.totalAssets),
        totalLiabilities: values.totalLiabilities === null ? null : new Prisma.Decimal(values.totalLiabilities),
        totalEquity: values.totalEquity === null ? null : new Prisma.Decimal(values.totalEquity),
        operatingCashFlowQuarter: values.operatingCashFlowQuarter === null ? null : new Prisma.Decimal(values.operatingCashFlowQuarter),
        operatingCashFlowYtd: values.operatingCashFlowYtd === null ? null : new Prisma.Decimal(values.operatingCashFlowYtd),
        capitalExpenditureQuarter: values.capitalExpenditureQuarter === null ? null : new Prisma.Decimal(values.capitalExpenditureQuarter),
        capitalExpenditureYtd: values.capitalExpenditureYtd === null ? null : new Prisma.Decimal(values.capitalExpenditureYtd),
        accountSources: values.accountSources as Prisma.InputJsonValue,
      } });
      return { created: true, supersedesReceiptNo: previous?.receiptNo ?? null };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { created: false, supersedesReceiptNo: null };
      throw error;
    }
  }

  async completeSecurityIfDone(securityId: bigint, now = new Date()): Promise<boolean> {
    const pending = await this.prisma.dartBackfillTask.count({ where: { securityId, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } } });
    if (pending) return false;
    await this.prisma.dartSecurityState.update({ where: { securityId }, data: { backfillCompletedAt: now, lastError: null } });
    return true;
  }

  async markSecurityError(securityId: bigint, message: string): Promise<void> {
    await this.prisma.dartSecurityState.update({ where: { securityId }, data: { lastError: message.slice(0, 1000) } });
  }

  async backfillProgress() {
    const [total, rows, completeSecurities, activeSecurities] = await Promise.all([
      this.prisma.dartBackfillTask.count(),
      this.prisma.dartBackfillTask.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.dartSecurityState.count({ where: { backfillCompletedAt: { not: null } } }),
      this.prisma.security.count({ where: { isActive: true } }),
    ]);
    const counts = Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
    return { totalReports: total, processedReports: total - (counts.PENDING ?? 0) - (counts.PROCESSING ?? 0) - (counts.FAILED ?? 0), success: counts.SUCCESS ?? 0, noFiling: counts.NO_FILING ?? 0, notApplicable: counts.NOT_APPLICABLE ?? 0, failed: counts.FAILED ?? 0, pending: counts.PENDING ?? 0, processing: counts.PROCESSING ?? 0, completedSecurities: completeSecurities, activeSecurities };
  }

  async markBackfillCompleteIfReady(now = new Date()): Promise<boolean> {
    const remaining = await this.prisma.dartBackfillTask.count({ where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } } });
    if (remaining) return false;
    await this.setState({ phase: 'CURRENT', backfillCompletedAt: now, phase2StartedAt: now, lastError: null });
    return true;
  }

  async cleanupRealtimeRetention(now = new Date()): Promise<void> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    await this.prisma.$transaction([
      this.prisma.realtimeCycleAggregate.deleteMany({ where: { minuteStartedAt: { lt: sevenDaysAgo } } }),
      this.prisma.realtimeCollectorIssue.deleteMany({ where: { occurredAt: { lt: thirtyDaysAgo } } }),
      this.prisma.realtimeCollectorIssue.deleteMany({ where: { id: { notIn: (await this.prisma.realtimeCollectorIssue.findMany({ orderBy: { occurredAt: 'desc' }, take: 1000, select: { id: true } })).map((x) => x.id) } } }),
      this.prisma.dartDailyCompanyCheck.deleteMany({ where: { usageDate: { lt: toDatabaseDate(getSeoulClock(new Date(now.getTime() - 90 * 24 * 60 * 60_000)).dateKey) } } }),
      this.prisma.dartApiDailyUsage.deleteMany({ where: { usageDate: { lt: toDatabaseDate(getSeoulClock(new Date(now.getTime() - 90 * 24 * 60 * 60_000)).dateKey) } } }),
    ]);
  }

  async countRunsForDate(jobType: string, dateKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM collector_runs WHERE job_type=${jobType} AND DATE(CONVERT_TZ(started_at,'+00:00','+09:00'))=${dateKey}`;
    return Number(rows[0]?.count ?? 0);
  }

  async createRun(jobType: string, provider: string, metadata: Record<string, unknown>) {
    return this.prisma.collectorRun.create({ data: { jobType, provider, status: 'RUNNING', metadata: metadata as Prisma.InputJsonValue }, select: { id: true } });
  }

  async finishRun(runId: bigint, status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED', counts: { success: number; failed: number; skipped: number }, failureReason?: string, metadata?: Record<string, unknown>) {
    await this.prisma.collectorRun.update({ where: { id: runId }, data: { status, finishedAt: new Date(), successCount: counts.success, failureCount: counts.failed, skippedCount: counts.skipped, failureReason, ...(metadata && { metadata: metadata as Prisma.InputJsonValue }) } });
  }

  async addRunItem(runId: bigint, security: DartSecurityRecord, task: DartBackfillTaskRecord, status: 'SUCCESS' | 'FAILED' | 'NO_DATA' | 'NOT_APPLICABLE', message?: string) {
    await this.prisma.collectorRunItem.create({ data: { runId, securityId: security.id, symbol: `${security.symbol}:${task.fiscalYear}:${task.reportCode}`, status, message: message?.slice(0, 1000) } });
  }

  async addPhase2RunItem(runId: bigint, security: DartSecurityRecord, status: 'SUCCESS' | 'FAILED' | 'NOT_APPLICABLE', message?: string) {
    await this.prisma.collectorRunItem.create({ data: { runId, securityId: security.id, symbol: security.symbol, status, message: message?.slice(0, 1000) } });
  }

  async markUniverseNoMapping(now = new Date()): Promise<number> {
    const noMap = await this.prisma.security.findMany({ where: { isActive: true, securityType: { not: 'STOCK' }, dartCorpMapping: null }, select: { id: true } });
    if (!noMap.length) return 0;
    const result = await this.prisma.dartBackfillTask.updateMany({ where: { securityId: { in: noMap.map((x) => x.id) }, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'NOT_APPLICABLE', processedAt: now, errorCode: 'SECURITY_TYPE_NOT_APPLICABLE', errorMessage: 'DART periodic financial filings are not collected for this security type.' } });
    return result.count;
  }

  async markUnmappedTasksNotApplicable(now = new Date()): Promise<number> {
    const noMap = await this.prisma.security.findMany({ where: { isActive: true, OR: [{ securityType: 'STOCK', dartCorpMapping: null }, { securityType: { not: 'STOCK' } }] }, select: { id: true } });
    if (!noMap.length) return 0;
    return (await this.prisma.dartBackfillTask.updateMany({
      where: { securityId: { in: noMap.map((x) => x.id) }, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'NOT_APPLICABLE', processedAt: now, errorCode: 'NOT_DART_LISTED_EQUITY', errorMessage: 'No DART periodic financial statement collection applies to this security.' },
    })).count;
  }

  async markAllSecurityTasksNotApplicable(securityId: bigint, code: string, message: string): Promise<number> {
    return (await this.prisma.dartBackfillTask.updateMany({
      where: { securityId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'NOT_APPLICABLE', processedAt: new Date(), errorCode: code, errorMessage: message.slice(0, 1000) },
    })).count;
  }

  async settleInterruptedTasks(runId: bigint, security: DartSecurityRecord, status: 'PENDING' | 'FAILED', code: string, message: string, now = new Date()): Promise<number> {
    const securityId = security.id;
    const processing = await this.prisma.dartBackfillTask.findMany({ where: { securityId, status: 'PROCESSING' }, select: { id: true, fiscalYear: true, reportCode: true } });
    if (!processing.length) return 0;
    await this.prisma.dartBackfillTask.updateMany({ where: { id: { in: processing.map((task) => task.id) } }, data: {
      status, errorCode: code.slice(0, 20), errorMessage: message.slice(0, 1000), processedAt: null,
      nextAttemptAt: status === 'FAILED' ? new Date(now.getTime() + 6 * 60 * 60_000) : null,
    } });
    await this.prisma.collectorRunItem.createMany({ data: processing.map((task) => ({
      runId, securityId, symbol: `${security.symbol}:${task.fiscalYear}:${task.reportCode}`,
      status: status === 'FAILED' ? 'FAILED' as const : 'SKIPPED' as const, message: `${code}: ${message}`.slice(0, 1000),
    })) });
    return processing.length;
  }

  async hasStoredReceipt(receiptNo: string): Promise<boolean> {
    return (await this.prisma.dartFinancialFiling.count({ where: { receiptNo } })) > 0;
  }

  async setPhase2Check(securityId: bigint, phase: 'PRIORITY' | 'UNIVERSE', now = new Date(), error?: string): Promise<void> {
    await this.prisma.dartSecurityState.update({ where: { securityId }, data: {
      ...(phase === 'PRIORITY' ? { priorityCheckedAt: now } : { universeCheckedAt: now }),
      lastReceiptCheckedAt: now,
      lastError: error?.slice(0, 1000) ?? null,
    } });
  }

  async listPhase2Securities(phase: 'PRIORITY' | 'UNIVERSE', limit: number, now = new Date()): Promise<DartSecurityRecord[]> {
    const today = toDatabaseDate(getSeoulClock(now).dateKey);
    let priorityIds: bigint[] = [];
    const priorities = new Map<bigint, number>();
    if (phase === 'PRIORITY') {
      const openHoldings = await this.prisma.$queryRaw<Array<{ security_id: bigint }>>`
        SELECT DISTINCT bt.security_id FROM buy_trades bt
        JOIN accounts a ON a.id=bt.account_id AND a.is_active=TRUE
        WHERE bt.quantity > COALESCE((SELECT SUM(st.quantity) FROM sell_trades st WHERE st.buy_trade_id=bt.id), 0)
      `;
      const listed = await this.prisma.accountWatchlistItem.findMany({ where: { account: { isActive: true }, security: { isActive: true, securityType: 'STOCK' }, listType: { in: ['WATCHLIST', 'RECOMMENDED'] } }, select: { securityId: true, priority: true } });
      for (const item of listed) priorities.set(item.securityId, Math.max(priorities.get(item.securityId) ?? 0, item.priority));
      priorityIds = [...new Set([...openHoldings.map((item) => item.security_id), ...listed.map((item) => item.securityId)])];
      if (!priorityIds.length) return [];
    }
    const filterTime = phase === 'PRIORITY'
      ? { OR: [{ priorityCheckedAt: null }, { priorityCheckedAt: { lt: today } }] }
      : { OR: [{ universeCheckedAt: null }, { universeCheckedAt: { lt: today } }] };
    const items = await this.prisma.security.findMany({
      where: { isActive: true, securityType: 'STOCK', dartCorpMapping: { isNot: null },
        ...(phase === 'PRIORITY' ? { id: { in: priorityIds } } : {}),
        ...(phase === 'UNIVERSE' ? { dartDailyCompanyChecks: { none: { usageDate: today } } } : {}),
        dartSecurityState: { is: filterTime } },
      select: { id: true, symbol: true, securityType: true, dartCorpMapping: { select: { corpCode: true } } },
      orderBy: [{ id: 'asc' }],
      ...(phase === 'UNIVERSE' ? { take: limit } : {}),
    });
    if (phase === 'PRIORITY') items.sort((a, b) => (priorities.get(b.id) ?? 0) - (priorities.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1));
    return items.slice(0, limit).map((item) => ({ id: item.id, symbol: item.symbol, securityType: item.securityType, corpCode: item.dartCorpMapping?.corpCode ?? null }));
  }

  async updateStateError(error: string | null): Promise<void> {
    await this.setState({ lastError: error?.slice(0, 1000) ?? null, lastRunAt: new Date() });
  }
}

