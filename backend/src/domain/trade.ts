import { Prisma } from '../generated/prisma/index.js';

export function calculateBuyBalance(
  cashBalance: Prisma.Decimal,
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  feeTaxAmount: Prisma.Decimal,
) {
  const amount = quantity.mul(unitPrice);
  return { amount, balanceAfter: cashBalance.minus(amount).minus(feeTaxAmount) };
}

export function calculateSellBalance(
  cashBalance: Prisma.Decimal,
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  feeTaxAmount: Prisma.Decimal,
) {
  const amount = quantity.mul(unitPrice);
  return { amount, balanceAfter: cashBalance.plus(amount).minus(feeTaxAmount) };
}

export function calculateRemainingQuantity(
  boughtQuantity: Prisma.Decimal,
  soldQuantities: Prisma.Decimal[],
) {
  return soldQuantities.reduce(
    (remaining, soldQuantity) => remaining.minus(soldQuantity),
    boughtQuantity,
  );
}
