import { Prisma } from '../generated/prisma/index.js';

// Local precision: don't change Prisma's global Decimal configuration.
const Decimal = Prisma.Decimal.clone({ precision: 80 });
export type TargetCondition = { days: number; rate: string };
export const defaultTargetConditions: TargetCondition[] = [
  { days: 7, rate: '5' }, { days: 30, rate: '10' }, { days: 90, rate: '15' },
  { days: 180, rate: '20' }, { days: 365, rate: '30' },
];

export function validateTargetConditions(input: unknown): TargetCondition[] {
  if (!Array.isArray(input) || input.length > 5) throw new Error('조건은 최대 5개까지 등록할 수 있습니다.');
  const seen = new Set<number>();
  const result = input.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('조건의 기간과 수익률을 확인해 주세요.');
    const { days, rate } = row as Partial<TargetCondition>;
    if (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 1 || days > 2_147_483_647) throw new Error('보유기간은 1 이상의 정수여야 합니다.');
    if (typeof rate !== 'string' || !/^\d{1,5}(?:\.\d{1,4})?$/.test(rate) || !new Decimal(rate).gt(0)) throw new Error('목표수익률은 0 초과, 최대 99999.9999%의 소수 4자리 값이어야 합니다.');
    if (seen.has(days)) throw new Error('같은 보유기간 상한을 중복 등록할 수 없습니다.');
    seen.add(days);
    return { days, rate: new Decimal(rate).toString() };
  });
  return result.sort((a, b) => a.days - b.days);
}

export const seoulDate = (instant: Date) => new Date(instant.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
const calendarDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
export type TargetLotInput = {
  id: string; securityId: string; symbol: string; name: string; boughtAt: Date;
  quantity: string; soldQuantities: string[]; unitPrice: string;
  currentPrice: string | null; priceUpdatedAt: Date | null;
};

export function evaluateTargetLots(lots: TargetLotInput[], conditions: TargetCondition[], now = new Date()) {
  const today = seoulDate(now);
  const sorted = [...conditions].sort((a, b) => a.days - b.days);
  const quoteTimes: string[] = [];
  const unavailable: { lotId: string; name: string; reason: string }[] = [];
  const matches: {
    lot: TargetLotInput; buyDate: string; holdingDays: number; remaining: Prisma.Decimal;
    price: Prisma.Decimal; rate: Prisma.Decimal; profit: Prisma.Decimal; condition: TargetCondition;
  }[] = [];
  if (sorted.length === 0) return { data: [], unavailable, asOfDate: today, quoteTimes };
  for (const lot of lots) {
    const remaining = new Decimal(lot.quantity).minus(lot.soldQuantities.reduce((sum, q) => sum.plus(q), new Decimal(0)));
    if (remaining.eq(0)) continue;
    const invalid = (reason: string) => unavailable.push({ lotId: lot.id, name: lot.name, reason });
    if (!remaining.isFinite() || remaining.lt(0)) { invalid('INVALID_QUANTITY'); continue; }
    if (!Number.isFinite(lot.boughtAt.getTime())) { invalid('INVALID_BUY_DATE'); continue; }
    const buyDate = seoulDate(lot.boughtAt);
    const holdingDays = calendarDay(today) - calendarDay(buyDate);
    if (holdingDays < 0) { invalid('FUTURE_BUY_DATE'); continue; }
    const unitPrice = new Decimal(lot.unitPrice);
    if (!unitPrice.isFinite() || !unitPrice.gt(0)) { invalid('INVALID_BUY_PRICE'); continue; }
    if (lot.currentPrice === null || !lot.priceUpdatedAt) { invalid('PRICE_UNAVAILABLE'); continue; }
    const price = new Decimal(lot.currentPrice);
    if (!price.isFinite() || !price.gt(0) || !Number.isFinite(lot.priceUpdatedAt.getTime()) || lot.priceUpdatedAt > now) { invalid('PRICE_UNAVAILABLE'); continue; }
    quoteTimes.push(lot.priceUpdatedAt.toISOString());
    // Inclusive comparison without division or display rounding.
    const condition = sorted.find(c => holdingDays <= c.days && price.mul(100).gte(unitPrice.mul(new Decimal(100).plus(c.rate))));
    if (!condition) continue;
    matches.push({ lot, buyDate, holdingDays, remaining, price,
      rate: price.div(unitPrice).minus(1).mul(100), profit: price.minus(unitPrice).mul(remaining), condition });
  }
  matches.sort((a, b) => {
    // Exact cross multiplication for ratio ordering; no display-rounding ties.
    const rateOrder = new Decimal(b.lot.currentPrice!).mul(a.lot.unitPrice).comparedTo(new Decimal(a.lot.currentPrice!).mul(b.lot.unitPrice));
    return rateOrder || a.buyDate.localeCompare(b.buyDate) || (BigInt(a.lot.id) < BigInt(b.lot.id) ? -1 : BigInt(a.lot.id) > BigInt(b.lot.id) ? 1 : 0);
  });
  return { asOfDate: today, unavailable, quoteTimes, data: matches.map(m => ({
    lotId: m.lot.id, securityId: m.lot.securityId, symbol: m.lot.symbol, name: m.lot.name,
    buyDate: m.buyDate, holdingDays: m.holdingDays, remainingQuantity: m.remaining.toString(),
    unitPrice: m.lot.unitPrice, currentPrice: m.price.toString(), returnRate: m.rate.toString(),
    profitLoss: m.profit.toString(), representativeCondition: m.condition,
    priceUpdatedAt: m.lot.priceUpdatedAt!.toISOString(),
  })) };
}
