import { Prisma } from '../generated/prisma/index.js';
import { seoulDate } from './target-arrival.js';

const Decimal = Prisma.Decimal.clone({ precision: 80 });
// Recent buys value the original buy quantity, including fully sold historical lots.
// Target arrivals separately value only the remaining quantity.
export function valueBuyLot(boughtAt: Date, quantity: string, unitPrice: string, currentPrice: string | null, priceUpdatedAt: Date | null, now = new Date()) {
  const buyDate = seoulDate(boughtAt);
  const holdingDays = (Date.parse(seoulDate(now)) - Date.parse(buyDate)) / 86_400_000;
  const cost = new Decimal(unitPrice); const amount = new Decimal(quantity);
  const price = currentPrice === null ? null : new Decimal(currentPrice);
  const valid = holdingDays >= 0 && cost.isFinite() && cost.gt(0) && amount.isFinite() && amount.gt(0)
    && price?.isFinite() && price.gt(0) && priceUpdatedAt && Number.isFinite(priceUpdatedAt.getTime()) && priceUpdatedAt <= now;
  return { buyDate, holdingDays, currentPrice: valid ? price!.toFixed() : null,
    returnRate: valid ? price!.div(cost).minus(1).mul(100).toFixed() : null,
    profitLoss: valid ? price!.minus(cost).mul(amount).toFixed() : null,
    priceUpdatedAt: valid ? priceUpdatedAt!.toISOString() : null, valuationStatus: valid ? 'AVAILABLE' : 'UNAVAILABLE' };
}
