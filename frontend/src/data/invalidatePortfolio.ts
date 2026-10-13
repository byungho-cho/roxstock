import type { QueryClient } from '@tanstack/react-query';

// Keep cached values visible while refreshing active screens; inactive screens refresh after invalidation on their next visit.
const portfolioQueryKeys = [
  'homePage', 'stocksPage', 'account-data-state', 'accounts', 'dashboard', 'analysis-dashboard', 'analysis-history', 'assetHistory',
  'investment', 'investment-profit', 'investment-profit-summary', 'cashBalance', 'cashOverview', 'cashTransactions', 'cashTransaction', 'cashTrend',
  'accountTradesSummary', 'stocks', 'accountTrades', 'buyLots', 'allBuyLots', 'stockTrades', 'journalTrades', 'tradeDetail',
  'targetArrivals', 'recentBuys', 'compound-plans', 'compound-assets', 'securityAnalysis',
] as const;

export async function invalidatePortfolio(client: QueryClient) {
  // Mark raw inputs stale before active derived queries refetch, otherwise they could reuse old data.
  await Promise.all(['profitAggregate', 'profitTrades', 'profitDividends', 'profitCapital'].map(key =>
    client.cancelQueries({ queryKey: [key] })));
  await Promise.all(['profitAggregate', 'profitTrades', 'profitDividends', 'profitCapital'].map(key =>
    client.invalidateQueries({ queryKey: [key], refetchType: 'none' })));
  return Promise.all(portfolioQueryKeys.map(key =>
    client.invalidateQueries({ queryKey: [key], refetchType: 'active' })));
}
