import { Box, CardActionArea, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { DashboardSummary } from '../../types/models';
import { formatPercent, formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { colors, pageMetrics } from '../../styles/tokens';
import { AppCard } from './Common';

export function TotalAssetCard({ summary }: { summary: DashboardSummary }) {
  const navigate = useNavigate();
  return <AppCard sx={{ height: { xs: 102, sm: 116 }, position: 'relative' }}><CardActionArea onClick={() => navigate('/detail/assets')} sx={{ height: '100%' }}>
    <Typography sx={{ position: 'absolute', top: { xs: 17, sm: 24 }, left: pageMetrics.cardInset, fontSize: { xs: 12, sm: 14 }, lineHeight: '18px', color: colors.textSecondary }}>평가자산</Typography>
    <Box sx={{ position: 'absolute', top: { xs: 9, sm: 15 }, right: pageMetrics.cardInset, maxWidth: 'calc(100% - 32px)', textAlign: 'right', lineHeight: '36px' }}><Typography component="span" sx={{ color: getMarketColor(summary.dailyProfit), fontSize: { xs: 24, sm: 30 }, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatWon(summary.totalAssets)}</Typography></Box>
    <Typography sx={{ position: 'absolute', top: { xs: 61, sm: 74 }, left: pageMetrics.cardInset, fontSize: { xs: 12, sm: 14 }, lineHeight: '18px', color: colors.textSecondary }}>일별손익</Typography>
    <Typography sx={{ position: 'absolute', top: { xs: 61, sm: 74 }, left: 77, fontSize: { xs: 12, sm: 14 }, lineHeight: '18px', color: getMarketColor(summary.dailyProfit) }}>{formatRate(summary.dailyProfitRate)}</Typography>
    <Typography sx={{ position: 'absolute', top: { xs: 59, sm: 71 }, right: pageMetrics.cardInset, textAlign: 'right', fontSize: { xs: 15, sm: 18 }, lineHeight: '22px', fontWeight: 600, color: getMarketColor(summary.dailyProfit) }}>{formatSignedWon(summary.dailyProfit)}</Typography>
  </CardActionArea></AppCard>;
}

export function AssetQuickCards({ summary }: { summary: DashboardSummary }) {
  const navigate = useNavigate();
  const stockRate = summary.totalAssets ? summary.stockValue / summary.totalAssets * 100 : 0;
  const cashRate = summary.totalAssets ? summary.cashBalance / summary.totalAssets * 100 : 0;
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: { xs: '10px', sm: `${pageMetrics.gap}px` }, height: { xs: 82, sm: 88 } }}>
    <QuickCard title="주식평가액" value={formatWon(summary.stockValue)} rate={formatPercent(stockRate)} monthly={formatSignedWon(summary.stockMonthlyProfit)} color="#34D399" monthlyColor={getMarketColor(summary.stockMonthlyProfit)} onClick={() => navigate('/detail/stock-value')} />
    <QuickCard title="예수금" value={formatWon(summary.cashBalance)} rate={formatPercent(cashRate)} monthly={formatSignedWon(summary.cashMonthlyProfit)} color="#FBBF24" monthlyColor={getMarketColor(summary.cashMonthlyProfit)} onClick={() => navigate('/detail/cash')} />
  </Box>;
}

function QuickCard({ title, value, rate, monthly, color, monthlyColor, onClick }: { title: string; value: string; rate: string; monthly: string; color: string; monthlyColor: string; onClick: () => void }) {
  return <AppCard sx={{ height: { xs: 82, sm: 88 }, borderRadius: '14px', position: 'relative' }}><CardActionArea onClick={onClick} sx={{ height: '100%' }}><Typography sx={{ position: 'absolute', top: { xs: 7, sm: 13 }, left: pageMetrics.compactCardInset, fontSize: { xs: 11, sm: 13 }, lineHeight: '18px', color: colors.textSecondary }}>{title}</Typography><Typography sx={{ position: 'absolute', top: { xs: 7, sm: 13 }, right: pageMetrics.compactCardInset, fontSize: { xs: 10, sm: 12 }, lineHeight: '18px', color, textAlign: 'right' }}>{rate}</Typography><Typography sx={{ position: 'absolute', top: { xs: 27, sm: 35 }, right: pageMetrics.compactCardInset, maxWidth: 'calc(100% - 24px)', fontSize: { xs: 15, sm: 16 }, lineHeight: '22px', fontWeight: 600, letterSpacing: '-0.03px', color, textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</Typography><Typography sx={{ position: 'absolute', top: { xs: 54, sm: 59 }, right: pageMetrics.compactCardInset, maxWidth: 'calc(100% - 24px)', fontSize: { xs: 9, sm: 10 }, lineHeight: '18px', fontWeight: 600, letterSpacing: '-0.018px', color: monthlyColor, textAlign: 'right', whiteSpace: 'nowrap' }}>이번달 {monthly}</Typography></CardActionArea></AppCard>;
}
