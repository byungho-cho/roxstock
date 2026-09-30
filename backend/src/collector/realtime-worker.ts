import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { loadCollectorConfig } from './config.js';
import { collectorLog as log } from './logger.js';
import { MockPriceProvider } from './providers/mock-price-provider.js';
import { NaverPriceProvider } from './providers/naver-price-provider.js';
import { getRealtimeMarketSession, runRealtimeCollector } from './realtime-price-collector.js';
import { PrismaCollectorRepository } from './repository.js';

const config = loadCollectorConfig();
const repository = new PrismaCollectorRepository(prisma);
const provider = config.provider === 'mock'
  ? new MockPriceProvider()
  : new NaverPriceProvider(config.requestTimeoutMs);
const token = randomUUID();
const monitor = {
  async acquire() {
    const result = await prisma.$executeRaw`
      INSERT INTO collector_locks (job_name, owner_token, locked_until, created_at, updated_at)
      VALUES ('selected-realtime-prices', ${token}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 45 SECOND), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE owner_token=IF(locked_until < UTC_TIMESTAMP(3), VALUES(owner_token), owner_token), locked_until=IF(locked_until < UTC_TIMESTAMP(3), VALUES(locked_until), locked_until), updated_at=IF(locked_until < UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), updated_at)
    `;
    const rows = await prisma.$queryRaw<Array<{ owner_token: string }>>`SELECT owner_token FROM collector_locks WHERE job_name='selected-realtime-prices'`;
    return result > 0 && rows[0]?.owner_token === token;
  },
  async heartbeat(status: { workerStatus: string; marketSession: string; at: Date }) {
    const prior = await prisma.realtimeWorkerState.findUnique({ where: { id: 'selected-prices' }, select: { workerToken: true } });
    await prisma.realtimeWorkerState.upsert({
      where: { id: 'selected-prices' },
      create: { id: 'selected-prices', workerToken: token, workerStatus: status.workerStatus, startedAt: status.at, heartbeatAt: status.at, marketSession: status.marketSession },
      update: { workerToken: token, workerStatus: status.workerStatus, heartbeatAt: status.at, marketSession: status.marketSession, ...(prior?.workerToken !== token ? { startedAt: status.at } : {}) },
    });
    await prisma.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 45 SECOND), updated_at=UTC_TIMESTAMP(3) WHERE job_name='selected-realtime-prices' AND owner_token=${token}`;
  },
  async cycle(data: Parameters<NonNullable<Parameters<typeof runRealtimeCollector>[2]['monitor']>['cycle']>[0]) {
    const minute = new Date(Math.floor(data.startedAt.getTime() / 60_000) * 60_000);
    const counts = { cycleCount: 1, targetCount: data.targetCount, receivedCount: data.receivedCount, sourceFailureCount: data.sourceFailureCount, staleCount: data.staleCount,
      publishedCount: data.publishedCount, publishFailureCount: data.publishFailureCount, savedCount: data.savedCount, saveFailureCount: data.saveFailureCount, lastCycleFinishedAt: data.finishedAt };
    await prisma.realtimeCycleAggregate.upsert({ where: { minuteStartedAt: minute }, create: { minuteStartedAt: minute, ...counts }, update: {
      cycleCount: { increment: 1 }, targetCount: { increment: data.targetCount }, receivedCount: { increment: data.receivedCount }, sourceFailureCount: { increment: data.sourceFailureCount }, staleCount: { increment: data.staleCount },
      publishedCount: { increment: data.publishedCount }, publishFailureCount: { increment: data.publishFailureCount }, savedCount: { increment: data.savedCount }, saveFailureCount: { increment: data.saveFailureCount }, lastCycleFinishedAt: data.finishedAt,
    } });
    await prisma.realtimeWorkerState.update({ where: { id: 'selected-prices' }, data: {
      heartbeatAt: data.finishedAt, marketSession: data.session, lastCycleStartedAt: data.startedAt, lastCycleFinishedAt: data.finishedAt,
      targetCount: data.targetCount, receivedCount: data.receivedCount, sourceFailureCount: data.sourceFailureCount, staleCount: data.staleCount,
      publishedCount: data.publishedCount, publishFailureCount: data.publishFailureCount, savedCount: data.savedCount, saveFailureCount: data.saveFailureCount,
      ...(data.receivedCount ? { lastPriceReceivedAt: data.finishedAt } : {}), ...(data.lastSourcePriceAt ? { lastSourcePriceAt: data.lastSourcePriceAt } : {}),
      ...(data.publishedCount ? { lastSsePublishedAt: data.finishedAt } : {}), ...(data.savedCount ? { lastDbSavedAt: data.finishedAt } : {}),
      lastSourceError: data.sourceError ?? null, lastPublishError: data.publishError ?? null, lastSaveError: data.saveError ?? null,
    } });
    const issues = [
      ...(data.sourceError ? [{ stage: 'SOURCE', message: data.sourceError }] : []),
      ...(data.sourceIssues ?? []).map((issue) => ({ stage: 'SOURCE', symbol: issue.symbol, message: issue.reason })),
      ...(data.publishError ? [{ stage: 'PUBLISH', message: data.publishError }] : []),
      ...(data.saveError ? [{ stage: 'DATABASE', message: data.saveError }] : []),
    ];
    if (issues.length) await prisma.realtimeCollectorIssue.createMany({ data: issues.map((issue) => ({ stage: issue.stage, symbol: 'symbol' in issue ? issue.symbol : null, message: issue.message.slice(0, 1000), occurredAt: data.finishedAt })) });
    await prisma.realtimeCollectorIssue.deleteMany({ where: { id: { notIn: (await prisma.realtimeCollectorIssue.findMany({ orderBy: { occurredAt: 'desc' }, take: 1000, select: { id: true } })).map((x) => x.id) } } });
    await prisma.realtimeCollectorIssue.deleteMany({ where: { occurredAt: { lt: new Date(data.finishedAt.getTime() - 30 * 86_400_000) } } });
    await prisma.realtimeCycleAggregate.deleteMany({ where: { minuteStartedAt: { lt: new Date(data.finishedAt.getTime() - 7 * 86_400_000) } } });
  },
  async stopped(at: Date) {
    await prisma.realtimeWorkerState.updateMany({ where: { id: 'selected-prices', workerToken: token }, data: { workerStatus: 'STOPPED', heartbeatAt: at, marketSession: 'STOPPED' } });
    await prisma.collectorLock.deleteMany({ where: { jobName: 'selected-realtime-prices', ownerToken: token } });
  },
};

if (!await monitor.acquire()) {
  console.error('A realtime collector already holds the worker lock.');
  await prisma.$disconnect();
  process.exit(1);
}
await monitor.heartbeat({ workerStatus: 'RUNNING', marketSession: 'OUT_OF_SESSION', at: new Date() });
const heartbeatTimer = setInterval(() => {
  const now = new Date();
  const session = getRealtimeMarketSession(now, {
    preMarketOpen: config.realtimePreMarketOpen, preMarketClose: config.realtimePreMarketClose,
    regularMarketOpen: config.realtimeRegularMarketOpen, regularMarketClose: config.realtimeRegularMarketClose,
    afterMarketOpen: config.realtimeAfterMarketOpen, afterMarketClose: config.realtimeAfterMarketClose,
  });
  void monitor.heartbeat({ workerStatus: config.realtimeEnabled ? 'RUNNING' : 'DISABLED', marketSession: session ?? 'OUT_OF_SESSION', at: now }).catch(() => {});
}, 15_000);

try {
  const stopCollector = await runRealtimeCollector(repository, provider, {
    enabled: config.realtimeEnabled,
    intervalSeconds: config.realtimeIntervalSeconds,
    dbFlushSeconds: config.realtimeDbFlushSeconds,
    targetRefreshSeconds: config.realtimeTargetRefreshSeconds,
    staleBackoffSeconds: config.realtimeStaleBackoffSeconds,
    maxSecurities: config.realtimeMaxSecurities,
    concurrency: config.realtimeConcurrency,
    marketSessions: {
      preMarketOpen: config.realtimePreMarketOpen,
      preMarketClose: config.realtimePreMarketClose,
      regularMarketOpen: config.realtimeRegularMarketOpen,
      regularMarketClose: config.realtimeRegularMarketClose,
      afterMarketOpen: config.realtimeAfterMarketOpen,
      afterMarketClose: config.realtimeAfterMarketClose,
    },
    apiUrl: config.realtimeApiUrl,
    internalToken: config.realtimeInternalToken,
    requestTimeoutMs: config.requestTimeoutMs,
    monitor,
  });
  const stop = async () => {
    clearInterval(heartbeatTimer);
    try {
      await stopCollector();
    } finally {
      await monitor.stopped(new Date());
      await prisma.$disconnect();
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
} catch (error) {
  clearInterval(heartbeatTimer);
  log('error', 'realtime collector process failed', {
    reason: error instanceof Error ? error.message : String(error),
  });
  await prisma.$disconnect();
  process.exitCode = 1;
}
