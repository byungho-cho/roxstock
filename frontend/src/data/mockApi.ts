import { dashboardData, stockItems } from './mockData';
import { loadCash } from './mockCash';
import { addBuyTrade } from './mockBuyTrades';
import { addSellTrade, getAvailableLots } from './mockSellTrades';
import type { BuyLot, DashboardData, StockItem, StockListType, TradeDraft } from '../types/models';
import { liveApiEnabled } from './liveData';
import { createBuyTrade, createSellTrade, currentAccountId } from './roxstockApi';

const delay = (milliseconds = 420) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function fetchDashboard(): Promise<DashboardData> {
  await delay();
  const data = structuredClone(dashboardData);
  data.summary.stockValue = data.holdings.reduce((sum, stock) => sum + (stock.marketValue ?? (stock.quantity ?? 0) * stock.currentPrice), 0);
  data.summary.stockPurchaseAmount = data.holdings.reduce((sum, stock) => sum + (stock.quantity ?? 0) * (stock.averagePrice ?? 0), 0);
  data.summary.cashBalance = loadCash().balance;
  data.summary.totalAssets = data.summary.stockValue + data.summary.cashBalance;
  if (data.trend.length) data.trend[data.trend.length - 1].value = data.summary.totalAssets;
  data.summary.totalProfit = data.summary.stockValue - data.summary.stockPurchaseAmount;
  data.summary.totalProfitRate = data.summary.stockPurchaseAmount ? data.summary.totalProfit / data.summary.stockPurchaseAmount * 100 : 0;
  return data;
}

export async function fetchStocks(listType?: StockListType): Promise<StockItem[]> {
  await delay();
  const stocks = listType ? stockItems.filter((stock) => stock.listType === listType) : stockItems;
  return structuredClone(stocks);
}

export async function fetchBuyLots(stockId?: string): Promise<BuyLot[]> {
  await delay(280);
  const lots = getAvailableLots(stockId);
  return structuredClone(lots);
}

export async function createTrade(draft: TradeDraft): Promise<{ id: string; draft: TradeDraft }> {
  if (liveApiEnabled) {
    const tradedAt = new Date(`${draft.tradeDate}T12:00:00+09:00`).toISOString();
    const fields = { quantity: String(draft.quantity), unitPrice: String(draft.price), feeTaxAmount: String(draft.feeTaxAmount), memo: draft.memo || null };
    if (draft.type === 'sell') {
      if (!draft.lotId) throw new Error('연결할 매수 Lot이 없습니다.');
      const result = await createSellTrade({ buyTradeId: draft.lotId, soldAt: tradedAt, ...fields });
      return { id: result.id, draft };
    }
    const result = await createBuyTrade({
      accountId: await currentAccountId(), securityId: draft.stockId,
      boughtAt: tradedAt, ...fields,
    });
    return { id: result.id, draft };
  }
  await delay(650);
  return { id: draft.type === 'sell' ? addSellTrade(draft).id : addBuyTrade(draft).id, draft: structuredClone(draft) };
}
