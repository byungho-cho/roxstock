import { storedQueryOptions } from '../data/storedQueryOptions';
import { getDashboardTrend, getStockTradeSummary } from '../data/roxstockApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBuyLots, fetchDashboard, fetchStocks } from '../data/mockApi';
import { fetchLiveBuyLots, fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../data/liveData';
import type { StockListType } from '../types/models';
import { useActiveAccount } from './useActiveAccount';

const PRICE_REFRESH_INTERVAL_MS = 5 * 60_000;

export function useDashboard({ pollPrices = false }: { pollPrices?: boolean } = {}) {
  const { accountId } = useActiveAccount();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`);
  monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const from = monthAgo.toISOString().slice(0, 10);
  const history = useQuery({
    ...storedQueryOptions,
    queryKey: ['assetHistory', accountId, 'dashboard', from, today],
    queryFn: ({ signal }) => getDashboardTrend(accountId!, { from, to: today }, signal), enabled: liveApiEnabled && !!accountId,
    staleTime: 30_000, refetchInterval: pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
  });
  const summary = useQuery({
    ...storedQueryOptions, staleTime:30_000,
    queryKey: ['dashboard', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: ({signal}) => liveApiEnabled ? fetchLiveDashboard(accountId, false, signal) : fetchDashboard(),
    enabled: !liveApiEnabled || !!accountId,
    refetchInterval: liveApiEnabled && pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  return { ...summary, historyPending: history.isPending, historyError: history.isError, historySettled: !history.isPending, data: summary.data ? { ...summary.data, trend: liveApiEnabled ? (history.data?.data ?? []).map(point => ({label: point.date, value: point.totalAssetValue == null ? Number.NaN : Number(point.totalAssetValue)})) : summary.data.trend } : undefined };
}

export function useStocks(listType?: StockListType, options: { enabled?: boolean } = {}) {
  const { accountId } = useActiveAccount(), client = useQueryClient();
  return useQuery({
    queryKey: ['stocks', listType ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: () => liveApiEnabled ? fetchLiveStocks(listType, accountId, client.fetchQuery({ ...storedQueryOptions, queryKey: ['accountTradesSummary', accountId], queryFn: ({signal}) => getStockTradeSummary(accountId!, signal) })) : fetchStocks(listType),
    enabled: options.enabled !== false && (!liveApiEnabled || !!accountId),
    refetchInterval: liveApiEnabled ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });

}

export function useBuyLots(stockId?: string, options: { enabled?: boolean } = {}) {
  const { accountId } = useActiveAccount();
  return useQuery({ staleTime: 30_000, queryKey: ['buyLots', stockId ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId], queryFn: () => liveApiEnabled ? fetchLiveBuyLots(stockId, accountId) : fetchBuyLots(stockId), enabled: options.enabled !== false && (!liveApiEnabled || !!accountId) });
}
