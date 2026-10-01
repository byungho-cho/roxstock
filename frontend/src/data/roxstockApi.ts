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
  valuation?: ValuationDto | null;
  operatingProfit?: string | null;
  previousOperatingProfit?: string | null;
}

export interface ValuationDto {
  metricDate: string; eps: string | null; bps: string | null; per: string | null;
  pbr: string | null; roe: string | null; dividendPerShare: string | null;
  dividendYield: string | null; marketCap: string | null;
}
export interface FinancialStatementDto {
  fiscalYear: number; periodType: 'ANNUAL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'; periodEndDate: string;
  revenue: string | null; operatingProfit: string | null; netIncome: string | null;
  totalAssets: string | null; totalLiabilities: string | null; totalEquity: string | null;
  operatingCashFlow: string | null; capitalExpenditure: string | null;
  source?: string; isDerived?: boolean; dartSource?: { receiptNo: string; reportName: string; fsDivision: 'CFS' | 'OFS'; collectedAt: string; source: string } | null;
}
export interface SecurityAnalysisDto {
  security: SecurityDto; valuation: ValuationDto | null; previousValuation: ValuationDto | null;
  fundamentals: { controllingProfit: string | null; issuedShares: string | null; treasuryShares: string | null; previousEquity: string | null } | null;
  statements: FinancialStatementDto[];
}
export const getSecurityAnalysis = (securityId: string, fiscalYear?: number) => apiRequest<SecurityAnalysisDto>(`/securities/${encodeURIComponent(securityId)}/analysis${fiscalYear === undefined ? '' : `?fiscalYear=${fiscalYear}`}`);
export type AnalysisWriteInput = Partial<Record<'operatingProfit' | 'controllingProfit' | 'issuedShares' | 'treasuryShares' | 'assets' | 'liabilities' | 'equity' | 'previousEquity' | 'dividend' | 'memo', string | null>>;
export const updateSecurityAnalysis = (securityId: string, body: AnalysisWriteInput) =>
  apiRequest<{ updated: true }>(`/securities/${encodeURIComponent(securityId)}/analysis`, { method: 'PATCH', body: JSON.stringify(body) });
export const createSecurity = (body: { symbol: string; name: string; marketType: MarketType; listType: 'WATCHLIST' | 'RECOMMENDED' }) =>
  apiRequest<SecurityDto>('/securities', { method: 'POST', body: JSON.stringify(body) });
export const updateSecurityPrice = (securityId: string, currentPrice: string) =>
  apiRequest<{ currentPrice: string; previousClosePrice: string | null; priceUpdatedAt: string }>(`/securities/${encodeURIComponent(securityId)}/price`, { method: 'PATCH', body: JSON.stringify({ currentPrice }) });

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
  previousDayChange: string | null;
  previousDayChangeRate: string | null;
  dailyProfit: string | null;
  dailyProfitRate: string | null;
  stockMonthlyProfit: string | null;
  cashMonthlyProfit: string | null;
  performanceMeta: {
    timezone: 'Asia/Seoul'; asOfDate: string; calculatedAt: string;
    previousDayBaselineDate: string | null; previousMonthEndBaselineDate: string | null;
    todayDepositAmount: string; todayWithdrawalAmount: string;
    dailyProfitUnavailableReason: string | null; dailyProfitRateUnavailableReason: string | null;
    stockMonthlyProfitUnavailableReason: string | null; cashMonthlyProfitUnavailableReason: string | null;
    calculationMethod: 'NET_FLOW_ADJUSTED_SIMPLE';
  };
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
  dividend: { id: string; securityId: string; securityName: string; grossAmount: string; netAmount: string } | null;
}
export interface CashHistoryDto {
  data: CashTransactionDto[];
  meta: { total: number; limit: number; offset: number };
}
export interface CashOverviewDto {
  account: { id: string; name: string; currentBalance: string; updatedAt: string };
  monthly: { deposit: string; withdrawal: string; dividend: string; netChange: string };
  yearly: { deposit: string; withdrawal: string; dividend: string; netChange: string };
  recentTransactions: CashTransactionDto[];
}
export const getCashHistory = (accountId: string, limit = 20, offset = 0, range?: { from: string; to: string }) => apiEnvelope<CashHistoryDto>(`/accounts/${encodeURIComponent(accountId)}/cash-transactions?${new URLSearchParams({ limit: String(limit), offset: String(offset), ...range })}`);
export const getCashOverview = (accountId: string, year?: number, month?: number) => {
  const params = new URLSearchParams();
  if (year !== undefined) params.set('year', String(year));
  if (month !== undefined) params.set('month', String(month));
  return apiRequest<CashOverviewDto>(`/accounts/${encodeURIComponent(accountId)}/cash-overview${params.size ? `?${params}` : ''}`);
};

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
export interface TradeDetailDto {
  id: string; type: 'BUY' | 'SELL';
  account: { id: string; name: string };
  security: TradeDto['security'];
  boughtAt?: string; soldAt?: string; buyTradeId?: string;
  quantity: string; soldQuantity?: string; remainingQuantity?: string;
  unitPrice: string; memo: string | null;
  cashTransaction: { id: string; feeTaxAmount: string; balanceAfter: string } | null;
  sellTrades?: { id: string; soldAt: string; quantity: string }[];
}
const tradePath = (type: 'buy' | 'sell', tradeId: string) => `/${type}-trades/${encodeURIComponent(tradeId)}`;
export const getTradeDetail = (type: 'buy' | 'sell', tradeId: string) => apiRequest<TradeDetailDto>(tradePath(type, tradeId));
export const updateTrade = (type: 'buy' | 'sell', tradeId: string, body: { quantity: string; unitPrice: string; memo: string | null; boughtAt?: string; soldAt?: string }) =>
  apiRequest<{ id: string; remainingQuantity: string; cashBalanceAdjusted: false }>(tradePath(type, tradeId), { method: 'PATCH', body: JSON.stringify(body) });
export const deleteTrade = (type: 'buy' | 'sell', tradeId: string, cascadeSells = false) =>
  apiRequest<{ id: string; deleted: boolean; deletedSellCount?: number }>(`${tradePath(type, tradeId)}${cascadeSells ? '?cascadeSells=true' : ''}`, { method: 'DELETE' });
export const createCashTransaction = (body: { accountId: string; transactionType: 'DEPOSIT' | 'WITHDRAWAL'; transactionDate: string; amount: string; memo: string | null }) => apiRequest<{ id: string; balanceAfter: string }>('/cash-transactions', { method: 'POST', body: JSON.stringify(body) });
export const createDividend = (body: { accountId: string; securityId: string; receivedDate: string; grossAmount: string; netAmount: string; memo: string | null }) => apiRequest<{ id: string; cashTransactionId: string; balanceAfter: string }>('/dividends', { method: 'POST', body: JSON.stringify(body) });
export const updateCashTransaction = (transactionId: string, body: { transactionDate: string; amount: string; memo: string | null; securityId?: string; grossAmount?: string }) => apiRequest<{ id: string; cashBalanceAdjusted: false }>(`/cash-transactions/${encodeURIComponent(transactionId)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteCashTransaction = (transactionId: string) => apiRequest<{ id: string; cashBalanceAdjusted: false }>(`/cash-transactions/${encodeURIComponent(transactionId)}`, { method: 'DELETE' });
export const correctCashBalance = (accountId: string, amount: string) => apiRequest<{ accountId: string; previousBalance: string; cashBalance: string }>(`/accounts/${encodeURIComponent(accountId)}/cash-balance`, { method: 'PATCH', body: JSON.stringify({ amount }) });
export type CollectionStatusDto = { latestRun: { id: string; status: string; startedAt: string; finishedAt: string | null; successCount: number; failureCount: number; failureReason: string | null } | null; latestPriceAt: string | null; manualRunAvailable: false; settingsAvailable: false };
export const getCollectionStatus = () => apiRequest<CollectionStatusDto>('/collection/status');
export interface CollectionMonitorSummary {
  generatedAt: string; timezone: string;
  features: Array<{ id: string; name: string; schedule: string; status: string; lastAttemptAt: string | null; lastSuccessAt: string | null; lastDataAt: string | null; statsGeneratedAt: string; nextAt: string | null;
    recent: { target: number; processed: number; success: number; failed: number; skipped: number }; lastError?: string | null; failureReason?: string | null; phase?: string; backfillCompletedAt?: string | null; backfill?: { planned: number; success: number; noFiling: number; notApplicable: number; failed: number; pending: number }; priorityPending?: number; universePending?: number; dailyApiCalls?: number; dailyApiLimit?: number; companyChecks?: number; lastCollectedAt?: string | null; latestReceiptDate?: string | null;
    realtime?: { workerStatus: string; heartbeatAt: string | null; session: string; cycleStartedAt: string | null; cycleFinishedAt: string | null; lastPriceReceivedAt: string | null; lastSourcePriceAt: string | null; lastSsePublishedAt: string | null; lastDbSavedAt: string | null; sourceError: string | null; publishError: string | null; saveError: string | null; counts: Record<string, number> } }>;
}
export const getCollectionMonitorSummary = () => apiRequest<CollectionMonitorSummary>('/collection/monitoring');
export const getCollectionMonitorDetail = (feature: string, query: Record<string, string> = {}) => {
  const params = new URLSearchParams(query);
  return apiRequest<Record<string, unknown>>(`/collection/monitoring/${encodeURIComponent(feature)}${params.size ? `?${params.toString()}` : ''}`);
};

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
  buyDate: string;
  holdingDays: number;
  currentPrice: string | null;
  returnRate: string | null;
  profitLoss: string | null;
  priceUpdatedAt: string | null;
  valuationStatus: 'AVAILABLE' | 'UNAVAILABLE';
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

