import { apiEnvelope, apiRequest } from './apiClient';

export type ServerListType = 'WATCHLIST' | 'HOLDING' | 'RECOMMENDED';
export type MarketType = 'KOSPI' | 'KOSDAQ' | 'KONEX' | 'OTHER';

export interface AccountDto {
  id: string;
  name: string;
  brokerName: string;
  accountNumber?: string | null;
  isDefault?: boolean;
  updatedAt?: string;
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
export type AccountWriteInput = { name: string; brokerName: string; accountNumber?: string | null; isDefault?: boolean };
export const createAccount = (body: AccountWriteInput) => apiRequest<{ id: string; cashBalance: string; isDefault: boolean }>('/accounts', { method: 'POST', body: JSON.stringify(body) });
export const updateAccount = (accountId: string, body: Partial<AccountWriteInput>) => apiRequest<AccountDto>(`/accounts/${encodeURIComponent(accountId)}`, { method: 'PATCH', body: JSON.stringify(body) });

/** The test-only backend accepts a fixed confirmation word; the UI additionally checks the account name. */
export const resetAccountData = (accountId: string) =>
  apiRequest<{ accountId: string; cashBalance: string; deleted: Record<string, number> }>(
    `/accounts/${encodeURIComponent(accountId)}/reset`,
    { method: 'POST', body: JSON.stringify({ confirmation: '초기화' }) },
  );

export const selectedAccountStorageKey = 'roxstock-selected-account-id';
export function chooseAccount(accounts: AccountDto[]) {
  const active = accounts.filter((item) => item.isActive);
  const configuredId = import.meta.env.VITE_API_ACCOUNT_ID;
  const selected = typeof window === 'undefined' ? null : window.localStorage.getItem(selectedAccountStorageKey);
  return active.find((item) => item.id === selected) ?? active.find((item) => item.id === configuredId) ?? active.find((item) => item.isDefault) ?? active[0];
}

export async function currentAccountId(): Promise<string> {
  const account = chooseAccount(await listAccounts());
  if (!account) throw new Error('활성 계좌가 없습니다.');
  return account.id;
}

export const getAccountDashboard = (accountId: string) => apiRequest<AccountDashboardDto>(`/accounts/${encodeURIComponent(accountId)}/dashboard`);
export const getAccountHoldings = (accountId: string) => apiRequest<HoldingDto[]>(`/accounts/${encodeURIComponent(accountId)}/holdings`);

export interface AssetHistoryDto {
  data: { date: string; totalAssetValue: string; cashBalance: string; stockValue: string; change: string | null; changeRate: string | null }[];
  summary: { profitLoss: string | null; returnRate: string | null };
}
export const getAssetHistory = (accountId: string) => apiEnvelope<AssetHistoryDto>(`/accounts/${encodeURIComponent(accountId)}/asset-history`);

export interface CashTransactionDto {
  id: string; transactionType: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND';
  transactionDate: string; amount: string; signedAmount: string; balanceAfter: string; memo: string | null;
}
export interface CashHistoryDto {
  data: CashTransactionDto[];
  meta: { total: number };
}
export interface CashOverviewDto {
  account: { id: string; name: string; currentBalance: string };
  monthly: { deposit: string; withdrawal: string };
  yearly: { deposit: string; withdrawal: string; dividend: string };
  recentTransactions: CashTransactionDto[];
}
export const getCashHistory = (accountId: string) => apiEnvelope<CashHistoryDto>(`/accounts/${encodeURIComponent(accountId)}/cash-transactions`);
export const getCashOverview = (accountId: string) => apiRequest<CashOverviewDto>(`/accounts/${encodeURIComponent(accountId)}/cash-overview`);

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
