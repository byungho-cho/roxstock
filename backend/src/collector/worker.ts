import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { loadCollectorConfig } from './config.js';
import { collectorLog as log } from './logger.js';
import { collectPrices } from './price-collector.js';
import { MockPriceProvider } from './providers/mock-price-provider.js';
import { NaverPriceProvider } from './providers/naver-price-provider.js';
import { DataGoKrSecurityProvider } from './providers/data-go-kr-security-provider.js';
import { PrismaCollectorRepository } from './repository.js';
import { collectSecurityMaster } from './security-master-collector.js';
import { collectDailyAccountSnapshots } from './snapshot-collector.js';
import { getSeoulClock, snapshotScheduleKey } from './time.js';

const config = loadCollectorConfig();
const repository = new PrismaCollectorRepository(prisma);
const provider = config.provider === 'mock'
  ? new MockPriceProvider()
  : new NaverPriceProvider(config.requestTimeoutMs);

const runPrices = (symbols?: string[]) => collectPrices(repository, provider, {
  delayMs: config.providerDelayMs,
  lockTtlSeconds: Math.max(config.lockTtlSeconds, 7200),
  symbols,
});
const runScheduledPrices = (scheduleDate: string, attempt: 'primary' | 'partial-retry' | 'outage-retry', symbols?: string[]) =>
  collectPrices(repository, provider, {
    delayMs: config.providerDelayMs,
    lockTtlSeconds: Math.max(config.lockTtlSeconds, 7200),
    symbols,
    metadata: { scheduleDate, attempt },
  });
const runSnapshots = (now = new Date()) => collectDailyAccountSnapshots(repository, {
  lockTtlSeconds: config.lockTtlSeconds,
  now,
});
const runSecurities = () => {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!serviceKey) throw new Error('DATA_GO_KR_SERVICE_KEY is required for security master collection');
  const securityProvider = new DataGoKrSecurityProvider({
    serviceKey,
    endpoint: config.securityMasterEndpoint,
    timeoutMs: config.requestTimeoutMs,
    pageSize: config.securityMasterPageSize,
    lookbackDays: config.securityMasterLookbackDays,
  });
  return collectSecurityMaster(repository, securityProvider, {
    lockTtlSeconds: config.lockTtlSeconds,
    deactivateMissing: config.securityMasterDeactivateMissing,
    minimumExpectedCount: config.securityMasterMinimumCount,
  });
};

const once = async (target: string, symbolArgument?: string): Promise<void> => {
  if (target === 'prices') await runPrices(symbolArgument?.split(',').map((symbol) => symbol.trim()).filter(Boolean));
  else if (target === 'snapshots') await runSnapshots();
  else if (target === 'securities') await runSecurities();
  else if (target === 'all') { await runSecurities(); await runPrices(); await runSnapshots(); }
  else throw new Error('usage: worker.ts [daemon|securities|prices [005930,005380]|snapshots|all]');
};

const daemon = async (): Promise<void> => {
  let completedPriceDate = '';
  let outageRetryDate = '';
  let outageRetryAt = 0;
  let lastSnapshotKey = '';
  let lastSecurityMasterKey = '';
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    const now = new Date();
    const clock = getSeoulClock(now);
    try {
      if (clock.hour >= config.priceCollectionHour && clock.dateKey !== completedPriceDate) {
        const alreadyCompleted = await repository.hasCompletedScheduledPriceRun(clock.dateKey);
        if (alreadyCompleted) {
          completedPriceDate = clock.dateKey;
        } else if (outageRetryDate === clock.dateKey && outageRetryAt > 0 && now.getTime() >= outageRetryAt) {
          await runScheduledPrices(clock.dateKey, 'outage-retry');
          completedPriceDate = clock.dateKey;
          outageRetryDate = '';
          outageRetryAt = 0;
        } else if (outageRetryDate !== clock.dateKey) {
          const result = await runScheduledPrices(clock.dateKey, 'primary');
          if (result.status === 'PARTIAL' && result.failedSymbols.length > 0) {
            await runScheduledPrices(clock.dateKey, 'partial-retry', result.failedSymbols);
            completedPriceDate = clock.dateKey;
          } else if (result.status === 'FAILED' && result.failed > 0 && result.success === 0 && result.stale === 0) {
            outageRetryDate = clock.dateKey;
            outageRetryAt = now.getTime() + config.priceRetryDelayMinutes * 60 * 1000;
            log('warn', 'full price source outage scheduled for one retry', {
              scheduleDate: clock.dateKey,
              retryAt: new Date(outageRetryAt).toISOString(),
            });
          } else {
            completedPriceDate = clock.dateKey;
          }
        }
      }
      const snapshotKey = snapshotScheduleKey(now);
      if (config.snapshotHours.includes(clock.hour) && snapshotKey !== lastSnapshotKey) {
        lastSnapshotKey = snapshotKey;
        await runSnapshots(now);
      }
      if (clock.hour === config.securityMasterHour && clock.dateKey !== lastSecurityMasterKey) {
        lastSecurityMasterKey = clock.dateKey;
        await runSecurities();
      }
    } catch (error) {
      log('error', 'collector scheduler tick failed', { reason: error instanceof Error ? error.message : String(error) });
    } finally {
      ticking = false;
    }
  };
  log('info', 'collector scheduler started', { timezone: 'Asia/Seoul', config });
  await tick();
  const timer = setInterval(() => void tick(), config.schedulerTickSeconds * 1000);
  const stop = async () => { clearInterval(timer); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
};

const target = process.argv[2] ?? 'daemon';
try {
  if (target === 'daemon') await daemon();
  else { await once(target, process.argv[3]); await prisma.$disconnect(); }
} catch (error) {
  log('error', 'collector process failed', { reason: error instanceof Error ? error.message : String(error) });
  await prisma.$disconnect();
  process.exitCode = 1;
}
