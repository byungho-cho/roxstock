import { annualInvestmentCapital } from '../domain/investment-capital.js';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';

import { calculateDashboard, calculateHoldings, type PortfolioLotInput } from '../domain/portfolio.js';
import { seoulYear } from '../domain/compound-growth.js';
import { calculateAssetPeriod, calculatePointChange, calculatePeriodBreakdown, compoundYearTarget } from '../domain/asset-history.js';
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

export const loadPortfolio = async (accountId: bigint, reader:Prisma.TransactionClient=prisma) => {
  const account = await reader.account.findUnique({
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
        previousDayChange: performance.previousDayChange,
        previousDayChangeRate: performance.previousDayChangeRate,
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

  // Persisted snapshots only; no collection or history mutation on reads.
  app.get<{ Params: AccountParams }>('/accounts/:accountId/investment-capital', async request => {
    const accountId = id(request.params.accountId, 'accountId');
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { isActive: true } });
    if (!account?.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const snapshots = await prisma.dailyAccountSnapshot.findMany({ where: { accountId, snapshotDate: { lte: new Date(`${today}T00:00:00Z`) } },
      select: { snapshotDate: true, investmentAmount: true }, orderBy: [{ snapshotDate: 'desc' }, { id: 'desc' }] });
    return { data: annualInvestmentCapital(snapshots, today) };
  });

  app.get<{Params:AccountParams;Querystring:{year?:string}}>('/accounts/:accountId/investment-baseline',async request=>{
    const accountId=id(request.params.accountId,'accountId'),year=Number(request.query.year);
    if(!Number.isInteger(year)||year<1900||year>2200)throw new ApiError(400,'INVALID_INPUT','Invalid year.');
    const account=await prisma.account.findUnique({where:{id:accountId},select:{isActive:true}});
    if(!account?.isActive)throw new ApiError(404,'ACCOUNT_NOT_FOUND','Account not found.');
    const end=new Date(`${year-1}-12-31T00:00:00Z`);
    const previous=await prisma.dailyAccountSnapshot.findUnique({where:{accountId_snapshotDate:{accountId,snapshotDate:end}}});
    const snapshot=previous??await prisma.dailyAccountSnapshot.findFirst({where:{accountId},orderBy:[{snapshotDate:'asc'},{id:'asc'}]});
    return {data:snapshot?{date:snapshot.snapshotDate.toISOString().slice(0,10),totalAssetValue:snapshot.totalAssetValue.toString(),investmentAmount:snapshot.investmentAmount?.toString()??null,updatedAt:snapshot.updatedAt.toISOString(),source:previous?'PREVIOUS_YEAR_END':'FIRST_SNAPSHOT'}:null};
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
    // A live closing point is response-only; never overwrite historical snapshots.
    const calculatedAt = new Date(), todayKey=dashboardPeriod(calculatedAt).todayKey;
    let liveUnrealized: Prisma.Decimal | null = null;
    let liveClosing = false;
    if ((!to || to >= todayKey) && (!from || from <= todayKey)) {
      const portfolio=await loadPortfolio(accountId);
      const current=calculateDashboard(portfolio.account.cashBalance,portfolio.holdings);
      if(current.totalAssetValue!==null && current.stockValue!==null){
        liveClosing=true;
        liveUnrealized=portfolio.holdings.reduce((sum,h)=>sum.plus(h.unrealizedProfitLoss??0),new Prisma.Decimal(0));
        const point={id:0n,accountId,snapshotDate:todayKey,cashBalance:portfolio.account.cashBalance,stockValue:current.stockValue,totalAssetValue:current.totalAssetValue,investmentAmount:current.purchaseAmount.plus(portfolio.account.cashBalance),createdAt:calculatedAt,updatedAt:calculatedAt};
        if(snapshots.at(-1)?.snapshotDate.getTime()===todayKey.getTime())snapshots.pop();
        snapshots.push(point);
      }
    }
    const first = snapshots.at(0);
    const last = snapshots.at(-1);
    const validInterval = !!first && !!last && snapshots.length >= 2 && last.updatedAt > first.updatedAt;
    const cashGroups = validInterval
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
    const period = calculateAssetPeriod(validInterval ? snapshots : [], depositAmount, withdrawalAmount);
    const ledger = validInterval ? await prisma.cashTransaction.findMany({
      where: { accountId, createdAt: {gt: first.updatedAt, lte: last.updatedAt} },
      include: { sellTrade: {include: {buyTrade: true}}, dividend: true },
    }) : [];
    const positionValue = async (snapshot: typeof first) => {
      if (!snapshot) return null;
      if(liveClosing && snapshot.id===0n)return liveUnrealized;
      const positions = await prisma.dailyPositionSnapshot.findMany({where: {accountId, snapshotDate: snapshot.snapshotDate}});
      const market = positions.reduce((sum, row) => sum.plus(row.marketValue), new Prisma.Decimal(0));
      if (!market.equals(snapshot.stockValue)) return null;
      return positions.reduce((sum, row) => sum.plus(row.unrealizedProfitLoss), new Prisma.Decimal(0));
    };
    const currentYear = seoulYear();
    const [openingUnrealized, closingUnrealized, plan] = await Promise.all([
      positionValue(first), positionValue(last),
      prisma.compoundGrowthPlan.findFirst({where: {accountId, isActive: true, startDate: {lte: new Date(Date.UTC(currentYear, 11, 31))}, endDate: {gte: new Date(Date.UTC(currentYear, 0, 1))}}, orderBy: [{displayOrder: 'asc'}, {id:'asc'}],
        include: {goals: {where: {isVisible:true}, orderBy:[{isDefault:'desc'},{displayOrder:'asc'},{id:'asc'}]}}}),
    ]);
    const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
    const dividends = ledger.filter(row => row.transactionType === 'DIVIDEND');
    const breakdown = calculatePeriodBreakdown({
      openingUnrealized, closingUnrealized,
      realized: ledger.some(row => row.transactionType === 'SELL' && !row.sellTrade) ? null : sum(ledger.filter(row => row.sellTrade).map(row => row.sellTrade!.unitPrice.minus(row.sellTrade!.buyTrade.unitPrice).mul(row.sellTrade!.quantity))),
      dividend: dividends.some(row => !row.dividend) ? null : sum(dividends.map(row => row.dividend!.grossAmount)),
      fees: sum(ledger.filter(row => row.transactionType === 'BUY' || row.transactionType === 'SELL').map(row => row.feeTaxAmount))
        .plus(sum(dividends.filter(row => row.dividend).map(row => row.dividend!.grossAmount.minus(row.dividend!.netAmount)))),
      profitLoss: period.profitLoss,
    });
    const goal = plan?.goals.find(goal => goal.isDefault);
    const compoundPlan = plan ? {
      id: plan.id.toString(), name: plan.planName, assetBasis: 'PLAN_INITIAL_ASSET',
      initialAssetValue: plan.initialAssetValue.toString(),
      yearTarget: goal && currentYear >= plan.startDate.getUTCFullYear() && currentYear <= plan.endDate.getUTCFullYear()
        ? compoundYearTarget(plan.initialAssetValue, plan.annualContributionAmount, goal.annualTargetRate, plan.startDate.getUTCFullYear(), currentYear) : null,
      goalName: goal?.goalName ?? null, targetYear: currentYear,
    } : null;
    return {
      compoundPlan,
      data: snapshots.map((snapshot, index) => ({
        date: snapshot.snapshotDate.toISOString().slice(0, 10),
        isCurrent: liveClosing && snapshot.id===0n,
        cashBalance: snapshot.cashBalance.toString(),
        stockValue: snapshot.stockValue.toString(),
        totalAssetValue: snapshot.totalAssetValue.toString(),
        investmentAmount: snapshot.investmentAmount?.toString() ?? null,
        ...calculatePointChange(snapshot.totalAssetValue, snapshots[index - 1]?.totalAssetValue),
        updatedAt: snapshot.updatedAt.toISOString(),
      })),
      summary: {
        from: first?.snapshotDate.toISOString().slice(0, 10) ?? null,
        to: last?.snapshotDate.toISOString().slice(0, 10) ?? null,
        openingAssetValue: first?.totalAssetValue.toString() ?? null,
        closingAssetValue: last?.totalAssetValue.toString() ?? null,
        depositAmount: validInterval ? depositAmount.toString() : null,
        withdrawalAmount: validInterval ? withdrawalAmount.toString() : null,
        ...period,
        netContribution: validInterval ? period.netContribution : null,
        calculationUnavailableReason: validInterval ? null : snapshots.length < 2 ? 'INSUFFICIENT_SNAPSHOTS' : 'SNAPSHOT_CAPTURE_ORDER_INVALID',
        ...(validInterval ? breakdown : {unrealizedChange:null,realizedProfitLoss:null,dividendIncome:null,feeTaxAmount:null,detailedProfitLoss:null,reconciliationDifference:null}),
        ledgerFrom: first?.updatedAt.toISOString() ?? null, ledgerTo: last?.updatedAt.toISOString() ?? null,
        calculationMethod: 'NET_FLOW_ADJUSTED_SIMPLE',
      },
      meta: { accountId: accountId.toString(), count: snapshots.length, timezone: 'Asia/Seoul' },
    };
  });
}


