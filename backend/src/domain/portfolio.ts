import { Prisma } from '../generated/prisma/index.js';

export interface PortfolioLotInput {
  securityId: bigint;
  symbol: string;
  name: string;
  marketType: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  soldQuantities: Prisma.Decimal[];
  currentPrice: Prisma.Decimal | null;
  previousClosePrice: Prisma.Decimal | null;
  priceUpdatedAt: Date | null;
  marketStatus: string | null;
}

export interface HoldingValue {
  securityId: bigint;
  symbol: string;
  name: string;
  marketType: string;
  quantity: Prisma.Decimal;
  purchaseAmount: Prisma.Decimal;
  averagePurchasePrice: Prisma.Decimal;
  currentPrice: Prisma.Decimal | null;
  previousClosePrice: Prisma.Decimal | null;
  marketValue: Prisma.Decimal | null;
  unrealizedProfitLoss: Prisma.Decimal | null;
  unrealizedReturnRate: Prisma.Decimal | null;
  priceChangeRate: Prisma.Decimal | null;
  priceUpdatedAt: Date | null;
  marketStatus: string | null;
}

export const calculateHoldings = (lots: PortfolioLotInput[]): HoldingValue[] => {
  const holdings = new Map<string, HoldingValue>();
  for (const lot of lots) {
    const soldQuantity = lot.soldQuantities.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
    const remainingQuantity = lot.quantity.minus(soldQuantity);
    if (!remainingQuantity.greaterThan(0)) continue;
    const key = lot.securityId.toString();
    const purchaseAmount = remainingQuantity.mul(lot.unitPrice);
    const prior = holdings.get(key);
    if (prior) {
      prior.quantity = prior.quantity.plus(remainingQuantity);
      prior.purchaseAmount = prior.purchaseAmount.plus(purchaseAmount);
      prior.averagePurchasePrice = prior.purchaseAmount.div(prior.quantity);
      continue;
    }
    holdings.set(key, {
      securityId: lot.securityId,
      symbol: lot.symbol,
      name: lot.name,
      marketType: lot.marketType,
      quantity: remainingQuantity,
      purchaseAmount,
      averagePurchasePrice: lot.unitPrice,
      currentPrice: lot.currentPrice,
      previousClosePrice: lot.previousClosePrice,
      marketValue: null,
      unrealizedProfitLoss: null,
      unrealizedReturnRate: null,
      priceChangeRate: null,
      priceUpdatedAt: lot.priceUpdatedAt,
      marketStatus: lot.marketStatus,
    });
  }
  for (const holding of holdings.values()) {
    if (holding.currentPrice) {
      holding.marketValue = holding.quantity.mul(holding.currentPrice);
      holding.unrealizedProfitLoss = holding.marketValue.minus(holding.purchaseAmount);
      holding.unrealizedReturnRate = holding.purchaseAmount.isZero()
        ? new Prisma.Decimal(0)
        : holding.unrealizedProfitLoss.div(holding.purchaseAmount).mul(100);
      if (holding.previousClosePrice?.isPositive()) {
        holding.priceChangeRate = holding.currentPrice.minus(holding.previousClosePrice)
          .div(holding.previousClosePrice).mul(100);
      }
    }
  }
  return [...holdings.values()].sort((left, right) => {
    if (left.marketValue && right.marketValue) return right.marketValue.comparedTo(left.marketValue);
    if (left.marketValue) return -1;
    if (right.marketValue) return 1;
    return left.name.localeCompare(right.name, 'ko');
  });
};

export const calculateDashboard = (cashBalance: Prisma.Decimal, holdings: HoldingValue[]) => {
  const purchaseAmount = holdings.reduce((sum, holding) => sum.plus(holding.purchaseAmount), new Prisma.Decimal(0));
  const pricingComplete = holdings.every((holding) => holding.marketValue !== null);
  const stockValue = pricingComplete
    ? holdings.reduce((sum, holding) => sum.plus(holding.marketValue ?? 0), new Prisma.Decimal(0))
    : null;
  const unrealizedProfitLoss = stockValue?.minus(purchaseAmount) ?? null;
  const unrealizedReturnRate = unrealizedProfitLoss && purchaseAmount.isPositive()
    ? unrealizedProfitLoss.div(purchaseAmount).mul(100)
    : pricingComplete ? new Prisma.Decimal(0) : null;
  const latestPriceUpdatedAt = holdings.reduce<Date | null>((latest, holding) => {
    if (!holding.priceUpdatedAt) return latest;
    return !latest || holding.priceUpdatedAt > latest ? holding.priceUpdatedAt : latest;
  }, null);
  return {
    cashBalance,
    purchaseAmount,
    stockValue,
    totalAssetValue: stockValue?.plus(cashBalance) ?? null,
    unrealizedProfitLoss,
    unrealizedReturnRate,
    pricingComplete,
    missingPriceSymbols: holdings.filter((holding) => holding.currentPrice === null).map((holding) => holding.symbol),
    latestPriceUpdatedAt,
  };
};
