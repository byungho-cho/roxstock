export interface DashboardSummary { totalAssets: number; stockValue: number; cashBalance: number; dailyProfit: number; dailyProfitRate: number; totalProfit: number; totalProfitRate: number; }
export interface HoldingSummary { symbol: string; name: string; quantity: number; marketValue: number; profitRate: number; }
export interface DashboardData { asOf: string; summary: DashboardSummary; holdings: HoldingSummary[]; }
