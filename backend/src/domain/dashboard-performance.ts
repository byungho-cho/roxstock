import { Prisma } from '../generated/prisma/index.js';

export type PerformanceSnapshot = {
  snapshotDate: Date;
  cashBalance: Prisma.Decimal;
  stockValue: Prisma.Decimal;
  totalAssetValue: Prisma.Decimal;
};

export type DashboardPerformanceInput = {
  currentCashBalance: Prisma.Decimal;
  currentStockValue: Prisma.Decimal | null;
  previousDaySnapshot: PerformanceSnapshot | null;
  previousMonthEndSnapshot: PerformanceSnapshot | null;
  todayDepositAmount: Prisma.Decimal;
  todayWithdrawalAmount: Prisma.Decimal;
};

export type UnavailableReason =
  | 'CURRENT_PRICE_INCOMPLETE'
  | 'PREVIOUS_DAY_SNAPSHOT_MISSING'
  | 'PREVIOUS_DAY_ASSET_VALUE_ZERO'
  | 'PREVIOUS_MONTH_END_SNAPSHOT_MISSING';

const stringOrNull = (value: Prisma.Decimal | null) => value?.toString() ?? null;

export const calculateDashboardPerformance = (input: DashboardPerformanceInput) => {
  const currentTotalAssetValue = input.currentStockValue?.plus(input.currentCashBalance) ?? null;

  let dailyProfit: Prisma.Decimal | null = null;
  let dailyProfitUnavailableReason: UnavailableReason | null = null;
  if (currentTotalAssetValue === null) {
    dailyProfitUnavailableReason = 'CURRENT_PRICE_INCOMPLETE';
  } else if (!input.previousDaySnapshot) {
    dailyProfitUnavailableReason = 'PREVIOUS_DAY_SNAPSHOT_MISSING';
  } else {
    dailyProfit = currentTotalAssetValue
      .minus(input.previousDaySnapshot.totalAssetValue)
      .minus(input.todayDepositAmount)
      .plus(input.todayWithdrawalAmount);
  }

  let dailyProfitRate: Prisma.Decimal | null = null;
  let dailyProfitRateUnavailableReason: UnavailableReason | null = dailyProfitUnavailableReason;
  if (dailyProfit !== null && input.previousDaySnapshot) {
    if (input.previousDaySnapshot.totalAssetValue.greaterThan(0)) {
      dailyProfitRate = dailyProfit.div(input.previousDaySnapshot.totalAssetValue).mul(100);
      dailyProfitRateUnavailableReason = null;
    } else {
      dailyProfitRateUnavailableReason = 'PREVIOUS_DAY_ASSET_VALUE_ZERO';
    }
  }

  const cashMonthlyProfit = input.previousMonthEndSnapshot
    ? input.currentCashBalance.minus(input.previousMonthEndSnapshot.cashBalance)
    : null;
  const stockMonthlyProfit = input.previousMonthEndSnapshot && input.currentStockValue !== null
    ? input.currentStockValue.minus(input.previousMonthEndSnapshot.stockValue)
    : null;

  return {
    dailyProfit: stringOrNull(dailyProfit),
    dailyProfitRate: stringOrNull(dailyProfitRate),
    stockMonthlyProfit: stringOrNull(stockMonthlyProfit),
    cashMonthlyProfit: stringOrNull(cashMonthlyProfit),
    dailyProfitUnavailableReason,
    dailyProfitRateUnavailableReason,
    stockMonthlyProfitUnavailableReason: input.currentStockValue === null
      ? 'CURRENT_PRICE_INCOMPLETE' as const
      : !input.previousMonthEndSnapshot ? 'PREVIOUS_MONTH_END_SNAPSHOT_MISSING' as const : null,
    cashMonthlyProfitUnavailableReason: input.previousMonthEndSnapshot
      ? null
      : 'PREVIOUS_MONTH_END_SNAPSHOT_MISSING' as const,
  };
};
