import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';

import { calculateDashboard, calculateHoldings, type PortfolioLotInput } from '../domain/portfolio.js';
import { calculateAssetPeriod, calculatePointChange } from '../domain/asset-history.js';
import { calculateDashboardPerformance } from '../domain/dashboard-performance.js';
import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';
import { realtimePriceCache } from '../realtime/price-cache.js';

type AccountParams = { accountId: string };
type AssetHistoryQuery = { from?: string; to?: string };

const dateOnly = (value: string | undefined, fieldName: string) => {
  if (value === undefined) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must use YYYY-MM-DD.`);
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a valid date.`);
  }
  return result;
};

const decimal = (value: Prisma.Decimal | null) => value?.toString() ?? null;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

const dashboardPeriod = (now: Date) => {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const monthIndex = kst.getUTCMonth();
  const day = kst.getUTCDate();
  const todayKey = new Date(Date.UTC(year, monthIndex, day));
  const previousDayKey = new Date(Date.UTC(year, monthIndex, day - 1));
  const previousMonthEndKey = new Date(Date.UTC(year, monthIndex, 0));
  const todayStart = new Date(todayKey.getTime() - KST_OFFSET_MS);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1_000);
  return { todayKey, previousDayKey, previousMonthEndKey, todayStart, tomorrowStart };
};

const serializeHolding = (holding: ReturnType<typeof calculateHoldings>[number]) => ({
  securityId: holding.securityId.toString(),
  symbol: holding.symbol,
  name: holding.name,
  marketType: holding.marketType,
  quantity: holding.quantity.toString(),
  purchaseAmount: holding.purchaseAmount.toString(),
  averagePurchasePrice: holding.averagePurchasePrice.toString(),
  currentPrice: decimal(holding.currentPrice),
  previousClosePrice: decimal(holding.previousClosePrice),
  marketValue: decimal(holding.marketValue),
  unrealizedProfitLoss: decimal(holding.unrealizedProfitLoss),
  unrealizedReturnRate: decimal(holding.unrealizedReturnRate),
  priceChangeRate: decimal(holding.priceChangeRate),
  priceUpdatedAt: holding.priceUpdatedAt?.toISOString() ?? null,
  marketStatus: holding.marketStatus,
});

const loadPortfolio = async (accountId: bigint) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      buyTrades: {
        include: {
          sellTrades: { select: { quantity: true } },
          security: { include: { marketPrice: true } },
        },
        orderBy: [{ boughtAt: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  const realtime = new Map(realtimePriceCache.get().map((price) => [price.symbol, price]));
  const lots: PortfolioLotInput[] = account.buyTrades.map((trade) => {
    const stored = trade.security.marketPrice;
    const live = realtime.get(trade.security.symbol);
    const useLive = live && (!stored || Date.parse(live.observedAt) >= stored.priceUpdatedAt.getTime());
    return {
      securityId: trade.securityId,
      symbol: trade.security.symbol,
      name: trade.security.name,
      marketType: trade.security.marketType,
      quantity: trade.quantity,
      unitPrice: trade.unitPrice,
      soldQuantities: trade.sellTrades.map((sell) => sell.quantity),
      currentPrice: useLive ? new Prisma.Decimal(live.currentPrice) : stored?.currentPrice ?? null,
      previousClosePrice: useLive
        ? live.previousClosePrice ? new Prisma.Decimal(live.previousClosePrice) : null
        : stored?.previousClosePrice ?? null,
      priceUpdatedAt: useLive ? new Date(live.observedAt) : stored?.priceUpdatedAt ?? null,
      marketStatus: useLive ? live.marketStatus : stored ? 'STORED' : null,
    };
  });
  return { account, holdings: calculateHoldings(lots) };
};

export async function portfolioRoutes(app: FastifyInstance) {
  app.get<{ Params: AccountParams }>('/accounts/:accountId/holdings', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const { account, holdings } = await loadPortfolio(accountId);
    return {
      data: holdings.map(serializeHolding),
      meta: { accountId: account.id.toString(), count: holdings.length },
    };
  });

  app.get<{ Params: AccountParams }>('/accounts/:accountId/dashboard', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const { account, holdings } = await loadPortfolio(accountId);
    const dashboard = calculateDashboard(account.cashBalance, holdings);
    const calculatedAt = new Date();
    const period = dashboardPeriod(calculatedAt);
    const [previousDaySnapshot, previousMonthEndSnapshot, externalFlowGroups] = await Promise.all([
      prisma.dailyAccountSnapshot.findUnique({
        where: { accountId_snapshotDate: { accountId, snapshotDate: period.previousDayKey } },
      }),
      prisma.dailyAccountSnapshot.findUnique({
        where: { accountId_snapshotDate: { accountId, snapshotDate: period.previousMonthEndKey } },
      }),
      prisma.cashTransaction.groupBy({
        by: ['transactionType'],
        where: {
          accountId,
          transactionType: { in: ['DEPOSIT', 'WITHDRAWAL'] },
          transactionDate: { gte: period.todayStart, lt: period.tomorrowStart },
        },
        _sum: { amount: true },
      }),
    ]);
    const externalAmount = (type: 'DEPOSIT' | 'WITHDRAWAL') => externalFlowGroups
      .find((group) => group.transactionType === type)?._sum.amount ?? new Prisma.Decimal(0);
    const todayDepositAmount = externalAmount('DEPOSIT');
    const todayWithdrawalAmount = externalAmount('WITHDRAWAL');
    const performance = calculateDashboardPerformance({
      currentCashBalance: dashboard.cashBalance,
      currentStockValue: dashboard.stockValue,
      previousDaySnapshot,
      previousMonthEndSnapshot,
      todayDepositAmount,
      todayWithdrawalAmount,
    });
    return {
      data: {
        account: { id: account.id.toString(), name: account.name, brokerName: account.brokerName },
        cashBalance: dashboard.cashBalance.toString(),
        purchaseAmount: dashboard.purchaseAmount.toString(),
        stockValue: decimal(dashboard.stockValue),
        totalAssetValue: decimal(dashboard.totalAssetValue),
        unrealizedProfitLoss: decimal(dashboard.unrealizedProfitLoss),
        unrealizedReturnRate: decimal(dashboard.unrealizedReturnRate),
        pricingComplete: dashboard.pricingComplete,
        missingPriceSymbols: dashboard.missingPriceSymbols,
        latestPriceUpdatedAt: dashboard.latestPriceUpdatedAt?.toISOString() ?? null,
        dailyProfit: performance.dailyProfit,
        dailyProfitRate: performance.dailyProfitRate,
        stockMonthlyProfit: performance.stockMonthlyProfit,
        cashMonthlyProfit: performance.cashMonthlyProfit,
        performanceMeta: {
          timezone: 'Asia/Seoul',
          asOfDate: period.todayKey.toISOString().slice(0, 10),
          calculatedAt: calculatedAt.toISOString(),
          previousDayBaselineDate: previousDaySnapshot?.snapshotDate.toISOString().slice(0, 10) ?? null,
          previousMonthEndBaselineDate: previousMonthEndSnapshot?.snapshotDate.toISOString().slice(0, 10) ?? null,
          todayDepositAmount: todayDepositAmount.toString(),
          todayWithdrawalAmount: todayWithdrawalAmount.toString(),
          dailyProfitUnavailableReason: performance.dailyProfitUnavailableReason,
          dailyProfitRateUnavailableReason: performance.dailyProfitRateUnavailableReason,
          stockMonthlyProfitUnavailableReason: performance.stockMonthlyProfitUnavailableReason,
          cashMonthlyProfitUnavailableReason: performance.cashMonthlyProfitUnavailableReason,
          calculationMethod: 'NET_FLOW_ADJUSTED_SIMPLE',
        },
        holdings: holdings.map(serializeHolding),
      },
    };
  });

  app.get<{ Params: AccountParams; Querystring: AssetHistoryQuery }>('/accounts/:accountId/asset-history', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const from = dateOnly(request.query.from, 'from');
    const to = dateOnly(request.query.to, 'to');
    if (from && to && from > to) throw new ApiError(400, 'INVALID_INPUT', 'from must not be later than to.');
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, isActive: true } });
    if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
    const snapshots = await prisma.dailyAccountSnapshot.findMany({
      where: {
        accountId,
        ...((from || to) ? { snapshotDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: [{ snapshotDate: 'asc' }, { id: 'asc' }],
    });
    const first = snapshots.at(0);
    const last = snapshots.at(-1);
    const cashGroups = first && last && snapshots.length >= 2
      ? await prisma.cashTransaction.groupBy({
        by: ['transactionType'],
        where: {
          accountId,
          transactionType: { in: ['DEPOSIT', 'WITHDRAWAL'] },
          createdAt: { gt: first.updatedAt, lte: last.updatedAt },
        },
        _sum: { amount: true },
      })
      : [];
    const amountFor = (type: 'DEPOSIT' | 'WITHDRAWAL') => cashGroups
      .find((group) => group.transactionType === type)?._sum.amount ?? new Prisma.Decimal(0);
    const depositAmount = amountFor('DEPOSIT');
    const withdrawalAmount = amountFor('WITHDRAWAL');
    const period = calculateAssetPeriod(snapshots, depositAmount, withdrawalAmount);
    return {
      data: snapshots.map((snapshot, index) => ({
        date: snapshot.snapshotDate.toISOString().slice(0, 10),
        cashBalance: snapshot.cashBalance.toString(),
        stockValue: snapshot.stockValue.toString(),
        totalAssetValue: snapshot.totalAssetValue.toString(),
        ...calculatePointChange(snapshot.totalAssetValue, snapshots[index - 1]?.totalAssetValue),
        updatedAt: snapshot.updatedAt.toISOString(),
      })),
      summary: {
        from: first?.snapshotDate.toISOString().slice(0, 10) ?? null,
        to: last?.snapshotDate.toISOString().slice(0, 10) ?? null,
        openingAssetValue: first?.totalAssetValue.toString() ?? null,
        closingAssetValue: last?.totalAssetValue.toString() ?? null,
        depositAmount: depositAmount.toString(),
        withdrawalAmount: withdrawalAmount.toString(),
        ...period,
        calculationMethod: 'NET_FLOW_ADJUSTED_SIMPLE',
      },
      meta: { accountId: accountId.toString(), count: snapshots.length, timezone: 'Asia/Seoul' },
    };
  });
}
