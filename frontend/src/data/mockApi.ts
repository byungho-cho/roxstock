import { buyLots, dashboardData, stockItems } from './mockData';
import { loadCash } from './mockCash';
import type { BuyLot, DashboardData, StockItem, StockListType, TradeDraft } from '../types/models';

const delay = (milliseconds = 420) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function fetchDashboard(): Promise<DashboardData> {
  await delay();
  const data = structuredClone(dashboardData);
  data.summary.stockValue = data.holdings.reduce((sum, stock) => sum + (stock.marketValue ?? stock.quantity! * stock.currentPrice), 0);
  data.summary.stockPurchaseAmount = data.holdings.reduce((sum, stock) => sum + (stock.quantity ?? 0) * (stock.averagePrice ?? 0), 0);
  data.summary.cashBalance = loadCash().balance;
  data.summary.totalAssets = data.summary.stockValue + data.summary.cashBalance;
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
  const lots = stockId ? buyLots.filter((lot) => lot.stockId === stockId) : buyLots;
  return structuredClone(lots);
}

export async function createTrade(draft: TradeDraft): Promise<{ id: string; draft: TradeDraft }> {
  await delay(650);
  return { id: `mock-trade-${Date.now()}`, draft: structuredClone(draft) };
}
