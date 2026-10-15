import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@roxstock/shared/prisma';
import { prisma } from '@roxstock/shared/lib/prisma';
import { dashboardPeriod, loadDashboard } from './portfolio.js';

test('월간 손익 기간은 한국시간 월초부터 오늘까지이며 연도·윤년 경계를 처리한다', () => {
  const january = dashboardPeriod(new Date('2026-12-31T15:00:00Z'));
  assert.equal(january.monthStart.toISOString(), '2026-12-31T15:00:00.000Z');
  assert.equal(january.previousMonthEndKey.toISOString(), '2026-12-31T00:00:00.000Z');
  assert.equal(january.tomorrowStart.toISOString(), '2027-01-01T15:00:00.000Z');
  const march = dashboardPeriod(new Date('2028-02-29T15:00:00Z'));
  assert.equal(march.previousMonthEndKey.toISOString(), '2028-02-29T00:00:00.000Z');
});

test('대시보드는 선택 계좌의 이번 달 외부 입출금만 집계하고 일별·예수금 계산은 유지한다', async () => {
  const originals = { snapshot: prisma.dailyAccountSnapshot.findUnique, flows: prisma.cashTransaction.groupBy };
  const calls: any[] = [];
  const d = (n: number) => new Prisma.Decimal(n);
  const period = dashboardPeriod(new Date());
  prisma.dailyAccountSnapshot.findUnique = (async (args: any) => {
    assert.equal(args.where.accountId_snapshotDate.accountId, 42n);
    return { snapshotDate: args.where.accountId_snapshotDate.snapshotDate,
      cashBalance: d(1000), stockValue: d(0), totalAssetValue: d(1000) };
  }) as any;
  prisma.cashTransaction.groupBy = (async (args: any) => {
    calls.push(args);
    return [{ transactionType: 'DEPOSIT', _sum: { amount: d(300) } },
      { transactionType: 'WITHDRAWAL', _sum: { amount: d(50) } }];
  }) as any;
  try {
    const result = await loadDashboard(42n, Promise.resolve({ account: {
      id: 42n, name: 'test', brokerName: 'test', cashBalance: d(1200),
    }, holdings: [] } as any));
    assert.equal(result.data.stockMonthlyProfit, '-50');
    assert.equal(result.data.cashMonthlyProfit, '200');
    assert.equal(result.data.dailyProfit, '-50');
    assert.equal(result.data.performanceMeta.monthDepositAmount, '300');
    assert.equal(result.data.performanceMeta.monthlyProfitBasis, 'TOTAL_ASSETS_NET_EXTERNAL_FLOWS');
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.where.accountId, 42n);
      assert.deepEqual(call.where.transactionType.in, ['DEPOSIT', 'WITHDRAWAL']);
      assert.equal(call.where.transactionDate.lt.toISOString(), period.tomorrowStart.toISOString());
    }
    assert.equal(calls[1].where.transactionDate.gte.toISOString(), period.monthStart.toISOString());
  } finally {
    prisma.dailyAccountSnapshot.findUnique = originals.snapshot;
    prisma.cashTransaction.groupBy = originals.flows;
  }
});
