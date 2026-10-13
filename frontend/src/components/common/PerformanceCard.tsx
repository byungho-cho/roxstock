import {DelayedSkeleton as Skeleton} from './DelayedSkeleton';
import {Stack,Typography} from '@mui/material';
import {AppCard} from './Common';
import {colors} from '../../styles/tokens';
import type {DashboardSummary} from '../../types/models';
import {formatPercent,formatSignedWon,formatWon,getMarketColor} from '../../utils/format';
export function PerformanceCard({ summary, profit, rate,loading=false }: { loading?:boolean; summary: DashboardSummary; profit: number; rate: number }) {
  const rows = [
    { label: '매입금액', value: formatWon(summary.stockPurchaseAmount), color: colors.textPrimary },
    { label: '평가손익', value: formatWon(profit), color: getMarketColor(profit) },
    { label: '주식평가액', value: formatWon(summary.stockValue), color: getMarketColor(profit) },
  ];
  return <AppCard data-testid="asset-performance-card" sx={{ height: 174, borderRadius: '8px', borderColor: '#25344D', px: '14px', pt: '12px', minWidth: 0 }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', height: 24, mb: '6px' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>평가손익</Typography><Typography sx={{ fontSize: 16, fontWeight: 700, color: getMarketColor(rate) }}>{loading?<Skeleton width={45} height={16} sx={{transform:'none'}}/>:formatPercent(rate)}</Typography></Stack>
    {rows.map(row => <Stack key={row.label} direction="row" sx={{ height: 26, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, color: colors.textSecondary }}>{row.label}</Typography><Typography sx={{ fontSize: 12, fontWeight: 600, color: row.color, whiteSpace: 'nowrap' }}>{loading?<Skeleton width={90} height={12} sx={{transform:'none'}}/>:row.value}</Typography></Stack>)}
    <Stack data-testid="asset-previous-day" direction="row" sx={{ height: 36, alignItems: 'flex-start', pt: '2px', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, color: colors.textMuted }}>전일 대비</Typography><Stack sx={{ alignItems: 'flex-end', minWidth: 0, whiteSpace: 'nowrap', textAlign: 'right' }}><Typography sx={{ fontSize: 12, lineHeight: '18px', fontWeight: 600, color: getMarketColor(summary.previousDayChange ?? Number.NaN) }}>{loading?<Skeleton width={90} height={12} sx={{transform:'none'}}/>:formatSignedWon(summary.previousDayChange ?? Number.NaN)}</Typography><Typography sx={{ fontSize: 10, lineHeight: '14px', color: getMarketColor(summary.previousDayChangeRate ?? Number.NaN) }}>{loading?<Skeleton width={40} height={10} sx={{transform:'none'}}/>:formatPercent(summary.previousDayChangeRate ?? Number.NaN)}</Typography></Stack></Stack>
  </AppCard>;
}
