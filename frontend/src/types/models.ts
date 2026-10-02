export type StockListType = 'watchlist' | 'holding' | 'recommended' | 'traded';
export type CollectionStatus = 'success' | 'partial' | 'failed';
export type TradeType = 'buy' | 'sell';
export type CashEntryType = 'deposit' | 'withdrawal' | 'dividend' | 'buy' | 'sell';

export interface CashEntry {
  id: string;
  date: string;
  type: CashEntryType;
  amount: number;
  memo?: string;
  stockId?: string;
  grossAmount?: number;
}

export interface StockItem {
  id: string;
  watchlistItemId?: string;
  hasTradeHistory?: boolean;
  priceAvailable?: boolean;
  priceChangeAvailable?: boolean;
  symbol: string;
  name: string;
  listType: StockListType;
  currentPrice: number;
  priceChangeRate: number;
  quantity?: number;
  averagePrice?: number;
  purchaseAmount?: number;
  marketValue?: number;
  profitAmount?: number;
  profitRate?: number;
  per?: number;
  pbr?: number;
  valuationW?: number;
  roe?: number;
  /** 영업이익, 억원 단위. 값이 없으면 —로 표시한다. */
  operatingProfit?: number;
  previousOperatingProfit?: number;
  lastSoldAt?: string;
  realizedProfit?: number;
  note?: string;
  collectionStatus: CollectionStatus;
}

export interface BuyLot {
  id: string;
  stockId: string;
  stockName: string;
  tradeDate: string;
  buyPrice: number;
  quantity: number;
  soldQuantity: number;
  remainingQuantity: number;
}

export interface DashboardSummary {
  pricingComplete?: boolean;
  totalAssets: number;
  stockValue: number;
  stockPurchaseAmount: number;
  cashBalance: number;
  previousDayChange?: number;
  previousDayChangeRate?: number;
  dailyProfit: number;
  dailyProfitRate: number;
  stockMonthlyProfit: number;
  cashMonthlyProfit: number;
  totalProfit: number;
  totalProfitRate: number;
  collectedAt: string;
}

export interface AssetTrendPoint {
  label: string;
  value: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  holdings: StockItem[];
  trend: AssetTrendPoint[];
}

export interface TradeDraft {
  type: TradeType;
  stockId: string;
  lotId?: string;
  tradeDate: string;
  quantity: number;
  price: number;
  feeTaxAmount: number;
  memo: string;
}

export interface TradeEstimate {
  tradeAmount: number;
  realizedProfit?: number;
  cashChange: number;
  expectedCashBalance: number;
}

