import { useQuery } from '@tanstack/react-query';
import { fetchBuyLots, fetchDashboard, fetchStocks } from '../data/mockApi';
import { fetchLiveBuyLots, fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../data/liveData';
import type { StockListType } from '../types/models';
import { useActiveAccount } from './useActiveAccount';

const PRICE_REFRESH_INTERVAL_MS = 5 * 60_000;

export function useDashboard({ pollPrices = false }: { pollPrices?: boolean } = {}) {
  const { accountId } = useActiveAccount();
  return useQuery({
    queryKey: ['dashboard', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: () => liveApiEnabled ? fetchLiveDashboard(accountId) : fetchDashboard(),
    enabled: !liveApiEnabled || !!accountId,
    refetchInterval: liveApiEnabled && pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
}

export function useStocks(listType?: StockListType, options: { enabled?: boolean } = {}) {
  const { accountId } = useActiveAccount();
  return useQuery({
    queryKey: ['stocks', listType ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId],
    queryFn: () => liveApiEnabled ? fetchLiveStocks(listType, accountId) : fetchStocks(listType),
    enabled: options.enabled !== false && (!liveApiEnabled || !!accountId),
    refetchInterval: liveApiEnabled ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
}

export function useBuyLots(stockId?: string) {
  const { accountId } = useActiveAccount();
  return useQuery({ staleTime: 30_000, queryKey: ['buyLots', stockId ?? 'all', liveApiEnabled ? 'api' : 'mock', accountId], queryFn: () => liveApiEnabled ? fetchLiveBuyLots(stockId, accountId) : fetchBuyLots(stockId), enabled: !liveApiEnabled || !!accountId });
}
