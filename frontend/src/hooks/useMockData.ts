import { storedQueryOptions } from '../data/storedQueryOptions';
import { getAssetHistory, getTrades } from '../data/roxstockApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBuyLots, fetchDashboard, fetchStocks } from '../data/mockApi';
import { fetchLiveBuyLots, fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../data/liveData';
import type { StockListType } from '../types/models';
import { useActiveAccount } from './useActiveAccount';

const PRICE_REFRESH_INTERVAL_MS = 5 * 60_000;

export function useDashboard({ pollPrices = false }: { pollPrices?: boolean } = {}) {
  const { accountId } = useActiveAccount();
  const history = useQuery({
    queryKey: ['assetHistory', accountId, 'dashboard'],
    queryFn: () => getAssetHistory(accountId!), enabled: liveApiEnabled && !!accountId,
    staleTime: 30_000, refetchInterval: pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
  });
  const summary = useQuery({
    queryKey: ['dashboard', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: () => liveApiEnabled ? fetchLiveDashboard(accountId, false) : fetchDashboard(),
    enabled: !liveApiEnabled || !!accountId,
    refetchInterval: liveApiEnabled && pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  return { ...summary, historyPending: history.isPending, historyError: history.isError, data: summary.data ? { ...summary.data, trend: liveApiEnabled ? (history.data?.data ?? []).map(point => ({label: point.date, value: Number(point.totalAssetValue)})) : summary.data.trend } : undefined };
}

export function useStocks(listType?: StockListType, options: { enabled?: boolean } = {}) {
  const { accountId } = useActiveAccount(), client = useQueryClient();
  return useQuery({
    queryKey: ['stocks', listType ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: () => liveApiEnabled ? fetchLiveStocks(listType, accountId, client.fetchQuery({ ...storedQueryOptions, queryKey: ['accountTrades', accountId], queryFn: ({signal}) => getTrades(accountId!, {}, signal) })) : fetchStocks(listType),
    enabled: options.enabled !== false && (!liveApiEnabled || !!accountId),
    refetchInterval: liveApiEnabled ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });

}

export function useBuyLots(stockId?: string) {
  const { accountId } = useActiveAccount();
  return useQuery({ staleTime: 30_000, queryKey: ['buyLots', stockId ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId], queryFn: () => liveApiEnabled ? fetchLiveBuyLots(stockId, accountId) : fetchBuyLots(stockId), enabled: !liveApiEnabled || !!accountId });
}
