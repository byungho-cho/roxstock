import { apiRequest } from './apiClient';
import type { AccountDto, AccountDashboardDto, SecurityDto, HoldingDto, StockTradeSummaryDto, RecentBuysDto } from './roxstockApi';
import type { TargetReport } from './targetArrivalApi';
export interface PageBootstrap {
  accounts: AccountDto[];
  accountId: string | null;
  dashboard?: AccountDashboardDto;
  stocks?: { catalog: SecurityDto[]; holdings: HoldingDto[]; trades: StockTradeSummaryDto[] };
  trend?: { data: { date: string; totalAssetValue: string }[] } | null;
  targets?: TargetReport | null;
  recent?: RecentBuysDto | null;
}
export const getPageBootstrap = (screen: 'home' | 'stocks', accountId: string | null, signal?: AbortSignal) =>
  apiRequest<PageBootstrap>(`/pages/${screen}${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, { signal });
