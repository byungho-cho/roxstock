import assert from 'node:assert/strict';
import test from 'node:test';
import { createSerialExecutor, retryConflict, RealtimeLockLostError } from './realtime-lifecycle.js';
import { collectRealtimeCycle, runRealtimeCollector } from './realtime-price-collector.js';
import type { CollectorRepository, PriceProvider } from './types.js';

test('state operations serialize and a rejection does not poison the queue', async () => {
  const serial = createSerialExecutor(); let active = 0; let maximum = 0;
  const work = (fail = false) => serial(async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5)); active--;
    if (fail) throw new Error('test');
  });
  const result = await Promise.allSettled([work(), work(true), work()]);
  assert.equal(maximum, 1); assert.equal(result[1]?.status, 'rejected'); assert.equal(result[2]?.status, 'fulfilled');
});
test('only transient conflicts retry, with a three-attempt limit', async () => {
  let attempts = 0;
  await assert.rejects(retryConflict(async () => { attempts++; throw new Error('MariaDB error 1020'); }));
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(retryConflict(async () => { attempts++; throw new RealtimeLockLostError(); }));
  assert.equal(attempts, 1);
});
test('background idle heartbeat failure is supervised immediately and stop drains', async () => {
  let resolveFatal!: (error: unknown) => void;
  const fatal = new Promise<unknown>((resolve) => { resolveFatal = resolve; });
  const stop = await runRealtimeCollector({} as CollectorRepository, { name: 'test' } as PriceProvider, {
    enabled: false, intervalSeconds: 60, dbFlushSeconds: 60, targetRefreshSeconds: 60, staleBackoffSeconds: 60,
    maxSecurities: 35, concurrency: 2, apiUrl: '', internalToken: '', requestTimeoutMs: 100,
    marketSessions: { preMarketOpen: '08:00', preMarketClose: '08:50', regularMarketOpen: '09:00', regularMarketClose: '15:30', afterMarketOpen: '15:40', afterMarketClose: '20:00' },
    monitor: { heartbeat: async () => { throw new Error('injected 1020'); }, cycle: async () => {}, stopped: async () => {} },
    onFatal: resolveFatal,
  });
  assert.match(String(await fatal), /1020/); await stop();
});
test('external heartbeat removes duplicate idle writes and sleep is interruptible', async () => {
  let writes = 0;
  const stop = await runRealtimeCollector({} as CollectorRepository, { name: 'test' } as PriceProvider, {
    enabled: false, externalHeartbeat: true, intervalSeconds: 60, dbFlushSeconds: 60, targetRefreshSeconds: 60, staleBackoffSeconds: 60,
    maxSecurities: 35, concurrency: 2, apiUrl: '', internalToken: '', requestTimeoutMs: 100,
    marketSessions: { preMarketOpen: '08:00', preMarketClose: '08:50', regularMarketOpen: '09:00', regularMarketClose: '15:30', afterMarketOpen: '15:40', afterMarketClose: '20:00' },
    monitor: { heartbeat: async () => { writes++; }, cycle: async () => {}, stopped: async () => {} },
  });
  await stop(); assert.equal(writes, 0);
});
test('lease loss after source receipt prevents publish', async () => {
  let published = 0;
  await assert.rejects(collectRealtimeCycle([{ id: 1n, symbol: '005930', name: 'test' }], {
    name: 'test', fetchPrice: async () => ({ symbol: '005930', currentPrice: '1000', previousClosePrice: '900', observedAt: new Date(), marketStatus: 'OPEN', freshness: 'CURRENT' }),
  }, new Map(), 1, async () => { published++; }, async () => { throw new RealtimeLockLostError(); }), RealtimeLockLostError);
  assert.equal(published, 0);
});
