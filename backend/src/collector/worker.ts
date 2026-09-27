import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { loadCollectorConfig } from './config.js';
import { collectorLog as log } from './logger.js';
import { collectPrices } from './price-collector.js';
import { MockPriceProvider } from './providers/mock-price-provider.js';
import { NaverPriceProvider } from './providers/naver-price-provider.js';
import { PrismaCollectorRepository } from './repository.js';
import { collectDailyAccountSnapshots } from './snapshot-collector.js';
import { getSeoulClock, isHourInOvernightWindow, priceScheduleKey, snapshotScheduleKey } from './time.js';

const config = loadCollectorConfig();
const repository = new PrismaCollectorRepository(prisma);
const provider = config.provider === 'mock'
  ? new MockPriceProvider()
  : new NaverPriceProvider(config.requestTimeoutMs);

const runPrices = () => collectPrices(repository, provider, {
  delayMs: config.providerDelayMs,
  lockTtlSeconds: config.lockTtlSeconds,
});
const runSnapshots = (now = new Date()) => collectDailyAccountSnapshots(repository, {
  lockTtlSeconds: config.lockTtlSeconds,
  now,
});

const once = async (target: string): Promise<void> => {
  if (target === 'prices') await runPrices();
  else if (target === 'snapshots') await runSnapshots();
  else if (target === 'all') { await runPrices(); await runSnapshots(); }
  else throw new Error('usage: worker.ts [daemon|prices|snapshots|all]');
};

const daemon = async (): Promise<void> => {
  let lastPriceKey = '';
  let lastSnapshotKey = '';
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    const now = new Date();
    const clock = getSeoulClock(now);
    try {
      const priceKey = priceScheduleKey(now, config.priceIntervalMinutes);
      if (isHourInOvernightWindow(clock.hour, config.priceWindowStartHour, config.priceWindowEndHour) && priceKey !== lastPriceKey) {
        lastPriceKey = priceKey;
        await runPrices();
      }
      const snapshotKey = snapshotScheduleKey(now);
      if (config.snapshotHours.includes(clock.hour) && snapshotKey !== lastSnapshotKey) {
        lastSnapshotKey = snapshotKey;
        await runSnapshots(now);
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
  else { await once(target); await prisma.$disconnect(); }
} catch (error) {
  log('error', 'collector process failed', { reason: error instanceof Error ? error.message : String(error) });
  await prisma.$disconnect();
  process.exitCode = 1;
}
