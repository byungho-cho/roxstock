import { useQuery } from '@tanstack/react-query';
import { fetchBuyLots, fetchDashboard, fetchStocks } from '../data/mockApi';
import type { StockListType } from '../types/models';

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
}

export function useStocks(listType?: StockListType) {
  return useQuery({ queryKey: ['stocks', listType ?? 'all'], queryFn: () => fetchStocks(listType) });
}

export function useBuyLots(stockId?: string) {
  return useQuery({ queryKey: ['buyLots', stockId ?? 'all'], queryFn: () => fetchBuyLots(stockId) });
}
