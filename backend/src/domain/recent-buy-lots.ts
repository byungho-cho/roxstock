import type { Prisma } from '@roxstock/shared/prisma';
import { calculateRemainingQuantity } from './trade.js';

/** Select each buy Lot independently, before ordering and limiting recent buys. */
export function remainingBuyLots<T extends {quantity: Prisma.Decimal; sellTrades: {quantity: Prisma.Decimal}[]}>(lots: T[]): T[] {
  return lots.filter(lot => calculateRemainingQuantity(lot.quantity, lot.sellTrades.map(sell => sell.quantity)).gt(0));
}
