import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPrices } from './price-collector.js';
import { collectDailyAccountSnapshots } from './snapshot-collector.js';
import { parseNaverPrice } from './providers/naver-price-provider.js';
import { parseSecurityMasterResponse } from './providers/data-go-kr-security-provider.js';
import { collectSecurityMaster } from './security-master-collector.js';
import type {
  CollectorRepository, CollectorRunStatus, PriceObservation, PriceProvider, RunCounters, RunItemInput,
  SecurityMasterItem, SecurityTarget, SnapshotAccount, SnapshotValue,
} from './types.js';

class MemoryRepository implements CollectorRepository {
  locked = false;
  securities: SecurityTarget[] = [];
  accounts: SnapshotAccount[] = [];
  prices = new Map<bigint, PriceObservation>();
  snapshots = new Map<string, SnapshotValue>();
  items: RunItemInput[] = [];
  finishes: Array<{ status: CollectorRunStatus; counters: RunCounters }> = [];
  nextRun = 1n;
  async acquireLock() { if (this.locked) return false; this.locked = true; return true; }
  async releaseLock() { this.locked = false; }
  async createRun() { return this.nextRun++; }
  async finishRun(_id: bigint, status: CollectorRunStatus, counters: RunCounters) { this.finishes.push({ status, counters: { ...counters } }); }
  async addRunItem(_id: bigint, item: RunItemInput) { this.items.push(item); }
  async hasCompletedScheduledPriceRun() { return false; }
  async listActiveSecurities() { return this.securities; }
  securityMaster = new Map<string, SecurityMasterItem>();
  async upsertSecurityMaster(items: SecurityMasterItem[]) { for (const item of items) this.securityMaster.set(`${item.marketType}:${item.symbol}`, item); }
  async deactivateMissingSecurities() { return 0; }
  async upsertMarketPrice(id: bigint, observation: PriceObservation) { this.prices.set(id, observation); }
  async listActiveAccountsForSnapshot() { return this.accounts; }
  async upsertDailyAccountSnapshot(id: bigint, date: Date, value: SnapshotValue) { this.snapshots.set(`${id}:${date.toISOString()}`, value); }
}

const security = (id: bigint, symbol: string): SecurityTarget => ({ id, symbol, name: symbol });
const observation = (symbol: string, price: string): PriceObservation => ({
  symbol, currentPrice: price, previousClosePrice: '900', observedAt: new Date('2026-09-27T01:00:00Z'),
  marketStatus: 'OPEN', freshness: 'CURRENT',
});

test('successful price run and rerun UPSERT one row per security', async () => {
  const repository = new MemoryRepository();
  repository.securities = [security(1n, '005930')];
  let price = '1000';
  const provider: PriceProvider = { name: 'test', fetchPrice: async (target) => observation(target.symbol, price) };
  assert.equal((await collectPrices(repository, provider, { delayMs: 0, lockTtlSeconds: 30 })).status, 'SUCCESS');
  price = '1100';
  await collectPrices(repository, provider, { delayMs: 0, lockTtlSeconds: 30 });
  assert.equal(repository.prices.size, 1);
  assert.equal(repository.prices.get(1n)?.currentPrice, '1100');
});

test('one failed security does not stop successful securities or overwrite prior value', async () => {
  const repository = new MemoryRepository();
  repository.securities = [security(1n, '005930'), security(2n, '000660')];
  repository.prices.set(2n, observation('000660', '777'));
  const provider: PriceProvider = {
    name: 'test',
    fetchPrice: async (target) => { if (target.id === 2n) throw new Error('source error'); return observation(target.symbol, '1000'); },
  };
  const result = await collectPrices(repository, provider, { delayMs: 0, lockTtlSeconds: 30 });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(repository.prices.get(2n)?.currentPrice, '777');
});

test('complete provider outage is FAILED and preserves all previous prices', async () => {
  const repository = new MemoryRepository();
  repository.securities = [security(1n, '005930')];
  repository.prices.set(1n, observation('005930', '777'));
  const provider: PriceProvider = { name: 'test', fetchPrice: async () => { throw new Error('outage'); } };
  const result = await collectPrices(repository, provider, { delayMs: 0, lockTtlSeconds: 30 });
  assert.equal(result.status, 'FAILED');
  assert.deepEqual(result.failedSymbols, ['005930']);
  assert.equal(repository.prices.get(1n)?.currentPrice, '777');
});

test('all stale prices are a non-retryable SKIPPED market day', async () => {
  const repository = new MemoryRepository();
  repository.securities = [security(1n, '005930')];
  const provider: PriceProvider = {
    name: 'test',
    fetchPrice: async (target) => ({ ...observation(target.symbol, '1000'), freshness: 'STALE', freshnessReason: 'market holiday' }),
  };
  const result = await collectPrices(repository, provider, { delayMs: 0, lockTtlSeconds: 30 });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.stale, 1);
  assert.deepEqual(result.failedSymbols, []);
  assert.equal(repository.prices.size, 0);
});

test('held lock prevents duplicate execution', async () => {
  const repository = new MemoryRepository();
  repository.locked = true;
  const provider: PriceProvider = { name: 'test', fetchPrice: async (target) => observation(target.symbol, '1000') };
  assert.equal((await collectPrices(repository, provider, { delayMs: 0, lockTtlSeconds: 30 })).status, 'SKIPPED');
  assert.equal(repository.items[0]?.status, 'SKIPPED');
});

test('manual price run can target a small active-symbol subset', async () => {
  const repository = new MemoryRepository();
  repository.securities = [security(1n, '005930'), security(2n, '005380'), security(3n, '000660')];
  const fetched: string[] = [];
  const provider: PriceProvider = {
    name: 'test',
    fetchPrice: async (target) => { fetched.push(target.symbol); return observation(target.symbol, '1000'); },
  };
  const result = await collectPrices(repository, provider, {
    delayMs: 0, lockTtlSeconds: 30, symbols: ['A005930', '005380'],
  });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(fetched, ['005930', '005380']);
  assert.equal(repository.prices.size, 2);
});

test('manual price run records an unknown or inactive requested symbol as skipped', async () => {
  const repository = new MemoryRepository();
  repository.securities = [security(1n, '005930')];
  const provider: PriceProvider = { name: 'test', fetchPrice: async (target) => observation(target.symbol, '1000') };
  const result = await collectPrices(repository, provider, {
    delayMs: 0, lockTtlSeconds: 30, symbols: ['005930', '999999'],
  });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.success, 1);
  assert.equal(result.skipped, 1);
  assert.equal(repository.items.find((item) => item.symbol === '999999')?.status, 'SKIPPED');
});

test('snapshot is not written when any held position lacks a price', async () => {
  const repository = new MemoryRepository();
  repository.accounts = [{
    id: 1n, name: 'main', cashBalance: '1000',
    lots: [{ symbol: '005930', quantity: '2', soldQuantity: '0', currentPrice: null }],
  }];
  const result = await collectDailyAccountSnapshots(repository, { lockTtlSeconds: 30, now: new Date('2026-09-27T14:00:00Z') });
  assert.equal(result.status, 'FAILED');
  assert.equal(repository.snapshots.size, 0);
});

test('snapshot obeys cash plus current holdings value and UPSERTs same account/date', async () => {
  const repository = new MemoryRepository();
  repository.accounts = [{
    id: 1n, name: 'main', cashBalance: '1000',
    lots: [{ symbol: '005930', quantity: '3', soldQuantity: '1', currentPrice: '500' }],
  }];
  const now = new Date('2026-09-27T14:00:00Z');
  await collectDailyAccountSnapshots(repository, { lockTtlSeconds: 30, now });
  await collectDailyAccountSnapshots(repository, { lockTtlSeconds: 30, now });
  assert.equal(repository.snapshots.size, 1);
  assert.deepEqual([...repository.snapshots.values()][0], { cashBalance: '1000', stockValue: '1000', totalAssetValue: '2000' });
});

test('Naver response maps current and previous close and marks old trading dates stale', () => {
  const target = security(1n, 'A005930');
  const fresh = parseNaverPrice(target, { datas: [{
    itemCode: '005930', closePriceRaw: '70000', compareToPreviousClosePriceRaw: '1000',
    compareToPreviousPrice: { name: 'RISING' }, localTradedAt: '2026-09-27T00:10:00+09:00', marketStatus: 'CLOSE',
  }] }, new Date('2026-09-27T12:00:00+09:00'));
  assert.equal(fresh.previousClosePrice, '69000');
  assert.equal(fresh.freshness, 'CURRENT');

  const stale = parseNaverPrice(target, { datas: [{
    itemCode: '005930', closePriceRaw: '70000', compareToPreviousClosePriceRaw: '0',
    compareToPreviousPrice: { name: 'UNCHANGED' }, localTradedAt: '2026-09-26T15:30:00+09:00',
  }] }, new Date('2026-09-27T12:00:00+09:00'));
  assert.equal(stale.freshness, 'STALE');
});

test('data.go.kr response keeps valid KOSPI and KOSDAQ common stock rows', () => {
  const result = parseSecurityMasterResponse({ response: {
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
    body: { totalCount: 3, items: { item: [
      { basDt: '20260925', srtnCd: '005930', itmsNm: '삼성전자', mrktCtg: 'KOSPI' },
      { basDt: '20260925', srtnCd: '247540', itmsNm: '에코프로비엠', mrktCtg: 'KOSDAQ' },
      { basDt: '20260925', srtnCd: '900001', itmsNm: '제외', mrktCtg: 'KONEX' },
    ] } },
  } });
  assert.equal(result.totalCount, 3);
  assert.deepEqual(result.items.map((item) => item.marketType), ['KOSPI', 'KOSDAQ']);
});

test('security master collection upserts and rejects suspiciously incomplete source data', async () => {
  const repository = new MemoryRepository();
  const provider = { name: 'test-master', fetchLatest: async () => ({
    baseDate: '20260925', items: [{ symbol: '005930', name: '삼성전자', marketType: 'KOSPI' as const }],
  }) };
  await collectSecurityMaster(repository, provider, { lockTtlSeconds: 30, deactivateMissing: false, minimumExpectedCount: 1 });
  assert.equal(repository.securityMaster.get('KOSPI:005930')?.name, '삼성전자');
  await assert.rejects(
    collectSecurityMaster(repository, provider, { lockTtlSeconds: 30, deactivateMissing: true, minimumExpectedCount: 2 }),
    /safety check failed/,
  );
});
