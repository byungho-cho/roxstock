import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../auth/route-test-app.js';
import { prisma } from '@roxstock/shared/lib/prisma';
import { Prisma } from '@roxstock/shared/prisma';

test('home trend respects dates/account and skips detailed ledger, position and goal reads', async () => {
  const originalAccount = prisma.account.findUnique;
  const originalSnapshots = prisma.dailyAccountSnapshot.findMany;
  const originalLedger = prisma.cashTransaction.groupBy;
  const originalPlan = prisma.compoundGrowthPlan.findFirst;
  const originalPositions = prisma.dailyPositionSnapshot.findMany;
  prisma.account.findUnique = (async (args: any) => {
    assert.equal(args.where.id, 7n);
    return { id: 7n, isActive: true };
  }) as any;
  prisma.dailyAccountSnapshot.findMany = (async (args: any) => {
    assert.equal(args.where.accountId, 7n);
    assert.equal(args.where.snapshotDate.gte.toISOString().slice(0, 10), '2020-01-01');
    assert.equal(args.where.snapshotDate.lte.toISOString().slice(0, 10), '2020-01-31');
    return [1, 2].map(day => ({ snapshotDate: new Date(`2020-01-0${day}T00:00:00Z`), totalAssetValue: new Prisma.Decimal(100 * day) }));
  }) as any;
  const unexpected = async () => { throw new Error('Chart must not load detailed financial data'); };
  prisma.cashTransaction.groupBy = unexpected as any;
  prisma.compoundGrowthPlan.findFirst = unexpected as any;
  prisma.dailyPositionSnapshot.findMany = unexpected as any;
  const app = buildApp();
  try {
    const response = await app.inject('/api/accounts/7/asset-history?from=2020-01-01&to=2020-01-31&view=trend');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { data: [
      { date: '2020-01-01', totalAssetValue: '100' }, { date: '2020-01-02', totalAssetValue: '200' },
    ] });
    assert.equal((await app.inject('/api/accounts/7/asset-history?from=2020-02-01&to=2020-01-01&view=trend')).statusCode, 400);
    prisma.account.findUnique = (async () => ({ id: 7n, isActive: false })) as any;
    assert.equal((await app.inject('/api/accounts/7/asset-history?view=trend')).statusCode, 404);
  } finally {
    await app.close();
    prisma.account.findUnique = originalAccount;
    prisma.dailyAccountSnapshot.findMany = originalSnapshots;
    prisma.cashTransaction.groupBy = originalLedger;
    prisma.compoundGrowthPlan.findFirst = originalPlan;
    prisma.dailyPositionSnapshot.findMany = originalPositions;
  }
});

test('stock summary matches full trade report: multiple lots, loss, latest sale and buy-only stock', async () => {
  const originalAccount = prisma.account.findUnique, originalBuys = prisma.buyTrade.findMany, originalSells = prisma.sellTrade.findMany;
  const security = (id: bigint) => ({ id, symbol: String(id), name: `Stock ${id}`, marketType: 'KOSPI' });
  const buy = (id: bigint, securityId: bigint, price: number) => ({ id, security: security(securityId), quantity: new Prisma.Decimal(10), unitPrice: new Prisma.Decimal(price), boughtAt: new Date('2020-01-01'), memo: null });
  const buys = [buy(1n, 1n, 100), buy(2n, 1n, 200), buy(3n, 2n, 100)];
  const sells = [
    { id: 1n, buyTradeId: 1n, buyTrade: buys[0], quantity: new Prisma.Decimal(2), unitPrice: new Prisma.Decimal(150), soldAt: new Date('2020-02-03'), memo: null },
    { id: 2n, buyTradeId: 2n, buyTrade: buys[1], quantity: new Prisma.Decimal(3), unitPrice: new Prisma.Decimal(180), soldAt: new Date('2020-02-02'), memo: null },
  ];
  prisma.account.findUnique = (async () => ({ id: 7n, isActive: true })) as any;
  prisma.buyTrade.findMany = (async (args: any) => { assert.equal(args.where.accountId, 7n); return buys; }) as any;
  prisma.sellTrade.findMany = (async (args: any) => { assert.equal(args.where.buyTrade.accountId, 7n); return sells; }) as any;
  const app = buildApp();
  try {
    const full = await app.inject('/api/accounts/7/trades');
    const compact = await app.inject('/api/accounts/7/trades?view=stocks');
    assert.equal(full.statusCode, 200, full.body);
    assert.equal(compact.statusCode, 200, compact.body);
    const rows = compact.json().data;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].realizedProfitLoss, full.json().summary.realizedProfitLoss);
    assert.equal(rows[0].realizedProfitLoss, '40');
    assert.equal(rows[0].lastSoldAt, '2020-02-03T00:00:00.000Z');
    assert.equal(rows[1].realizedProfitLoss, null);
    assert.equal(rows[1].lastSoldAt, null);
    assert.ok(compact.body.length < full.body.length);
    prisma.account.findUnique = (async () => null) as any;
    assert.equal((await app.inject('/api/accounts/7/trades?view=stocks')).statusCode, 404);
  } finally {
    await app.close();
    prisma.account.findUnique = originalAccount;
    prisma.buyTrade.findMany = originalBuys;
    prisma.sellTrade.findMany = originalSells;
  }
});
