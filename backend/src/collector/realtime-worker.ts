import 'dotenv/config';
import { createRealtimeMonitor } from './realtime-monitor.js';
import { safeErrorCode } from './realtime-lifecycle.js';
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
const monitor = createRealtimeMonitor(prisma, token);
let stopping = false;
let stopCollector: (() => Promise<void>) | undefined;
let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeatInFlight: Promise<void> = Promise.resolve();
let wakeStandby: (() => void) | undefined;
let shutdownPromise: Promise<void> | undefined;

const shutdown = (failed = false): Promise<void> => {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  clearTimeout(heartbeatTimer);
  wakeStandby?.();
  shutdownPromise = (async () => {
    const collectorDrain = stopCollector?.();
    try {
      await heartbeatInFlight.catch((error: unknown) => { log('warn', 'realtime heartbeat drained with failure', { code: safeErrorCode(error) }); });
      await collectorDrain;
    } catch (error) {
      log('error', 'realtime shutdown drain failed', { code: safeErrorCode(error) });
    } finally {
      try { await monitor.stopped(new Date()); }
      catch (error) { log('error', 'realtime lock release failed', { code: safeErrorCode(error) }); }
      finally { await prisma.$disconnect(); process.exitCode = failed ? 1 : 0; }
    }
  })();
  return shutdownPromise;
};
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
const fail = (error: unknown) => {
  log('error', 'realtime worker degraded; stopping safely', { code: safeErrorCode(error) });
  void shutdown(true);
};
const sessions = {
  preMarketOpen: config.realtimePreMarketOpen, preMarketClose: config.realtimePreMarketClose,
  regularMarketOpen: config.realtimeRegularMarketOpen, regularMarketClose: config.realtimeRegularMarketClose,
  afterMarketOpen: config.realtimeAfterMarketOpen, afterMarketClose: config.realtimeAfterMarketClose,
};
const heartbeat = () => {
  if (stopping) return;
  heartbeatInFlight = monitor.heartbeat({ workerStatus: config.realtimeEnabled ? 'RUNNING' : 'DISABLED', marketSession: getRealtimeMarketSession(new Date(), sessions) ?? 'OUT_OF_SESSION', at: new Date() });
  void heartbeatInFlight.then(() => {
    if (!stopping) heartbeatTimer = setTimeout(heartbeat, 15_000);
  }, fail);
};
try {
  // A valid competing lease is normal standby, not a process crash.
  while (!stopping && !await monitor.acquire()) {
    log('info', 'realtime worker waiting for existing lease');
    await new Promise<void>((resolve) => { wakeStandby = resolve; heartbeatTimer = setTimeout(() => { wakeStandby = undefined; resolve(); }, 5000 + Math.floor(Math.random() * 1000)); });
  }
  if (!stopping) {
    await monitor.heartbeat({ workerStatus: 'RUNNING', marketSession: 'OUT_OF_SESSION', at: new Date() });
    if (stopping) throw new Error('STARTUP_STOPPED');
    stopCollector = await runRealtimeCollector(repository, provider, {
      enabled: config.realtimeEnabled, intervalSeconds: config.realtimeIntervalSeconds,
      dbFlushSeconds: config.realtimeDbFlushSeconds, targetRefreshSeconds: config.realtimeTargetRefreshSeconds,
      staleBackoffSeconds: config.realtimeStaleBackoffSeconds, maxSecurities: config.realtimeMaxSecurities,
      concurrency: config.realtimeConcurrency, marketSessions: sessions, apiUrl: config.realtimeApiUrl,
      internalToken: config.realtimeInternalToken, requestTimeoutMs: config.requestTimeoutMs,
      monitor, externalHeartbeat: true, onFatal: fail,
    });
    if (stopping) await stopCollector();
    else heartbeatTimer = setTimeout(heartbeat, 15_000);
  }
} catch (error) { fail(error); }
