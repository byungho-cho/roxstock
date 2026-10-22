import { mapDashboardResponse, mapHolding, mapSecurity } from '../data/liveData';
import { deriveAccountStocksFromSummary } from '../pages/stocks/stockMath';
import { storedQueryOptions } from '../data/storedQueryOptions';
import { getDashboardTrend, getStockTradeSummary } from '../data/roxstockApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBuyLots, fetchDashboard, fetchStocks } from '../data/mockApi';
import { fetchLiveBuyLots, fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../data/liveData';
import type { StockListType } from '../types/models';
import { useActiveAccount } from './useActiveAccount';

const PRICE_REFRESH_INTERVAL_MS = 5 * 60_000;

export function useDashboard({ pollPrices = false, includeTrend = true, deferTrend = false }: { pollPrices?: boolean; includeTrend?: boolean; deferTrend?: boolean } = {}) {
  const { accountId, page, pageMode, screen } = useActiveAccount();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`);
  monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const from = monthAgo.toISOString().slice(0, 10);
  const summary = useQuery({
    ...storedQueryOptions, staleTime:30_000,
    queryKey: ['dashboard', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: ({signal}) => liveApiEnabled ? fetchLiveDashboard(accountId, false, signal) : fetchDashboard(),
    enabled: !pageMode && (!liveApiEnabled || !!accountId),
    refetchInterval: liveApiEnabled && pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  const history = useQuery({
    ...storedQueryOptions,
    queryKey: ['assetHistory', accountId, 'dashboard', from, today],
    queryFn: ({ signal }) => getDashboardTrend(accountId!, { from, to: today }, signal), enabled: includeTrend && (!deferTrend || !summary.isPending) && liveApiEnabled && !!accountId && !pageMode,
    staleTime: 30_000, refetchInterval: pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
  });
  if (pageMode && screen === 'home') {
    const report = page.data;
    return { ...page, data: report?.dashboard ? mapDashboardResponse(report.dashboard) : undefined,
      historyData: report?.trend ?? undefined, historyRefetch: page.refetch,
      historyPending: page.isPending, historyError: page.isError || report?.trend === null, historySettled: !page.isPending };
  }
  return { ...summary, historyData: history.data, historyRefetch: history.refetch, historyPending: history.isPending, historyError: history.isError, historySettled: !history.isPending, data: summary.data ? { ...summary.data, trend: liveApiEnabled ? (history.data?.data ?? []).map(point => ({label: point.date, value: point.totalAssetValue == null ? Number.NaN : Number(point.totalAssetValue)})) : summary.data.trend } : undefined };
}

export function useStocks(listType?: StockListType, options: { enabled?: boolean; forceFetch?: boolean } = {}) {
  const { accountId, page, pageMode, screen } = useActiveAccount(), client = useQueryClient();
  const query = useQuery({
    queryKey: ['stocks', listType ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: () => liveApiEnabled ? fetchLiveStocks(listType, accountId, client.fetchQuery({ ...storedQueryOptions, queryKey: ['accountTradesSummary', accountId], queryFn: ({signal}) => getStockTradeSummary(accountId!, signal) })) : fetchStocks(listType),
    enabled: (!pageMode || options.forceFetch === true) && options.enabled !== false && (!liveApiEnabled || !!accountId),
    refetchInterval: liveApiEnabled ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  if (pageMode && screen === 'stocks' && !options.forceFetch) {
    const data = page.data?.stocks;
    const stocks = data ? deriveAccountStocksFromSummary(data.catalog.map(mapSecurity), data.holdings.map(mapHolding), data.trades) : undefined;
    return { ...page, data: listType ? stocks?.filter(stock => stock.listType === listType) : stocks };
  }
  return query;
}

export function useBuyLots(stockId?: string, options: { enabled?: boolean } = {}) {
  const { accountId } = useActiveAccount();
  return useQuery({ staleTime: 30_000, queryKey: ['buyLots', stockId ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId], queryFn: () => liveApiEnabled ? fetchLiveBuyLots(stockId, accountId) : fetchBuyLots(stockId), enabled: options.enabled !== false && (!liveApiEnabled || !!accountId) });
}
