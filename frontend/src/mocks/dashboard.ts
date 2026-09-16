import type { DashboardData } from '../types/dashboard';

export const dashboardMock: DashboardData = {
  asOf: '2026-09-16T10:30:00+09:00',
  summary: { totalAssets: 85_420_000, stockValue: 73_200_000, cashBalance: 12_220_000, dailyProfit: 420_000, dailyProfitRate: 0.58, totalProfit: 18_420_000, totalProfitRate: 27.49 },
  holdings: [
    { symbol: '005380', name: '현대차', quantity: 70, marketValue: 36_330_000, profitRate: 18.4 },
    { symbol: '000270', name: '기아', quantity: 78, marketValue: 10_140_000, profitRate: 9.7 },
    { symbol: '035420', name: 'NAVER', quantity: 42, marketValue: 9_345_000, profitRate: -2.1 },
  ],
};
