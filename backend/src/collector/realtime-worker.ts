import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { loadCollectorConfig } from './config.js';
import { collectorLog as log } from './logger.js';
import { MockPriceProvider } from './providers/mock-price-provider.js';
import { NaverPriceProvider } from './providers/naver-price-provider.js';
import { runRealtimeCollector } from './realtime-price-collector.js';
import { PrismaCollectorRepository } from './repository.js';

const config = loadCollectorConfig();
const repository = new PrismaCollectorRepository(prisma);
const provider = config.provider === 'mock'
  ? new MockPriceProvider()
  : new NaverPriceProvider(config.requestTimeoutMs);

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
  });
  const stop = async () => {
    await stopCollector();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
} catch (error) {
  log('error', 'realtime collector process failed', {
    reason: error instanceof Error ? error.message : String(error),
  });
  await prisma.$disconnect();
  process.exitCode = 1;
}
