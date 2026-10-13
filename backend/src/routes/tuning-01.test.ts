import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/index.js';
import { PageCache } from '../domain/page-cache.js';
import { stockTradeSummary } from './page-bootstrap.js';
import { realtimePriceCache } from '../realtime/price-cache.js';

test('cache coalesces, expires, rejects errors, and fences invalidated in-flight work', async () => {
  let now = 0, reads = 0;
  const cache = new PageCache(10, 2, () => now);
  let resolve!: (value: number) => void;
  const a = cache.get('a', () => { reads++; return new Promise<number>(r => { resolve = r; }); });
  const b = cache.get('a', async () => { reads++; return 2; });
  await Promise.resolve(); resolve(1);
  assert.equal((await a).value, 1); assert.equal((await b).status, 'COALESCED'); assert.equal(reads, 1);
  assert.equal((await cache.get('a', async () => 2)).status, 'HIT');
  now = 11; assert.equal((await cache.get('a', async () => 2)).value, 2);
  const pending = cache.get('old', () => new Promise<number>(r => { resolve = r; }));
  await Promise.resolve(); cache.clear();
  assert.equal((await cache.get('old', async () => 9)).value, 9);
  resolve(3); await pending;
  assert.equal((await cache.get('old', async () => 4)).value, 9);
  await assert.rejects(cache.get('error', async () => { throw new Error('unavailable'); }));
  assert.equal((await cache.get('error', async () => 5)).value, 5);
});

test('stock lot summary preserves lot cost, loss and buy-only semantics', () => {
  const d = (n: number) => new Prisma.Decimal(n);
  const security = { symbol: '000001', name: 'test', marketType: 'KOSPI' };
  const result = stockTradeSummary({ account: { buyTrades: [
    { securityId: 1n, security, unitPrice: d(100), sellTrades: [{ quantity:d(2),unitPrice:d(150),soldAt:new Date('2020-02-03') }] },
    { securityId: 1n, security, unitPrice: d(200), sellTrades: [{ quantity:d(3),unitPrice:d(180),soldAt:new Date('2020-02-02') }] },
    { securityId: 2n, security, unitPrice: d(100), sellTrades: [] },
  ] } } as any);
  assert.equal(result[0]?.realizedProfitLoss, '40');
  assert.equal(result[0]?.lastSoldAt, '2020-02-03T00:00:00.000Z');
  assert.equal(result[1]?.realizedProfitLoss, null);
});

test('page endpoints select accounts, reuse one position read, cache and invalidate writes/prices', async () => {
  const originals = { accounts:prisma.account.findMany, account:prisma.account.findUnique, securities:prisma.security.findMany, metrics:prisma.valuationMetric.findMany, financials:prisma.financialStatement.findMany, snapshots:prisma.dailyAccountSnapshot.findMany, snapshot:prisma.dailyAccountSnapshot.findUnique, flows:prisma.cashTransaction.groupBy };
  const date = new Date('2026-01-01'), d = (v: number) => new Prisma.Decimal(v);
  let positions = 0;
  const account = (id: bigint) => ({id,name:'Account '+id,brokerName:'Test',accountNumber:null,isDefault:id===2n,isActive:true,displayOrder:0,createdAt:date,updatedAt:date,cashTransactions:[{id:1n,balanceAfter:d(100),updatedAt:date}],buyTrades:[],targetArrivalVersion:0,targetArrivalConditions:[]});
  prisma.account.findMany = (async () => [account(1n),account(2n)]) as any;
  prisma.account.findUnique = (async (args: any) => { if(args.include?.buyTrades) positions++; return account(args.where.id); }) as any;
  prisma.security.findMany = (async () => []) as any;
  prisma.valuationMetric.findMany = (async () => []) as any;
  prisma.financialStatement.findMany = (async () => []) as any;
  prisma.dailyAccountSnapshot.findMany = (async () => []) as any;
  prisma.dailyAccountSnapshot.findUnique = (async () => null) as any;
  prisma.cashTransaction.groupBy = (async () => []) as any;
  const app=buildApp(); app.post('/test-write',async()=>({ok:true}));
  try {
    const first=await app.inject('/api/pages/home');
    assert.equal(first.statusCode,200,first.body);
    assert.equal(first.json().data.accountId,'2');
    assert.equal(first.json().data.dashboard.totalAssetValue,'100');
    assert.equal(first.json().data.recent.meta.count,0);
    assert.equal(first.json().data.targets.meta.total,0);
    assert.equal(first.json().data.trend,undefined);
    assert.equal(positions,1);
    assert.equal((await app.inject('/api/pages/home')).headers['x-page-cache'],'HIT');
    await app.inject({method:'POST',url:'/api/pages/read',payload:{paths:['/accounts']}});
    assert.equal((await app.inject('/api/pages/home')).headers['x-page-cache'],'HIT');
    assert.equal(positions,1);
    const other=await app.inject('/api/pages/stocks?accountId=1');
    assert.equal(other.json().data.accountId,'1'); assert.equal(positions,2);
    assert.equal((await app.inject('/api/pages/stocks?accountId=999')).json().data.accountId,'2');
    await app.inject({method:'POST',url:'/test-write'});
    assert.equal((await app.inject('/api/pages/home')).headers['x-page-cache'],'MISS');
    realtimePriceCache.ingest([{securityId:'999999',symbol:'999999',name:'test',currentPrice:'100',previousClosePrice:'90',observedAt:new Date().toISOString(),marketStatus:'TEST'}]);
    assert.equal((await app.inject('/api/pages/home')).headers['x-page-cache'],'MISS');
    assert.equal((await app.inject('/api/pages/stocks?accountId=bad')).statusCode,400);
  } finally {
    await app.close(); realtimePriceCache.removeSecurity('999999');
    prisma.account.findMany=originals.accounts;prisma.account.findUnique=originals.account;prisma.security.findMany=originals.securities;prisma.valuationMetric.findMany=originals.metrics;prisma.financialStatement.findMany=originals.financials;prisma.dailyAccountSnapshot.findMany=originals.snapshots;prisma.dailyAccountSnapshot.findUnique=originals.snapshot;prisma.cashTransaction.groupBy=originals.flows;
  }
});
