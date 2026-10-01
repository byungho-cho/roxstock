import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/index.js';

test('buy-lots keeps sold lots on explicit false and supplies independent price valuation', async () => {
  const findAccount = prisma.account.findUnique; const findLots = prisma.buyTrade.findMany;
  prisma.account.findUnique = (async () => ({ id: 1n, isActive: true })) as unknown as typeof findAccount;
  const price = { currentPrice: new Prisma.Decimal('110'), priceUpdatedAt: new Date('2026-01-02T00:00:00Z') };
  prisma.buyTrade.findMany = (async (args: unknown) => {
    assert.equal((args as { where: { accountId: bigint } }).where.accountId, 1n);
    return [0, 1, 2].map(i => ({ id: BigInt(i + 1), securityId: 999999n, boughtAt: new Date('2026-01-01T00:00:00Z'),
      quantity: new Prisma.Decimal('10'), unitPrice: new Prisma.Decimal('100'), memo: null,
      security: { id: 999999n, symbol: '999999', name: '검증 종목', marketType: 'KOSPI', marketPrice: i === 2 ? null : price },
      sellTrades: i === 0 ? [{ id: 10n, soldAt: new Date('2026-01-02T00:00:00Z'), quantity: new Prisma.Decimal('10'), unitPrice: new Prisma.Decimal('105') }] : [],
    }));
  }) as unknown as typeof findLots;
  const app = buildApp();
  try {
    const response = await app.inject('/api/accounts/1/buy-lots?remainingOnly=false');
    assert.equal(response.statusCode, 200); const rows = response.json().data;
    assert.equal(rows.length, 3); assert.equal(rows[0].remainingQuantity, '0');
    assert.equal(rows[0].profitLoss, '100'); assert.equal(rows[1].profitLoss, '100');
    assert.equal(rows[2].currentPrice, null); assert.equal(rows[2].profitLoss, null);
    const open = await app.inject('/api/accounts/1/buy-lots'); assert.equal(open.json().data.length, 2);
  } finally { await app.close(); prisma.account.findUnique = findAccount; prisma.buyTrade.findMany = findLots; }
});
