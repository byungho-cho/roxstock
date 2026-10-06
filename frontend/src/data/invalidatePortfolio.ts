import type { QueryClient } from '@tanstack/react-query';

// Keep cached values visible while refreshing both active and previously visited screens.
const portfolioQueryKeys = [
  'accounts', 'dashboard', 'analysis-dashboard', 'analysis-history', 'assetHistory',
  'investment', 'investment-profit', 'cashBalance', 'cashOverview', 'cashTransactions', 'cashTrend',
  'stocks', 'buyLots', 'allBuyLots', 'stockTrades', 'journalTrades', 'tradeDetail',
  'targetArrivals', 'recentBuys', 'compound-plans', 'securityAnalysis',
] as const;

export function invalidatePortfolio(client: QueryClient) {
  return Promise.all(portfolioQueryKeys.map(key =>
    client.invalidateQueries({ queryKey: [key], refetchType: 'all' })));
}
