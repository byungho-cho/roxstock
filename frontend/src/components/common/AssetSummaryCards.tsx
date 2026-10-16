import {cashAllocation} from '../../utils/cashAllocation';
import { Box, CardActionArea, Typography } from '@mui/material';
import { useListNavigation } from '../../hooks/navigation/usePageMemory';
import type { DashboardSummary } from '../../types/models';
import { formatPercent, formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { colors, pageMetrics } from '../../styles/tokens';
import { AppCard } from './Common';

const homeCardAction = { height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch', px: '13px', py: '8px' } as const;

export function TotalAssetCard({ summary, tabletHeight = 116, home = false, loading=false }: { summary: DashboardSummary; tabletHeight?: number; home?: boolean; loading?:boolean }) {
  const navigate = useListNavigation();
  if (home) return <AppCard sx={{ height: 76, borderRadius: '8px' }}><CardActionArea onClick={() => navigate('/detail/assets')} sx={homeCardAction}>
    <Box data-home-card-row sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', minHeight: 29 }}>
      <Typography sx={{ fontSize: 14, lineHeight: '18px', color: colors.textSecondary }}>평가자산</Typography>
      <Typography sx={{ fontSize: 24, lineHeight: '29px', fontWeight: 700, color: getMarketColor(summary.dailyProfit), textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{loading ? '' : formatWon(summary.totalAssets)}</Typography>
    </Box>
    <Box data-home-card-row sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', minHeight: 19 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}><Typography sx={{ fontSize: 14, lineHeight: '18px', color: colors.textSecondary }}>일별손익</Typography><Typography sx={{ fontSize: 14, lineHeight: '18px', color: getMarketColor(summary.dailyProfit) }}>{loading ? '' : Number.isFinite(summary.dailyProfitRate) ? formatPercent(summary.dailyProfitRate) : '—'}</Typography></Box>
      <Typography sx={{ fontSize: 16, lineHeight: '19px', fontWeight: 600, color: getMarketColor(summary.dailyProfit), textAlign: 'right', whiteSpace: 'nowrap' }}>{loading ? '' : formatWon(summary.dailyProfit)}</Typography>
    </Box>
  </CardActionArea></AppCard>;
  return <AppCard sx={{ height: home ? 76 : { xs: 102, sm: tabletHeight }, borderRadius: home ? '8px' : undefined, position: 'relative' }}><CardActionArea onClick={() => navigate('/detail/assets')} sx={{ height: '100%' }}>
    <Typography sx={{ position: 'absolute', top: home ? 13 : { xs: 17, sm: 24 }, left: home ? 13 : pageMetrics.cardInset, fontSize: home ? 14 : { xs: 12, sm: 14 }, lineHeight: '18px', color: colors.textSecondary }}>평가자산</Typography>
    <Box sx={{ position: 'absolute', top: home ? 9 : { xs: 9, sm: 15 }, right: home ? 13 : pageMetrics.cardInset, maxWidth: 'calc(100% - 26px)', textAlign: 'right', lineHeight: home ? '29px' : '36px' }}><Typography component="span" sx={{ color: getMarketColor(summary.dailyProfit), fontSize: home ? 24 : { xs: 24, sm: 30 }, lineHeight: home ? '29px' : undefined, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{loading ? '' : formatWon(summary.totalAssets)}</Typography></Box>
    <Typography sx={{ position: 'absolute', top: home ? 47 : { xs: 61, sm: 74 }, left: home ? 13 : pageMetrics.cardInset, fontSize: home ? 14 : { xs: 12, sm: 14 }, lineHeight: '18px', color: colors.textSecondary }}>일별손익</Typography>
    <Typography sx={{ position: 'absolute', top: home ? 47 : { xs: 61, sm: 74 }, left: home ? 77 : 77, fontSize: home ? 14 : { xs: 12, sm: 14 }, lineHeight: '18px', color: getMarketColor(summary.dailyProfit) }}>{loading ? '' : Number.isFinite(summary.dailyProfitRate) ? home ? formatPercent(summary.dailyProfitRate) : formatRate(summary.dailyProfitRate) : '—'}</Typography>
    <Typography sx={{ position: 'absolute', top: home ? 46 : { xs: 59, sm: 71 }, right: home ? 13 : pageMetrics.cardInset, textAlign: 'right', fontSize: home ? 16 : { xs: 15, sm: 18 }, lineHeight: '19px', fontWeight: 600, color: getMarketColor(summary.dailyProfit) }}>{loading ? '' : home ? formatWon(summary.dailyProfit) : formatSignedWon(summary.dailyProfit)}</Typography>
  </CardActionArea></AppCard>;
}

export function AssetQuickCards({ summary, tabletHeight = 88, home = false, gap, allocationAvailable=true, loading=false }: { summary: DashboardSummary; tabletHeight?: number; home?: boolean; gap?: string; allocationAvailable?:boolean; loading?:boolean }) {
  const navigate = useListNavigation();
  const {stockPercent:stockRate,cashPercent:cashRate,stockColor,cashColor}=cashAllocation(summary.stockValue,summary.cashBalance,summary.pricingComplete!==false&&allocationAvailable);
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: gap ?? { xs: home ? '10px' : '10px', sm: home ? '14px' : `${pageMetrics.gap}px` }, height: home ? 76 : { xs: 82, sm: tabletHeight } }}>
    <QuickCard monthlyLabel="이번달 손익" title="주식평가액" value={formatWon(summary.stockValue)} rate={formatPercent(stockRate)} monthly={formatSignedWon(summary.stockMonthlyProfit)} color={stockColor} monthlyColor={getMarketColor(summary.stockMonthlyProfit)} onClick={() => navigate(home ? '/assets' : '/detail/stock-value')} tabletHeight={tabletHeight} home={home} loading={loading} />
    <QuickCard monthlyLabel={home ? "이번달 증감" : undefined} title="예수금" value={formatWon(summary.cashBalance)} rate={formatPercent(cashRate)} monthly={formatSignedWon(summary.cashMonthlyProfit)} color={cashColor} monthlyColor={getMarketColor(summary.cashMonthlyProfit)} onClick={() => navigate('/detail/cash')} tabletHeight={tabletHeight} home={home} loading={loading} />
  </Box>;
}

function QuickCard({ monthlyLabel = "이번달", title, value, rate, monthly, color, monthlyColor, onClick, tabletHeight, home, loading }: { monthlyLabel?: string; title: string; value: string; rate: string; monthly: string; color: string; monthlyColor: string; onClick: () => void; tabletHeight: number; home: boolean; loading:boolean }) {
  if (home) return <AppCard sx={{ height: 76, borderRadius: '8px' }}><CardActionArea onClick={onClick} sx={homeCardAction}>
    <Box data-home-card-row sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', minHeight: 18 }}><Typography sx={{ fontSize: 14, lineHeight: '18px', color: colors.textSecondary }}>{title}</Typography><Typography sx={{ fontSize: 12, lineHeight: '18px', color, textAlign: 'right' }}>{loading ? '' : rate}</Typography></Box>
    <Typography data-home-card-row sx={{ minHeight: 18, fontSize: 14.5, lineHeight: '18px', fontWeight: 600, letterSpacing: '-0.03px', color, textAlign: 'right', whiteSpace: 'nowrap' }}>{loading ? '' : value}</Typography>
    <Box data-home-card-row sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', minHeight: 18, fontSize: 10, lineHeight: '18px', fontWeight: 600, letterSpacing: '-0.018px', color: monthlyColor }}><Box component="span" sx={{ textAlign: 'left', flexShrink: 0 }}>{monthlyLabel}</Box><Box component="span" sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{loading ? '' : monthly}</Box></Box>
  </CardActionArea></AppCard>;
  return <AppCard sx={{ height: home ? 68 : { xs: 82, sm: tabletHeight }, borderRadius: home ? '8px' : '14px', position: 'relative' }}><CardActionArea onClick={onClick} sx={{ height: '100%' }}><Typography sx={{ position: 'absolute', top: home ? 7 : { xs: 7, sm: 13 }, left: home ? 13 : pageMetrics.compactCardInset, fontSize: home ? 14 : { xs: 11, sm: 13 }, lineHeight: '18px', color: colors.textSecondary }}>{title}</Typography><Typography sx={{ position: 'absolute', top: home ? 8 : { xs: 7, sm: 13 }, right: home ? 13 : pageMetrics.compactCardInset, fontSize: home ? 12 : { xs: 10, sm: 12 }, lineHeight: '18px', color, textAlign: 'right' }}>{loading ? '' : rate}</Typography><Typography sx={{ position: 'absolute', top: home ? 28 : { xs: 27, sm: 35 }, right: home ? 13 : pageMetrics.compactCardInset, maxWidth: 'calc(100% - 26px)', fontSize: home ? 14.5 : { xs: 15, sm: 16 }, lineHeight: home ? '18px' : '22px', fontWeight: 600, letterSpacing: '-0.03px', color, textAlign: 'right', whiteSpace: 'nowrap' }}>{loading ? '' : value}</Typography><Typography sx={{ position: 'absolute', top: home ? 48 : { xs: 54, sm: 59 }, left: home ? 13 : undefined, display: home ? 'flex' : undefined, justifyContent: home ? 'space-between' : undefined, gap: home ? '4px' : undefined, right: home ? 13 : pageMetrics.compactCardInset, maxWidth: 'calc(100% - 26px)', fontSize: home ? 10 : { xs: 9, sm: 10 }, lineHeight: '18px', fontWeight: 600, letterSpacing: '-0.018px', color: monthlyColor, textAlign: 'right', whiteSpace: 'nowrap' }}>{home ? <><Box component="span" sx={{ textAlign: 'left', flexShrink: 0 }}>{monthlyLabel}</Box><Box component="span" sx={{ textAlign: 'right' }}>{loading ? '' : monthly}</Box></> : <>{monthlyLabel} {loading ? '' : monthly}</>}</Typography></CardActionArea></AppCard>;
}

