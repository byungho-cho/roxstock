import { buyLots } from './mockData';
import { getBuyTrades } from './mockBuyTrades';
import type { BuyLot, TradeDraft } from '../types/models';

export type MockSellTrade = TradeDraft & { id: string; type: 'sell'; lotId: string };

const storageKey = 'roxstock-demo-sell-trades';

export function getSellTrades(stockId?: string): MockSellTrade[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const trades = stored.filter((trade): trade is MockSellTrade => trade?.type === 'sell' && typeof trade.id === 'string' && typeof trade.lotId === 'string' && typeof trade.stockId === 'string' && Number.isInteger(trade.quantity) && trade.quantity > 0);
    return stockId ? trades.filter((trade) => trade.stockId === stockId) : trades;
  } catch {
    return [];
  }
}

export function getSellTrade(id: string): MockSellTrade | undefined {
  return getSellTrades().find((trade) => trade.id === id);
}

export function getAvailableLots(stockId?: string): BuyLot[] {
  const trades = getSellTrades();
  const savedLots: BuyLot[] = getBuyTrades().map((trade) => ({ id: trade.id, stockId: trade.stockId, stockName: '', tradeDate: trade.tradeDate, buyPrice: trade.price, quantity: trade.quantity, soldQuantity: 0, remainingQuantity: trade.quantity }));
  return [...buyLots, ...savedLots].filter((lot) => !stockId || lot.stockId === stockId).map((lot) => {
    const sold = trades.filter((trade) => trade.lotId === lot.id).reduce((sum, trade) => sum + trade.quantity, 0);
    return { ...lot, soldQuantity: lot.soldQuantity + sold, remainingQuantity: lot.remainingQuantity - sold };
  });
}

export function addSellTrade(draft: TradeDraft): MockSellTrade {
  const lot = getAvailableLots(draft.stockId).find((item) => item.id === draft.lotId);
  if (draft.type !== 'sell' || !lot || !Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > lot.remainingQuantity) {
    throw new Error('매도 가능한 수량을 다시 확인해 주세요.');
  }
  const trade: MockSellTrade = { ...draft, type: 'sell', lotId: lot.id, id: crypto.randomUUID() };
  localStorage.setItem(storageKey, JSON.stringify([...getSellTrades(), trade]));
  return trade;
}

export function updateSellTrade(id: string, draft: TradeDraft): void {
  const previous = getSellTrade(id);
  if (!previous || draft.type !== 'sell' || draft.stockId !== previous.stockId || draft.lotId !== previous.lotId || draft.quantity !== previous.quantity) {
    throw new Error('매수 항목과 수량은 변경할 수 없습니다. 매도 거래를 삭제한 뒤 다시 등록해 주세요.');
  }
  localStorage.setItem(storageKey, JSON.stringify(getSellTrades().map((trade) => trade.id === id ? { ...previous, tradeDate: draft.tradeDate, price: draft.price, feeTaxAmount: draft.feeTaxAmount, memo: draft.memo } : trade)));
}

export function deleteSellTrade(id: string): void {
  localStorage.setItem(storageKey, JSON.stringify(getSellTrades().filter((trade) => trade.id !== id)));
}
