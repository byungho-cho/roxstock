import type { TradeDraft } from '../types/models';

export type MockBuyTrade = TradeDraft & { id: string; type: 'buy' };

const storageKey = 'roxstock-demo-buy-trades';

export function getBuyTrades(stockId?: string): MockBuyTrade[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const trades = stored.filter((trade): trade is MockBuyTrade =>
      trade?.type === 'buy' && typeof trade.id === 'string' && typeof trade.stockId === 'string'
      && typeof trade.tradeDate === 'string' && Number.isInteger(trade.quantity) && trade.quantity > 0
      && Number.isFinite(trade.price) && trade.price > 0);
    return stockId ? trades.filter((trade) => trade.stockId === stockId) : trades;
  } catch {
    return [];
  }
}

export function getBuyTrade(id: string): MockBuyTrade | undefined {
  return getBuyTrades().find((trade) => trade.id === id);
}

export function addBuyTrade(draft: TradeDraft): MockBuyTrade {
  if (draft.type !== 'buy' || !Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.price <= 0) {
    throw new Error('매수 수량과 가격을 다시 확인해 주세요.');
  }
  const trade: MockBuyTrade = { ...draft, type: 'buy', id: `lot-${crypto.randomUUID()}` };
  localStorage.setItem(storageKey, JSON.stringify([...getBuyTrades(), trade]));
  return trade;
}

export function updateBuyTrade(id: string, draft: TradeDraft, soldQuantity: number): void {
  const previous = getBuyTrade(id);
  if (!previous || draft.type !== 'buy' || draft.stockId !== previous.stockId || draft.quantity < soldQuantity) {
    throw new Error(`연결된 매도 수량 ${soldQuantity}주보다 매수 수량을 줄일 수 없습니다.`);
  }
  localStorage.setItem(storageKey, JSON.stringify(getBuyTrades().map((trade) =>
    trade.id === id ? { ...previous, tradeDate: draft.tradeDate, quantity: draft.quantity, price: draft.price, feeTaxAmount: draft.feeTaxAmount, memo: draft.memo } : trade)));
}

export function deleteBuyTrade(id: string, soldQuantity: number): void {
  if (soldQuantity > 0) throw new Error('연결된 매도 거래를 먼저 삭제해 주세요.');
  localStorage.setItem(storageKey, JSON.stringify(getBuyTrades().filter((trade) => trade.id !== id)));
}
