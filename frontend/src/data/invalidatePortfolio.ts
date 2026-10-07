import type { QueryClient } from '@tanstack/react-query';

// Keep cached values visible while refreshing active screens; inactive screens refresh after invalidation on their next visit.
const portfolioQueryKeys = [
  'accounts', 'dashboard', 'analysis-dashboard', 'analysis-history', 'assetHistory',
  'investment', 'investment-profit', 'cashBalance', 'cashOverview', 'cashTransactions', 'cashTrend',
  'stocks', 'accountTrades', 'buyLots', 'allBuyLots', 'stockTrades', 'journalTrades', 'tradeDetail',
  'targetArrivals', 'recentBuys', 'compound-plans', 'securityAnalysis',
] as const;

export function invalidatePortfolio(client: QueryClient) {
  return Promise.all(portfolioQueryKeys.map(key =>
    client.invalidateQueries({ queryKey: [key], refetchType: 'active' })));
}
