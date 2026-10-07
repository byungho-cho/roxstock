import { storedQueryOptions } from '../data/storedQueryOptions';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useActiveAccount } from './useActiveAccount';
import { fetchLiveBuyLots, liveApiEnabled } from '../data/liveData';
import { fetchBuyLots } from '../data/mockApi';
import { getBuyLots, getTrades } from '../data/roxstockApi';
import type { StockItem } from '../types/models';

export type StockNavigation = { accountId?: string; ids: string[]; tab: string };
export function useStockNeighbors(stockId: string, stocks: StockItem[], suppliedIds?: string[]) {
  const { accountId } = useActiveAccount(), location = useLocation(), client = useQueryClient();
  const source = location.state?.stockNavigation as StockNavigation | undefined;
  const sourceIds = suppliedIds ?? (source?.accountId === accountId ? source?.ids : undefined);
  const current = stocks.find(stock => stock.id === stockId);
  const items = sourceIds ? sourceIds.flatMap(id => { const stock = stocks.find(item => item.id === id); return stock ? [stock] : []; }) : stocks.filter(stock => stock.listType === current?.listType);
  const index = items.findIndex(stock => stock.id === stockId);
  const previous = index > 0 ? items[index - 1] : undefined;
  const next = index >= 0 ? items[index + 1] : undefined;
  useEffect(() => {
    for (const stock of [previous, next]) {
      if (!stock || liveApiEnabled && !accountId) continue;
      void client.prefetchQuery({ queryKey: ['buyLots', stock.id, liveApiEnabled ? 'api' : 'mock', accountId], staleTime: 30_000,
        queryFn: () => liveApiEnabled ? fetchLiveBuyLots(stock.id, accountId) : fetchBuyLots(stock.id) });
      if (liveApiEnabled && accountId) {
        void client.prefetchQuery({ queryKey: ['stockTrades', accountId, stock.id], ...storedQueryOptions, queryFn: ({signal}) => getTrades(accountId, { securityId: stock.id }, signal) });
        void client.prefetchQuery({ queryKey: ['allBuyLots', accountId, stock.id], ...storedQueryOptions, queryFn: () => getBuyLots(accountId, stock.id, false) });
      }
    }
  }, [accountId, client, previous?.id, next?.id]);
  return { previous, next };
}
