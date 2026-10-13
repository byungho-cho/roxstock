import { apiRequest, ApiError } from './apiClient';
import type { AccountDto, AccountDashboardDto, SecurityDto, HoldingDto, StockTradeSummaryDto, RecentBuysDto } from './roxstockApi';
import type { TargetReport } from './targetArrivalApi';
export interface PageBootstrap {
  legacy?: true;
  accounts: AccountDto[];
  accountId: string | null;
  dashboard?: AccountDashboardDto;
  stocks?: { catalog: SecurityDto[]; holdings: HoldingDto[]; trades: StockTradeSummaryDto[] };
  trend?: { data: { date: string; totalAssetValue: string }[] } | null;
  targets?: TargetReport | null;
  recent?: RecentBuysDto | null;
}
export async function getPageBootstrap(screen: 'home' | 'stocks', accountId: string | null, signal?: AbortSignal): Promise<PageBootstrap> {
  try {
    return await apiRequest<PageBootstrap>(`/pages/${screen}${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, { signal });
  } catch (error) {
    // Rolling deployment/rollback compatibility. Do not conceal server or network failures.
    if (error instanceof ApiError && error.status === 404) return { legacy: true, accounts: [], accountId: null };
    throw error;
  }
}
