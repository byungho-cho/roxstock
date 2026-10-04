import { Prisma } from '../generated/prisma/index.js';

export type AssetSnapshotValue = {
  totalAssetValue: Prisma.Decimal;
};

export const calculateAssetPeriod = (
  snapshots: AssetSnapshotValue[],
  depositAmount: Prisma.Decimal,
  withdrawalAmount: Prisma.Decimal,
) => {
  const first = snapshots.at(0);
  const last = snapshots.at(-1);
  const netContribution = depositAmount.minus(withdrawalAmount);
  if (!first || !last || snapshots.length < 2) {
    return {
      assetChange: null,
      netContribution: netContribution.toString(),
      profitLoss: null,
      returnRate: null,
    };
  }
  const assetChange = last.totalAssetValue.minus(first.totalAssetValue);
  const profitLoss = assetChange.minus(netContribution);
  const returnRate = first.totalAssetValue.greaterThan(0)
    ? profitLoss.div(first.totalAssetValue).mul(100)
    : null;
  return {
    assetChange: assetChange.toString(),
    netContribution: netContribution.toString(),
    profitLoss: profitLoss.toString(),
    returnRate: returnRate?.toString() ?? null,
  };
};

export const calculatePointChange = (current: Prisma.Decimal, previous?: Prisma.Decimal) => {
  if (!previous) return { change: null, changeRate: null };
  const change = current.minus(previous);
  return {
    change: change.toString(),
    changeRate: previous.greaterThan(0) ? change.div(previous).mul(100).toString() : null,
  };
};


/** Snapshot-to-snapshot ledger interval; opening unrealized gains are excluded. */
export function calculatePeriodBreakdown(input: {
  openingUnrealized: Prisma.Decimal | null; closingUnrealized: Prisma.Decimal | null;
  realized: Prisma.Decimal | null; dividend: Prisma.Decimal | null; fees: Prisma.Decimal;
  profitLoss: string | null;
}) {
  const unrealizedChange = input.openingUnrealized !== null && input.closingUnrealized !== null
    ? input.closingUnrealized.minus(input.openingUnrealized) : null;
  const detailedProfitLoss = unrealizedChange !== null && input.dividend !== null && input.realized !== null
    ? unrealizedChange.plus(input.realized).plus(input.dividend).minus(input.fees) : null;
  return {
    unrealizedChange: unrealizedChange?.toString() ?? null,
    realizedProfitLoss: input.realized?.toString() ?? null, dividendIncome: input.dividend?.toString() ?? null,
    feeTaxAmount: input.fees.toString(), detailedProfitLoss: detailedProfitLoss?.toString() ?? null,
    reconciliationDifference: detailedProfitLoss !== null && input.profitLoss !== null
      ? new Prisma.Decimal(input.profitLoss).minus(detailedProfitLoss).toString() : null,
  };
}

export function compoundYearTarget(initial: Prisma.Decimal, contribution: Prisma.Decimal, rate: Prisma.Decimal, startYear: number, targetYear: number) {
  let value = initial;
  for (let year = startYear; year <= targetYear; year++) value = value.mul(rate.div(100).plus(1)).plus(contribution);
  return value.toString();
}
