import { Box, CardActionArea, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { DashboardSummary } from '../../types/models';
import { formatPercent, formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { colors, pageMetrics } from '../../styles/tokens';
import { AppCard } from './Common';

export function TotalAssetCard({ summary, tabletHeight = 116, home = false }: { summary: DashboardSummary; tabletHeight?: number; home?: boolean }) {
  const navigate = useNavigate();
  return <AppCard sx={{ height: home ? 76 : { xs: 102, sm: tabletHeight }, borderRadius: home ? '8px' : undefined, position: 'relative' }}><CardActionArea onClick={() => navigate('/detail/assets')} sx={{ height: '100%' }}>
    <Typography sx={{ position: 'absolute', top: home ? 13 : { xs: 17, sm: 24 }, left: home ? 13 : pageMetrics.cardInset, fontSize: home ? 14 : { xs: 12, sm: 14 }, lineHeight: '18px', color: colors.textSecondary }}>평가자산</Typography>
    <Box sx={{ position: 'absolute', top: home ? 9 : { xs: 9, sm: 15 }, right: home ? 13 : pageMetrics.cardInset, maxWidth: 'calc(100% - 26px)', textAlign: 'right', lineHeight: home ? '29px' : '36px' }}><Typography component="span" sx={{ color: getMarketColor(summary.dailyProfit), fontSize: home ? 24 : { xs: 24, sm: 30 }, lineHeight: home ? '29px' : undefined, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatWon(summary.totalAssets)}</Typography></Box>
    <Typography sx={{ position: 'absolute', top: home ? 47 : { xs: 61, sm: 74 }, left: home ? 13 : pageMetrics.cardInset, fontSize: home ? 14 : { xs: 12, sm: 14 }, lineHeight: '18px', color: colors.textSecondary }}>일별손익</Typography>
    <Typography sx={{ position: 'absolute', top: home ? 47 : { xs: 61, sm: 74 }, left: home ? 77 : 77, fontSize: home ? 14 : { xs: 12, sm: 14 }, lineHeight: '18px', color: getMarketColor(summary.dailyProfit) }}>{Number.isFinite(summary.dailyProfitRate) ? formatRate(summary.dailyProfitRate) : '—'}</Typography>
    <Typography sx={{ position: 'absolute', top: home ? 46 : { xs: 59, sm: 71 }, right: home ? 13 : pageMetrics.cardInset, textAlign: 'right', fontSize: home ? 16 : { xs: 15, sm: 18 }, lineHeight: '19px', fontWeight: 600, color: getMarketColor(summary.dailyProfit) }}>{formatSignedWon(summary.dailyProfit)}</Typography>
  </CardActionArea></AppCard>;
}

export function AssetQuickCards({ summary, tabletHeight = 88, home = false }: { summary: DashboardSummary; tabletHeight?: number; home?: boolean }) {
  const navigate = useNavigate();
  const stockRate = Number.isFinite(summary.totalAssets) && summary.totalAssets > 0 ? summary.stockValue / summary.totalAssets * 100 : Number.NaN;
  const cashRate = Number.isFinite(summary.totalAssets) && summary.totalAssets > 0 ? summary.cashBalance / summary.totalAssets * 100 : Number.NaN;
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: { xs: '10px', sm: home ? '10px' : `${pageMetrics.gap}px` }, height: home ? 68 : { xs: 82, sm: tabletHeight } }}>
    <QuickCard title="주식평가액" value={formatWon(summary.stockValue)} rate={formatPercent(stockRate)} monthly={formatSignedWon(summary.stockMonthlyProfit)} color="#34D399" monthlyColor={getMarketColor(summary.stockMonthlyProfit)} onClick={() => navigate('/detail/stock-value')} tabletHeight={tabletHeight} home={home} />
    <QuickCard title="예수금" value={formatWon(summary.cashBalance)} rate={formatPercent(cashRate)} monthly={formatSignedWon(summary.cashMonthlyProfit)} color="#FBBF24" monthlyColor={getMarketColor(summary.cashMonthlyProfit)} onClick={() => navigate('/detail/cash')} tabletHeight={tabletHeight} home={home} />
  </Box>;
}

function QuickCard({ title, value, rate, monthly, color, monthlyColor, onClick, tabletHeight, home }: { title: string; value: string; rate: string; monthly: string; color: string; monthlyColor: string; onClick: () => void; tabletHeight: number; home: boolean }) {
  return <AppCard sx={{ height: home ? 68 : { xs: 82, sm: tabletHeight }, borderRadius: home ? '8px' : '14px', position: 'relative' }}><CardActionArea onClick={onClick} sx={{ height: '100%' }}><Typography sx={{ position: 'absolute', top: home ? 7 : { xs: 7, sm: 13 }, left: home ? 13 : pageMetrics.compactCardInset, fontSize: home ? 14 : { xs: 11, sm: 13 }, lineHeight: '18px', color: colors.textSecondary }}>{title}</Typography><Typography sx={{ position: 'absolute', top: home ? 8 : { xs: 7, sm: 13 }, right: home ? 13 : pageMetrics.compactCardInset, fontSize: home ? 12 : { xs: 10, sm: 12 }, lineHeight: '18px', color, textAlign: 'right' }}>{rate}</Typography><Typography sx={{ position: 'absolute', top: home ? 28 : { xs: 27, sm: 35 }, right: home ? 13 : pageMetrics.compactCardInset, maxWidth: 'calc(100% - 26px)', fontSize: home ? 14.5 : { xs: 15, sm: 16 }, lineHeight: home ? '18px' : '22px', fontWeight: 600, letterSpacing: '-0.03px', color, textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</Typography><Typography sx={{ position: 'absolute', top: home ? 48 : { xs: 54, sm: 59 }, right: home ? 13 : pageMetrics.compactCardInset, maxWidth: 'calc(100% - 26px)', fontSize: home ? 10 : { xs: 9, sm: 10 }, lineHeight: '18px', fontWeight: 600, letterSpacing: '-0.018px', color: monthlyColor, textAlign: 'right', whiteSpace: 'nowrap' }}>이번달 {monthly}</Typography></CardActionArea></AppCard>;
}

