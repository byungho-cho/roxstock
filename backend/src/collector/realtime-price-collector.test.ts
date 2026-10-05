import assert from 'node:assert/strict';
import test from 'node:test';
import { RealtimePriceCache } from '../realtime/price-cache.js';
import { collectRealtimeCycle, getRealtimeMarketSession, type RealtimeMarketSessions } from './realtime-price-collector.js';
import type { PriceObservation, PriceProvider, RealtimePriceValue, SecurityTarget } from './types.js';

const target = (id: bigint, symbol: string): SecurityTarget => ({ id, symbol, name: symbol });
const price = (symbol: string, currentPrice: string, observedAt = '2026-09-28T01:00:00.000Z'): PriceObservation => ({
  symbol,
  currentPrice,
  previousClosePrice: '900',
  observedAt: new Date(observedAt),
  marketStatus: 'OPEN',
  freshness: 'CURRENT',
});

test('realtime cycle keeps successes when one symbol fails', async () => {
  const cache = new Map<string, RealtimePriceValue>();
  let published: RealtimePriceValue[] = [];
  const provider: PriceProvider = {
    name: 'test',
    fetchPrice: async (security) => {
      if (security.symbol === '000660') throw new Error('source failure');
      return price(security.symbol, '1000');
    },
  };
  const result = await collectRealtimeCycle(
    [target(1n, '005930'), target(2n, '000660')], provider, cache, 2,
    async (values) => { published = values; },
  );
  assert.equal(result.success, 1);
  assert.equal(result.failed, 1);
  assert.equal(published[0]?.symbol, '005930');
  assert.equal(cache.get('005930')?.currentPrice, '1000');
});

test('realtime cycle rejects stale provider data and older observations', async () => {
  const cache = new Map<string, RealtimePriceValue>();
  cache.set('005930', { ...price('005930', '1100', '2026-09-28T01:00:10.000Z'), securityId: 1n, name: 'Samsung' });
  const provider: PriceProvider = { name: 'test', fetchPrice: async () => price('005930', '900', '2026-09-28T01:00:00.000Z') };
  const oldResult = await collectRealtimeCycle([target(1n, '005930')], provider, cache, 1, async () => undefined);
  assert.equal(oldResult.success, 0);
  assert.equal(cache.get('005930')?.currentPrice, '1100');

  provider.fetchPrice = async () => ({ ...price('005930', '1200'), freshness: 'STALE' });
  const staleResult = await collectRealtimeCycle([target(1n, '005930')], provider, cache, 1, async () => undefined);
  assert.equal(staleResult.stale, 1);
  assert.equal(cache.get('005930')?.currentPrice, '1100');
});

test('API publish failure does not discard collected prices', async () => {
  const cache = new Map<string, RealtimePriceValue>();
  const provider: PriceProvider = { name: 'test', fetchPrice: async (security) => price(security.symbol, '1000') };
  const result = await collectRealtimeCycle([target(1n, '005930')], provider, cache, 1, async () => { throw new Error('api down'); });
  assert.equal(result.success, 1);
  assert.equal(result.published, 0);
  assert.equal(result.publishError, 'api down');
  assert.equal(cache.size, 1);
});

const sessions: RealtimeMarketSessions = {
  preMarketOpen: '08:00', preMarketClose: '08:50',
  regularMarketOpen: '09:00', regularMarketClose: '15:30',
  afterMarketOpen: '15:40', afterMarketClose: '20:00',
};

test('market sessions use Asia/Seoul weekdays and preserve transition gaps', () => {
  assert.equal(getRealtimeMarketSession(new Date('2026-09-27T23:10:00Z'), sessions), 'PRE_MARKET');
  assert.equal(getRealtimeMarketSession(new Date('2026-09-27T23:55:00Z'), sessions), null);
  assert.equal(getRealtimeMarketSession(new Date('2026-09-28T01:00:00Z'), sessions), 'REGULAR');
  assert.equal(getRealtimeMarketSession(new Date('2026-09-28T06:35:00Z'), sessions), null);
  assert.equal(getRealtimeMarketSession(new Date('2026-09-28T07:00:00Z'), sessions), 'AFTER_MARKET');
  assert.equal(getRealtimeMarketSession(new Date('2026-09-27T01:00:00Z'), sessions), null);
});

test('realtime API cache validates input and prevents older overwrite', () => {
  const cache = new RealtimePriceCache();
  const base = {
    securityId: '1', symbol: '005930', name: 'Samsung', currentPrice: '1000', previousClosePrice: '900',
    observedAt: '2026-09-28T01:00:10.000Z', marketStatus: 'OPEN',
  };
  assert.equal(cache.ingest([base]).length, 1);
  assert.equal(cache.ingest([{ ...base, currentPrice: '900', observedAt: '2026-09-28T01:00:00.000Z' }]).length, 0);
  assert.equal(cache.ingest([{ ...base, currentPrice: '0' }]).length, 0);
  assert.equal(cache.get()[0]?.currentPrice, '1000');
});
