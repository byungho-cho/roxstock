import { useQuery } from '@tanstack/react-query';
import { fetchBuyLots, fetchDashboard, fetchStocks } from '../data/mockApi';
import { fetchLiveBuyLots, fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../data/liveData';
import type { StockListType } from '../types/models';

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard', liveApiEnabled ? 'api' : 'mock'], queryFn: liveApiEnabled ? fetchLiveDashboard : fetchDashboard });
}

export function useStocks(listType?: StockListType) {
  return useQuery({ queryKey: ['stocks', listType ?? 'all', liveApiEnabled ? 'api' : 'mock'], queryFn: () => liveApiEnabled ? fetchLiveStocks(listType) : fetchStocks(listType) });
}

export function useBuyLots(stockId?: string) {
  return useQuery({ queryKey: ['buyLots', stockId ?? 'all', liveApiEnabled ? 'api' : 'mock'], queryFn: () => liveApiEnabled ? fetchLiveBuyLots(stockId) : fetchBuyLots(stockId) });
}
