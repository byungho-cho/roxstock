import { useQuery } from '@tanstack/react-query';
import { fetchBuyLots, fetchDashboard, fetchStocks } from '../data/mockApi';
import { fetchLiveBuyLots, fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../data/liveData';
import type { StockListType } from '../types/models';

const PRICE_REFRESH_INTERVAL_MS = 5 * 60_000;

export function useDashboard({ pollPrices = false }: { pollPrices?: boolean } = {}) {
  return useQuery({
    queryKey: ['dashboard', liveApiEnabled ? 'api' : 'mock'],
    queryFn: liveApiEnabled ? fetchLiveDashboard : fetchDashboard,
    refetchInterval: liveApiEnabled && pollPrices ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
}

export function useStocks(listType?: StockListType) {
  return useQuery({
    queryKey: ['stocks', listType ?? 'all', liveApiEnabled ? 'api' : 'mock'],
    queryFn: () => liveApiEnabled ? fetchLiveStocks(listType) : fetchStocks(listType),
    refetchInterval: liveApiEnabled ? PRICE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
}

export function useBuyLots(stockId?: string) {
  return useQuery({ queryKey: ['buyLots', stockId ?? 'all', liveApiEnabled ? 'api' : 'mock'], queryFn: () => liveApiEnabled ? fetchLiveBuyLots(stockId) : fetchBuyLots(stockId) });
}
