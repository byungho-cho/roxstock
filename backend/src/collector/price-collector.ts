import { randomUUID } from 'node:crypto';
import { collectorLog as log } from './logger.js';
import type { CollectorRepository, CollectorRunStatus, PriceProvider, RunCounters } from './types.js';
import { emptyCounters } from './types.js';

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export interface PriceCollectorResult extends RunCounters {
  runId: bigint;
  status: CollectorRunStatus;
  failedSymbols: string[];
}

export const collectPrices = async (
  repository: CollectorRepository,
  provider: PriceProvider,
  options: { delayMs: number; lockTtlSeconds: number; symbols?: string[]; metadata?: Record<string, unknown> },
): Promise<PriceCollectorResult> => {
  const jobName = 'market-prices';
  const owner = randomUUID();
  const counters = emptyCounters();
  const failedSymbols: string[] = [];
  const locked = await repository.acquireLock(jobName, owner, options.lockTtlSeconds);
  const runId = await repository.createRun(jobName, provider.name, { owner, ...options.metadata });
  if (!locked) {
    counters.skipped = 1;
    await repository.addRunItem(runId, { symbol: '*', status: 'SKIPPED', message: 'another execution holds the collector lock' });
    await repository.finishRun(runId, 'SKIPPED', counters);
    log('warn', 'price collection skipped: duplicate execution', { runId });
    return { runId, status: 'SKIPPED', failedSymbols, ...counters };
  }

  log('info', 'price collection started', { runId, provider: provider.name });
  let status: CollectorRunStatus = 'FAILED';
  try {
    const activeSecurities = await repository.listActiveSecurities();
    const requestedSymbols = new Set(options.symbols?.map((symbol) => symbol.trim().toUpperCase().replace(/^A(?=\d{6}$)/, '')));
    const securities = requestedSymbols.size === 0
      ? activeSecurities
      : activeSecurities.filter((security) => requestedSymbols.has(security.symbol.toUpperCase().replace(/^A(?=\d{6}$)/, '')));
    const missingSymbols = [...requestedSymbols].filter((symbol) => !securities.some(
      (security) => security.symbol.toUpperCase().replace(/^A(?=\d{6}$)/, '') === symbol,
    ));
    for (const symbol of missingSymbols) {
      counters.skipped += 1;
      await repository.addRunItem(runId, { symbol, status: 'SKIPPED', message: 'requested symbol is not an active security' });
      log('warn', 'requested price symbol skipped', { runId, symbol });
    }
    for (const [index, security] of securities.entries()) {
      try {
        const observation = await provider.fetchPrice(security);
        if (observation.freshness === 'STALE') {
          counters.stale += 1;
          await repository.addRunItem(runId, {
            securityId: security.id, symbol: security.symbol, status: 'STALE',
            message: observation.freshnessReason ?? 'provider data was not updated', observedAt: observation.observedAt,
          });
          log('warn', 'stale price ignored', { runId, symbol: security.symbol, reason: observation.freshnessReason });
        } else {
          await repository.upsertMarketPrice(security.id, observation);
          counters.success += 1;
          await repository.addRunItem(runId, { securityId: security.id, symbol: security.symbol, status: 'SUCCESS', observedAt: observation.observedAt });
          log('info', 'price stored', { runId, symbol: security.symbol, currentPrice: observation.currentPrice });
        }
      } catch (error) {
        counters.failed += 1;
        failedSymbols.push(security.symbol);
        const reason = messageOf(error);
        await repository.addRunItem(runId, { securityId: security.id, symbol: security.symbol, status: 'FAILED', message: reason.slice(0, 1000) });
        log('error', 'price collection failed for security', { runId, symbol: security.symbol, reason });
      }
      if (index < securities.length - 1 && options.delayMs > 0) await sleep(options.delayMs);
    }
    status = securities.length === 0 || (counters.stale > 0 && counters.success === 0 && counters.failed === 0) ? 'SKIPPED'
      : counters.success === securities.length && counters.skipped === 0 ? 'SUCCESS'
      : counters.success > 0 ? 'PARTIAL'
      : 'FAILED';
    await repository.finishRun(runId, status, counters, status === 'FAILED' ? 'no current price was stored' : undefined);
    log('info', 'price collection finished', { runId, status, ...counters });
    return { runId, status, failedSymbols, ...counters };
  } catch (error) {
    const reason = messageOf(error);
    await repository.finishRun(runId, 'FAILED', counters, reason.slice(0, 1000));
    log('error', 'price collection aborted', { runId, reason });
    throw error;
  } finally {
    await repository.releaseLock(jobName, owner);
  }
};
