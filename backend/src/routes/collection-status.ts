import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { getSeoulClock } from '../collector/time.js';

interface CollectionJob { id: string; name: string; jobType: string; schedule: string; hour?: number; }
const jobs: CollectionJob[] = [
  { id: 'security-master', name: '종목 마스터', jobType: 'security-master', schedule: '매일 07:00', hour: 7 },
  { id: 'realtime-prices', name: '선택 종목 실시간 주가', jobType: 'realtime-selected-prices', schedule: '평일 장 구간, 60초 간격' },
  { id: 'market-prices', name: '전체 종목 주가', jobType: 'market-prices', schedule: '매일 20:00', hour: 20 },
  { id: 'account-snapshots', name: '일별 계좌 스냅샷', jobType: 'daily-account-snapshots', schedule: '매일 23:00', hour: 23 },
  { id: 'dart-financial-statements', name: 'DART 재무제표', jobType: 'dart-financial-statements', schedule: '과거 구축 18:00–06:00, 상시 우선종목 1일 1회' },
];

type Run = Awaited<ReturnType<typeof prisma.collectorRun.findFirst>>;
const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
const safeReason = (value: string | null | undefined) => value ? value.replace(/(?:crtfc_key|api[_-]?key|token|secret)=?[^\s&]*/gi, '[redacted]').slice(0, 1000) : null;
const localSchedule = (hour: number, now = new Date()): Date => {
  const clock = getSeoulClock(now);
  const base = Date.parse(`${clock.dateKey}T${String(hour).padStart(2, '0')}:00:00+09:00`);
  const next = base > now.getTime() ? base : base + 86_400_000;
  return new Date(next);
};

async function currentRun(jobType: string) {
  return prisma.collectorRun.findFirst({ where: { jobType }, orderBy: { startedAt: 'desc' } });
}
async function lastSuccessfulRun(jobType: string) {
  return prisma.collectorRun.findFirst({ where: { jobType, status: { in: ['SUCCESS', 'PARTIAL'] } }, orderBy: { startedAt: 'desc' } });
}
async function priorityOverdueCount(cutoff: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT ds.security_id) AS count
    FROM dart_security_state ds
    JOIN securities s ON s.id=ds.security_id AND s.is_active=TRUE AND s.security_type='STOCK'
    JOIN dart_corp_mappings cm ON cm.security_id=s.id
    LEFT JOIN watchlist_items wi ON wi.security_id=s.id AND wi.list_type IN ('WATCHLIST','RECOMMENDED')
    WHERE (wi.security_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM buy_trades bt JOIN accounts a ON a.id=bt.account_id AND a.is_active=TRUE
      WHERE bt.security_id=s.id AND bt.quantity > COALESCE((SELECT SUM(st.quantity) FROM sell_trades st WHERE st.buy_trade_id=bt.id), 0)
    )) AND (ds.priority_checked_at IS NULL OR ds.priority_checked_at < ${cutoff})
  `;
  return Number(rows[0]?.count ?? 0);
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
  if (job.hour !== undefined) {
    const dueAt = new Date(localSchedule(job.hour, new Date(now.getTime() - 86_400_000)).getTime());
    const sameDayRun = run.id !== 0n && run.startedAt.getTime() >= Date.parse(`${getSeoulClock(now).dateKey}T00:00:00+09:00`);
    if (sameDayRun) return run.status === 'SUCCESS' || run.status === 'SKIPPED' ? 'OK' : 'FAILED';
    if (now.getTime() < dueAt.getTime()) return 'WAITING';
    return 'DELAYED';
  }
  return run.status === 'SUCCESS' || run.status === 'SKIPPED' ? 'OK' : 'WAITING';
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
    if (job.id === 'dart-financial-statements') {
      const [state, usage, progress, priorityBehind, universeBehind] = await Promise.all([
        prisma.dartCollectorState.findUnique({ where: { id: 1 } }),
        prisma.dartApiDailyUsage.findUnique({ where: { usageDate: new Date(`${getSeoulClock(now).dateKey}T00:00:00.000Z`) } }),
        prisma.dartBackfillTask.groupBy({ by: ['status'], _count: { _all: true } }),
        priorityOverdueCount(new Date(now.getTime() - 86_400_000)),
        prisma.dartSecurityState.count({ where: { security: { isActive: true, securityType: 'STOCK', dartCorpMapping: { isNot: null } }, OR: [{ universeCheckedAt: null }, { universeCheckedAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } }] } }),
      ]);
      const counts = Object.fromEntries(progress.map((item) => [item.status, item._count._all]));
      const phase = state?.backfillCompletedAt ? 'CURRENT' : 'BACKFILL';
      const night = getSeoulClock(now).hour >= Number(process.env.DART_NIGHT_WINDOW_START_HOUR ?? 18) || getSeoulClock(now).hour < Number(process.env.DART_NIGHT_WINDOW_END_HOUR ?? 6);
      const dartStatus = process.env.DART_COLLECTOR_ENABLED === 'false' || !process.env.DART_API_KEY?.trim() ? 'NOT_CONFIGURED' : !state ? 'NOT_IMPLEMENTED' : state.lastRunAt && now.getTime() - state.lastRunAt.getTime() > 120_000 ? 'DELAYED' : run?.status === 'FAILED' ? 'FAILED' : run?.status === 'PARTIAL' ? 'PARTIAL' : run?.status === 'RUNNING' || phase === 'BACKFILL' && night ? 'RUNNING' : phase === 'BACKFILL' ? 'WAITING' : 'OK';
      return { id: job.id, name: job.name, schedule: job.schedule, status: dartStatus,
        lastAttemptAt: iso(run?.startedAt), lastSuccessAt: iso(successfulRuns[index]?.finishedAt),
        lastDataAt: iso(latestDartFiling?.periodEndDate), lastCollectedAt: iso(latestDartFiling?.collectedAt), latestReceiptDate: iso(latestDartFiling?.receiptDate), statsGeneratedAt: now.toISOString(), nextAt: phase === 'BACKFILL' && !night ? iso(localSchedule(Number(process.env.DART_NIGHT_WINDOW_START_HOUR ?? 18), now)) : null,
        recent: { target: Number(counts.SUCCESS ?? 0) + Number(counts.NO_FILING ?? 0) + Number(counts.NOT_APPLICABLE ?? 0) + Number(counts.FAILED ?? 0), processed: Number(counts.SUCCESS ?? 0) + Number(counts.NO_FILING ?? 0) + Number(counts.NOT_APPLICABLE ?? 0), success: Number(counts.SUCCESS ?? 0), failed: Number(counts.FAILED ?? 0), skipped: Number(counts.NO_FILING ?? 0) + Number(counts.NOT_APPLICABLE ?? 0) },
        phase, backfillCompletedAt: iso(state?.backfillCompletedAt), backfill: { planned: Object.values(counts).reduce((sum, n) => sum + Number(n), 0), success: Number(counts.SUCCESS ?? 0), noFiling: Number(counts.NO_FILING ?? 0), notApplicable: Number(counts.NOT_APPLICABLE ?? 0), failed: Number(counts.FAILED ?? 0), pending: Number(counts.PENDING ?? 0) + Number(counts.PROCESSING ?? 0) },
        priorityPending: priorityBehind, universePending: universeBehind, dailyApiCalls: usage?.apiCallCount ?? 0, dailyApiLimit: Number(process.env.DART_DAILY_CALL_LIMIT ?? 3000), companyChecks: usage?.companyCheckCount ?? 0, failureReason: safeReason(run?.failureReason ?? state?.lastError) };
    }
    const state = await statusFor(job, run ?? emptyRun(job.jobType, now), now, realtime);
    let nextAt: Date | null = job.hour === undefined ? null : localSchedule(job.hour, now);
    if (job.id === 'realtime-prices') nextAt = null;
    if (job.id === 'dart-financial-statements') nextAt = null;
    return { id: job.id, name: job.name, schedule: job.schedule, status: state,
      lastAttemptAt: iso(job.id === 'realtime-prices' ? realtime?.lastCycleStartedAt : run?.startedAt), lastSuccessAt: iso(job.id === 'realtime-prices' ? realtime?.lastPriceReceivedAt : successfulRuns[index]?.finishedAt),
      lastDataAt: job.id === 'realtime-prices' ? iso(realtime?.lastSourcePriceAt) : job.id === 'market-prices' ? iso(price?.priceUpdatedAt) : job.id === 'account-snapshots' ? iso(latestSnapshot?.snapshotDate) : job.id === 'security-master' && masterItem ? `${masterItem.symbol.slice(7, 11)}-${masterItem.symbol.slice(11, 13)}-${masterItem.symbol.slice(13, 15)}T00:00:00.000Z` : iso(successfulRuns[index]?.finishedAt), statsGeneratedAt: now.toISOString(), nextAt: iso(nextAt),
      recent: { target: run ? run.successCount + run.failureCount + run.staleCount + run.skippedCount : realtime?.targetCount ?? 0, processed: run ? run.successCount + run.failureCount : realtime?.receivedCount ?? 0,
        success: run?.successCount ?? realtime?.receivedCount ?? 0, failed: run?.failureCount ?? realtime?.sourceFailureCount ?? 0, skipped: run?.skippedCount ?? realtime?.staleCount ?? 0 },
      lastError: safeReason(run?.failureReason), ...(job.id === 'realtime-prices' ? { realtime: realtime && {
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

interface DetailQuery { from?: string; to?: string; result?: string; symbol?: string; market?: string; accountId?: string; phase?: string; limit?: number; offset?: number; }
const dateFilter = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : undefined;

export async function collectionStatusRoutes(app: FastifyInstance) {
  app.get('/collection/status', async () => {
    const [run, price] = await Promise.all([
      prisma.collectorRun.findFirst({ where: { jobType: 'market-prices' }, orderBy: { startedAt: 'desc' } }),
      prisma.marketPrice.findFirst({ orderBy: { priceUpdatedAt: 'desc' }, select: { priceUpdatedAt: true } }),
    ]);
    return { data: { latestRun: run ? { id: run.id.toString(), status: run.status, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, successCount: run.successCount, failureCount: run.failureCount, failureReason: run.failureReason } : null, latestPriceAt: price?.priceUpdatedAt.toISOString() ?? null, manualRunAvailable: false, settingsAvailable: false } };
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
    const runs = await prisma.collectorRun.findMany({ where, orderBy: { startedAt: 'desc' }, take: Math.min(100, Math.max(1, Number(q.limit ?? 30))), skip: Math.max(0, Number(q.offset ?? 0)) });
    const filteredRuns = wantedStatus ? runs.filter((run) => run.status === wantedStatus) : runs;
    const runIds = filteredRuns.map((run) => run.id);
    const items = await prisma.collectorRunItem.findMany({ where: { runId: { in: runIds }, ...(validStatus ? { status: validStatus as never } : {}), ...(q.symbol ? { symbol: { contains: q.symbol } } : {}), ...(validMarket ? { security: { is: { marketType: validMarket as never } } } : {}), ...(q.accountId && feature.id === 'account-snapshots' ? { symbol: `account:${q.accountId}` } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, include: { security: { select: { symbol: true, name: true, marketType: true } } } });
    const now = new Date();
    const detail: Record<string, unknown> = { id: feature.id, name: feature.name, generatedAt: now.toISOString(), runs: filteredRuns.map((run) => ({ id: run.id.toString(), status: run.status, startedAt: iso(run.startedAt), finishedAt: iso(run.finishedAt), success: run.successCount, failed: run.failureCount, skipped: run.skippedCount, target: run.successCount + run.failureCount + run.staleCount + run.skippedCount, failureReason: safeReason(run.failureReason), metadata: run.metadata })),
      items: items.map((item) => ({ symbol: item.symbol, security: item.security, status: item.status, reason: safeReason(item.message), occurredAt: iso(item.createdAt), observedAt: iso(item.observedAt) })), nextOffset: q.offset ? Number(q.offset) + filteredRuns.length : filteredRuns.length };
    if (feature.id === 'realtime-prices') {
      const realtime = await prisma.realtimeWorkerState.findUnique({ where: { id: 'selected-prices' } });
      const [aggregates, issues] = await Promise.all([
        prisma.realtimeCycleAggregate.findMany({ where: { minuteStartedAt: { gte: dateFilter(q.from) ?? new Date(now.getTime() - 7 * 86_400_000), ...(toExclusive ? { lt: toExclusive } : {}) } }, orderBy: { minuteStartedAt: 'desc' }, take: 500 }),
        prisma.realtimeCollectorIssue.findMany({ where: { occurredAt: { gte: dateFilter(q.from) ?? new Date(now.getTime() - 30 * 86_400_000), ...(toExclusive ? { lt: toExclusive } : {}) } }, orderBy: { occurredAt: 'desc' }, take: 100 }),
      ]);
      detail.realtime = { state: realtime, aggregates, issues: issues.map((issue) => ({ at: iso(issue.occurredAt), stage: issue.stage, symbol: issue.symbol, reason: safeReason(issue.message) })) };
    }
    if (feature.id === 'dart-financial-statements') {
      const [state, taskCounts, usage, priorityDelayed, universeDelayed] = await Promise.all([
        prisma.dartCollectorState.findUnique({ where: { id: 1 } }), prisma.dartBackfillTask.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.dartApiDailyUsage.findMany({ where: { usageDate: { gte: dateFilter(q.from) ?? new Date(now.getTime() - 30 * 86_400_000) } }, orderBy: { usageDate: 'desc' }, take: 90 }),
        priorityOverdueCount(new Date(now.getTime() - 86_400_000)),
        prisma.dartSecurityState.count({ where: { security: { isActive: true, securityType: 'STOCK', dartCorpMapping: { isNot: null } }, OR: [{ universeCheckedAt: null }, { universeCheckedAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } }] } }),
      ]);
      detail.dart = { phase: state?.phase ?? 'NOT_INITIALIZED', backfill: { planned: taskCounts.reduce((sum, row) => sum + row._count._all, 0), byStatus: Object.fromEntries(taskCounts.map((row) => [row.status, row._count._all])), completedAt: iso(state?.backfillCompletedAt) },
        current: { priorityCheckedWithinDay: priorityDelayed, universeOver90Days: universeDelayed }, usage: usage.map((row) => ({ date: iso(row.usageDate), apiCalls: row.apiCallCount, companyChecks: row.companyCheckCount, noData: row.noDataCount, failures: row.errorCount })) };
    }
    return { data: detail };
  });
}
