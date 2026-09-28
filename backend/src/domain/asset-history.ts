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
