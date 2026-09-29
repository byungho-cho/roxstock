import type { DashboardData, StockItem, StockListType } from '../types/models';
import { currentAccountId, getAccountDashboard, getAccountHoldings, getAssetHistory, getBuyLots, listSecurities, type HoldingDto, type SecurityDto, type ServerListType } from './roxstockApi';
import type { BuyLot } from '../types/models';

/** Enable only after the backend and same-origin /api proxy have been deployed. */
export const liveApiEnabled = import.meta.env.VITE_DATA_SOURCE === 'api';

const listTypeMap: Record<StockListType, ServerListType> = {
  watchlist: 'WATCHLIST', holding: 'HOLDING', recommended: 'RECOMMENDED',
};

const decimal = (value: string | null | undefined) => value === null || value === undefined ? undefined : Number(value);
const priceChange = (current: number | undefined, previous: number | undefined) =>
  current !== undefined && previous ? (current - previous) / previous * 100 : Number.NaN;

export function mapSecurity(stock: SecurityDto): StockItem {
  const currentPrice = decimal(stock.currentPrice);
  return {
    id: stock.id, symbol: stock.symbol, name: stock.name,
    listType: (stock.listType?.toLowerCase() ?? 'watchlist') as StockListType,
    currentPrice: currentPrice ?? Number.NaN,
    priceChangeRate: priceChange(currentPrice, decimal(stock.previousClosePrice)),
    note: stock.memo ?? undefined,
    collectionStatus: currentPrice === undefined ? 'failed' : 'success',
    watchlistItemId: stock.watchlistItemId ?? undefined,
    priceAvailable: currentPrice !== undefined,
    priceChangeAvailable: currentPrice !== undefined && decimal(stock.previousClosePrice) !== undefined,
  };
}

export function mapHolding(holding: HoldingDto): StockItem {
  const currentPrice = decimal(holding.currentPrice);
  return {
    id: holding.securityId, symbol: holding.symbol, name: holding.name, listType: 'holding',
    currentPrice: currentPrice ?? Number.NaN,
    priceChangeRate: decimal(holding.priceChangeRate) ?? Number.NaN,
    quantity: Number(holding.quantity), averagePrice: Number(holding.averagePurchasePrice),
    marketValue: decimal(holding.marketValue), profitAmount: decimal(holding.unrealizedProfitLoss),
    profitRate: decimal(holding.unrealizedReturnRate),
    priceAvailable: currentPrice !== undefined,
    priceChangeAvailable: decimal(holding.priceChangeRate) !== undefined,
    collectionStatus: currentPrice === undefined ? 'failed' : 'success',
  };
}

export async function fetchLiveStocks(listType?: StockListType): Promise<StockItem[]> {
  if (listType === 'holding') return (await getAccountHoldings(await currentAccountId())).map(mapHolding);
  if (listType) return (await listSecurities({ listType: listTypeMap[listType] })).map(mapSecurity);
  const [catalog, holdings] = await Promise.all([listSecurities(), getAccountHoldings(await currentAccountId())]);
  const holdingById = new Map(holdings.map((item) => [item.securityId, item]));
  return catalog.map((item) => holdingById.has(item.id) ? mapHolding(holdingById.get(item.id)!) : mapSecurity(item));
}

export async function fetchLiveDashboard(): Promise<DashboardData> {
  const accountId = await currentAccountId();
  const [response, history] = await Promise.all([getAccountDashboard(accountId), getAssetHistory(accountId)]);
  const holdings = response.holdings.map(mapHolding);
  const stockValue = decimal(response.stockValue);
  const totalAssets = decimal(response.totalAssetValue);
  return {
    summary: {
      totalAssets: totalAssets ?? Number.NaN, stockValue: stockValue ?? Number.NaN,
      stockPurchaseAmount: Number(response.purchaseAmount), cashBalance: Number(response.cashBalance),
      dailyProfit: decimal(response.dailyProfit) ?? Number.NaN,
      dailyProfitRate: decimal(response.dailyProfitRate) ?? Number.NaN,
      stockMonthlyProfit: decimal(response.stockMonthlyProfit) ?? Number.NaN,
      cashMonthlyProfit: decimal(response.cashMonthlyProfit) ?? Number.NaN,
      totalProfit: decimal(response.unrealizedProfitLoss) ?? Number.NaN,
      totalProfitRate: decimal(response.unrealizedReturnRate) ?? Number.NaN,
      collectedAt: response.latestPriceUpdatedAt ?? '',
      pricingComplete: response.pricingComplete,
    },
    holdings,
    trend: history.data.slice(-365).map((point) => ({ label: point.date, value: Number(point.totalAssetValue) })),
  };
}

export async function fetchLiveBuyLots(stockId?: string): Promise<BuyLot[]> {
  const lots = await getBuyLots(await currentAccountId(), stockId);
  return lots.map((lot) => ({
    id: lot.id, stockId: lot.security.id, stockName: lot.security.name,
    tradeDate: new Date(lot.boughtAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    buyPrice: Number(lot.unitPrice), quantity: Number(lot.quantity),
    soldQuantity: Number(lot.soldQuantity), remainingQuantity: Number(lot.remainingQuantity),
  }));
}
