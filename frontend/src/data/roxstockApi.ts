import { apiEnvelope, apiRequest } from './apiClient';

export type ServerListType = 'WATCHLIST' | 'HOLDING' | 'RECOMMENDED';
export type MarketType = 'KOSPI' | 'KOSDAQ' | 'KONEX' | 'OTHER';

export interface AccountDto {
  id: string;
  name: string;
  brokerName: string;
  cashBalance: string;
  isActive: boolean;
}

export interface SecurityDto {
  id: string;
  symbol: string;
  name: string;
  marketType: MarketType;
  securityType: string;
  listType: ServerListType | null;
  watchlistItemId: string | null;
  targetBuyPrice: string | null;
  priority: number | null;
  memo: string | null;
  currentPrice: string | null;
  previousClosePrice: string | null;
  priceUpdatedAt: string | null;
}

export interface HoldingDto {
  securityId: string;
  symbol: string;
  name: string;
  marketType: MarketType;
  quantity: string;
  purchaseAmount: string;
  averagePurchasePrice: string;
  currentPrice: string | null;
  previousClosePrice: string | null;
  marketValue: string | null;
  unrealizedProfitLoss: string | null;
  unrealizedReturnRate: string | null;
  priceChangeRate: string | null;
  priceUpdatedAt: string | null;
  marketStatus: string | null;
}

export interface AccountDashboardDto {
  account: Pick<AccountDto, 'id' | 'name' | 'brokerName'>;
  cashBalance: string;
  purchaseAmount: string;
  stockValue: string | null;
  totalAssetValue: string | null;
  unrealizedProfitLoss: string | null;
  unrealizedReturnRate: string | null;
  pricingComplete: boolean;
  missingPriceSymbols: string[];
  latestPriceUpdatedAt: string | null;
  holdings: HoldingDto[];
}

export interface SecuritySearch {
  query?: string;
  marketType?: MarketType;
  listType?: ServerListType;
  excludeRegistered?: boolean;
  limit?: number;
  offset?: number;
}

export const listAccounts = () => apiRequest<AccountDto[]>('/accounts');

// The current UI has no account switcher. Use the first active account in server display order.
export async function currentAccountId(): Promise<string> {
  const configuredId = import.meta.env.VITE_API_ACCOUNT_ID;
  if (configuredId) {
    const account = (await listAccounts()).find((item) => item.id === configuredId && item.isActive);
    if (!account) throw new Error('설정한 계좌를 찾을 수 없거나 비활성 상태입니다.');
    return account.id;
  }
  const account = (await listAccounts()).find((item) => item.isActive);
  if (!account) throw new Error('활성 계좌가 없습니다.');
  return account.id;
}

export const getAccountDashboard = (accountId: string) => apiRequest<AccountDashboardDto>(`/accounts/${encodeURIComponent(accountId)}/dashboard`);
export const getAccountHoldings = (accountId: string) => apiRequest<HoldingDto[]>(`/accounts/${encodeURIComponent(accountId)}/holdings`);

export function listSecurities(search: SecuritySearch = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (value !== undefined && value !== '') params.set(key, String(value));
  return apiRequest<SecurityDto[]>(`/securities${params.size ? `?${params}` : ''}`);
}

export interface WatchlistInput {
  securityId: string;
  listType: 'WATCHLIST' | 'RECOMMENDED';
  targetBuyPrice?: string | null;
  priority?: number;
  memo?: string | null;
}

export const createWatchlistItem = (body: WatchlistInput) => apiRequest<SecurityDto>('/watchlist-items', { method: 'POST', body: JSON.stringify(body) });
export const updateWatchlistItem = (watchlistItemId: string, body: Partial<Omit<WatchlistInput, 'securityId'>>) => apiRequest<SecurityDto>(`/watchlist-items/${encodeURIComponent(watchlistItemId)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteWatchlistItem = (watchlistItemId: string) => apiRequest<void>(`/watchlist-items/${encodeURIComponent(watchlistItemId)}`, { method: 'DELETE' });

export interface BuyTradeInput {
  accountId: string;
  securityId: string;
  boughtAt: string;
  quantity: string;
  unitPrice: string;
  feeTaxAmount: string;
  memo: string | null;
}
export interface SellTradeInput {
  buyTradeId: string;
  soldAt: string;
  quantity: string;
  unitPrice: string;
  feeTaxAmount: string;
  memo: string | null;
}
export interface TradeResult { id: string; cashTransactionId: string; amount: string; feeTaxAmount: string; balanceAfter: string; remainingQuantity?: string; realizedProfitLoss?: string }
export const createBuyTrade = (body: BuyTradeInput) => apiRequest<TradeResult>('/buy-trades', { method: 'POST', body: JSON.stringify(body) });
export const createSellTrade = (body: SellTradeInput) => apiRequest<TradeResult>('/sell-trades', { method: 'POST', body: JSON.stringify(body) });
export const createCashTransaction = (body: { accountId: string; transactionType: 'DEPOSIT' | 'WITHDRAWAL'; transactionDate: string; amount: string; memo: string | null }) => apiRequest<{ id: string; balanceAfter: string }>('/cash-transactions', { method: 'POST', body: JSON.stringify(body) });

export interface TradeDto {
  id: string;
  type: 'BUY' | 'SELL';
  buyTradeId: string;
  tradedAt: string;
  security: { id: string; symbol: string; name: string; marketType: MarketType };
  quantity: string;
  unitPrice: string;
  amount: string;
  realizedProfitLoss: string | null;
  memo: string | null;
}
export interface TradeReport {
  data: TradeDto[];
  summary: { buyAmount: string; sellAmount: string; realizedProfitLoss: string };
  daily: { date: string; buyCount: number; sellCount: number; buyAmount: string; sellAmount: string; realizedProfitLoss: string }[];
}
export interface BuyLotDto {
  id: string;
  boughtAt: string;
  security: TradeDto['security'];
  quantity: string;
  soldQuantity: string;
  remainingQuantity: string;
  unitPrice: string;
  remainingPurchaseAmount: string;
  memo: string | null;
  sellTrades: { id: string; soldAt: string; quantity: string; unitPrice: string }[];
}
export const getTrades = (accountId: string, search: { from?: string; to?: string; securityId?: string } = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (value) params.set(key, value);
  return apiEnvelope<TradeReport>(`/accounts/${encodeURIComponent(accountId)}/trades${params.size ? `?${params}` : ''}`);
};
export const getBuyLots = (accountId: string, securityId?: string, remainingOnly = true) => {
  const params = new URLSearchParams({ remainingOnly: String(remainingOnly) });
  if (securityId) params.set('securityId', securityId);
  return apiRequest<BuyLotDto[]>(`/accounts/${encodeURIComponent(accountId)}/buy-lots?${params}`);
};
