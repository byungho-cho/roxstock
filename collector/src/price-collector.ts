import {priceRunResult, skipKind} from '@roxstock/shared/domain/collection-health';
import {CollectionExcluded} from '@roxstock/shared/collection/collection-policy';
import { normalizeProviderSymbol } from '@roxstock/shared/domain/security-symbol';
import { randomUUID } from 'node:crypto';
import { collectorLog as log } from '@roxstock/shared/collection/logger';
import type { CollectorRepository, CollectorRunStatus, PriceProvider, RunCounters } from './types.js';
import { emptyCounters } from './types.js';

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export interface PriceCollectorResult extends RunCounters {
  runId: bigint;
  status: CollectorRunStatus;
  failedSymbols: string[];
  skipReason?: 'LOCK_CONFLICT';
}

export const collectPrices = async (
  repository: CollectorRepository,
  provider: PriceProvider,
  options: { delayMs: number; lockTtlSeconds: number; symbols?: string[]; signal?: AbortSignal; metadata?: Record<string, unknown> },
): Promise<PriceCollectorResult> => {
  const deadline = Date.now() + 120 * 60000;
  const jobName = 'market-prices';
  const owner = randomUUID();
  const counters = emptyCounters();
  const failedSymbols: string[] = [];
  let excluded = 0;
  const locked = await repository.acquireLock(jobName, owner, options.lockTtlSeconds);
  let runId:bigint;
  try{runId=await repository.createRun(jobName, provider.name, { ...options.metadata, owner });}
  catch(error){if(locked)await repository.releaseLock(jobName,owner);throw error;}
  if (!locked) {
    counters.skipped = 1;
    await repository.addRunItem(runId, { symbol: '*', status: 'SKIPPED', message: 'another execution holds the collector lock' });
    await repository.finishRun(runId, 'SKIPPED', counters);
    log('warn', 'price collection skipped: duplicate execution', { runId });
    return { runId, status: 'SKIPPED', skipReason: 'LOCK_CONFLICT', failedSymbols, ...counters };
  }

  log('info', 'price collection started', { runId, provider: provider.name });
  let status: CollectorRunStatus = 'FAILED';
  try {
    const activeSecurities = repository.listPriceTargets ? await repository.listPriceTargets() : await repository.listActiveSecurities();
    const requestedSymbols = new Set(options.symbols?.map((symbol) => normalizeProviderSymbol(symbol)));
    const securities = requestedSymbols.size === 0
      ? activeSecurities
      : activeSecurities.filter((security) => requestedSymbols.has(normalizeProviderSymbol(security.symbol)));
    const missingSymbols = [...requestedSymbols].filter((symbol) => !securities.some(
      (security) => normalizeProviderSymbol(security.symbol) === symbol,
    ));
    for (const symbol of missingSymbols) {
      counters.skipped += 1;
      await repository.addRunItem(runId, { symbol, status: 'SKIPPED', message: 'requested symbol is not an active security' });
      log('warn', 'requested price symbol skipped', { runId, symbol });
    }
    for (const [index, security] of securities.entries()) {
      if(options.signal?.aborted) throw new Error("COLLECTOR_PROCESS_STOPPING: graceful shutdown requested");
      if(Date.now()>deadline) throw new Error("COLLECTOR_EXECUTION_TIMEOUT: two hour limit exceeded");
      if(repository.renewLock && !await repository.renewLock(jobName,owner,options.lockTtlSeconds)) throw new Error("COLLECTOR_LOCK_LOST: owner lease no longer valid");
      try {
       const work=async()=>{
        if(security.symbol.toUpperCase().startsWith('Z99'))throw new CollectionExcluded('Z99 코드: 수집 제외');
        const observation = await provider.fetchPrice(security);
        if(repository.renewLock && !await repository.renewLock(jobName,owner,options.lockTtlSeconds)) throw new Error("COLLECTOR_LOCK_LOST: source response discarded");
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
       };
       if(repository.withTarget)await repository.withTarget(security,'market-prices',work);else await work();
      } catch (error) {
        if(error instanceof Error && error.message.startsWith("COLLECTOR_LOCK_LOST"))throw error;
        if(error instanceof CollectionExcluded){if(skipKind(error.message)==='EXCLUDED')excluded++;counters.skipped++;await repository.addRunItem(runId,{securityId:security.id,symbol:security.symbol,status:'SKIPPED',message:error.message});continue;}
        counters.failed += 1;
        failedSymbols.push(security.symbol);
        const reason = messageOf(error);
        await repository.addRunItem(runId, { securityId: security.id, symbol: security.symbol, status: 'FAILED', message: reason.slice(0, 1000) });
        log('error', 'price collection failed for security', { runId, symbol: security.symbol, reason });
      }
      if (index < securities.length - 1 && options.delayMs > 0) await sleep(options.delayMs);
    }
    status = priceRunResult(counters, excluded);
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
