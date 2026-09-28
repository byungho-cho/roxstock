import { collectorLog as log } from './logger.js';
import { getSeoulClock } from './time.js';
import type {
  CollectorRepository,
  PriceObservation,
  PriceProvider,
  RealtimePriceValue,
  SecurityTarget,
} from './types.js';

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export interface RealtimeCollectorOptions {
  enabled: boolean;
  intervalSeconds: number;
  dbFlushSeconds: number;
  targetRefreshSeconds: number;
  staleBackoffSeconds: number;
  maxSecurities: number;
  concurrency: number;
  marketSessions: RealtimeMarketSessions;
  apiUrl: string;
  internalToken: string;
  requestTimeoutMs: number;
}

export type RealtimeMarketSession = 'PRE_MARKET' | 'REGULAR' | 'AFTER_MARKET';
export interface RealtimeMarketSessions {
  preMarketOpen: string;
  preMarketClose: string;
  regularMarketOpen: string;
  regularMarketClose: string;
  afterMarketOpen: string;
  afterMarketClose: string;
}

export interface RealtimeCycleResult {
  targetCount: number;
  success: number;
  failed: number;
  stale: number;
  published: number;
  publishError?: string;
  failures: Array<{ symbol: string; reason: string }>;
}

export type RealtimePublisher = (values: RealtimePriceValue[]) => Promise<void>;

const minuteOfDay = (value: string): number => {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 60 + Number(minute);
};

export const getRealtimeMarketSession = (
  now: Date,
  sessions: RealtimeMarketSessions,
): RealtimeMarketSession | null => {
  const clock = getSeoulClock(now);
  const weekday = new Date(`${clock.dateKey}T00:00:00.000Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return null;
  const current = clock.hour * 60 + clock.minute;
  if (current >= minuteOfDay(sessions.preMarketOpen) && current < minuteOfDay(sessions.preMarketClose)) return 'PRE_MARKET';
  if (current >= minuteOfDay(sessions.regularMarketOpen) && current <= minuteOfDay(sessions.regularMarketClose)) return 'REGULAR';
  if (current >= minuteOfDay(sessions.afterMarketOpen) && current < minuteOfDay(sessions.afterMarketClose)) return 'AFTER_MARKET';
  return null;
};

const mapConcurrent = async <T>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<void>,
): Promise<void> => {
  let index = 0;
  const worker = async () => {
    while (index < values.length) {
      const current = values[index];
      index += 1;
      if (current !== undefined) await callback(current);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
};

export const collectRealtimeCycle = async (
  targets: SecurityTarget[],
  provider: PriceProvider,
  cache: Map<string, RealtimePriceValue>,
  concurrency: number,
  publish: RealtimePublisher,
): Promise<RealtimeCycleResult> => {
  const currentValues: RealtimePriceValue[] = [];
  const failures: Array<{ symbol: string; reason: string }> = [];
  let stale = 0;

  await mapConcurrent(targets, concurrency, async (target) => {
    try {
      const observation = await provider.fetchPrice(target);
      if (observation.freshness === 'STALE') {
        stale += 1;
        return;
      }
      const value: RealtimePriceValue = { ...observation, securityId: target.id, name: target.name };
      const prior = cache.get(target.symbol);
      if (!prior || value.observedAt.getTime() >= prior.observedAt.getTime()) {
        cache.set(target.symbol, value);
        currentValues.push(value);
      }
    } catch (error) {
      failures.push({ symbol: target.symbol, reason: messageOf(error).slice(0, 1000) });
    }
  });

  let published = 0;
  let publishError: string | undefined;
  if (currentValues.length > 0) {
    try {
      await publish(currentValues);
      published = currentValues.length;
    } catch (error) {
      publishError = messageOf(error).slice(0, 1000);
    }
  }
  return {
    targetCount: targets.length,
    success: currentValues.length,
    failed: failures.length,
    stale,
    published,
    ...(publishError && { publishError }),
    failures,
  };
};

export const createHttpRealtimePublisher = (
  url: string,
  token: string,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): RealtimePublisher => async (values) => {
  if (!token) throw new Error('COLLECTOR_INTERNAL_TOKEN is required for realtime publishing');
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prices: values.map((value) => ({
      securityId: value.securityId.toString(),
      symbol: value.symbol,
      name: value.name,
      currentPrice: value.currentPrice,
      previousClosePrice: value.previousClosePrice,
      observedAt: value.observedAt.toISOString(),
      marketStatus: value.marketStatus,
    })) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Realtime API publish returned HTTP ${response.status}`);
};

export const runRealtimeCollector = async (
  repository: CollectorRepository,
  provider: PriceProvider,
  options: RealtimeCollectorOptions,
): Promise<() => Promise<void>> => {
  let stopped = false;
  let targets: SecurityTarget[] = [];
  let targetRefreshAt = 0;
  let dbFlushAt = 0;
  let staleBackoffUntil = 0;
  const cache = new Map<string, RealtimePriceValue>();
  const publish = createHttpRealtimePublisher(options.apiUrl, options.internalToken, options.requestTimeoutMs);

  const loop = async () => {
    log('info', 'realtime price collector started', {
      provider: provider.name,
      intervalSeconds: options.intervalSeconds,
      dbFlushSeconds: options.dbFlushSeconds,
      maxSecurities: options.maxSecurities,
      concurrency: options.concurrency,
      marketSessions: options.marketSessions,
      timezone: 'Asia/Seoul',
    });
    while (!stopped) {
      const cycleStartedAt = Date.now();
      const marketSession = getRealtimeMarketSession(new Date(cycleStartedAt), options.marketSessions);
      if (!options.enabled || marketSession === null) {
        await sleep(options.intervalSeconds * 1000);
        continue;
      }
      if (cycleStartedAt < staleBackoffUntil) {
        await sleep(Math.min(options.intervalSeconds * 1000, staleBackoffUntil - cycleStartedAt));
        continue;
      }
      try {
        if (cycleStartedAt >= targetRefreshAt) {
          targets = await repository.listRealtimeSecurities(options.maxSecurities);
          targetRefreshAt = cycleStartedAt + options.targetRefreshSeconds * 1000;
        }
        const result = await collectRealtimeCycle(targets, provider, cache, options.concurrency, publish);
        if (result.targetCount > 0 && result.stale === result.targetCount) {
          staleBackoffUntil = cycleStartedAt + options.staleBackoffSeconds * 1000;
          log('warn', 'all realtime prices are stale; applying source backoff', {
            staleBackoffSeconds: options.staleBackoffSeconds,
          });
        }
        if (cycleStartedAt >= dbFlushAt && cache.size > 0) {
          const stored = await repository.upsertRealtimeMarketPrices([...cache.values()]);
          dbFlushAt = cycleStartedAt + options.dbFlushSeconds * 1000;
          log('info', 'realtime price cache flushed', { cached: cache.size, stored });
        }
        log(result.failed > 0 ? 'warn' : 'info', 'realtime price cycle finished', {
          durationMs: Date.now() - cycleStartedAt,
          marketSession,
          ...result,
        });
        if (result.publishError) log('warn', 'realtime price API publish failed', { reason: result.publishError });
        for (const failure of result.failures) {
          log('error', 'realtime price failed for security', failure);
        }
      } catch (error) {
        log('error', 'realtime price cycle aborted', { reason: messageOf(error) });
      }
      const remaining = options.intervalSeconds * 1000 - (Date.now() - cycleStartedAt);
      if (remaining > 0) await sleep(remaining);
    }
    if (cache.size > 0) await repository.upsertRealtimeMarketPrices([...cache.values()]);
    log('info', 'realtime price collector stopped');
  };

  const running = loop();
  return async () => {
    stopped = true;
    await running;
  };
};
