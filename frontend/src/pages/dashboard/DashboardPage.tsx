import { AccountBalanceWalletRounded, ArrowForwardIosRounded, BarChartRounded, PaidRounded, QueryStatsRounded, TrendingUpRounded } from '@mui/icons-material';
import { Box, Card, CardActionArea, CardContent, Chip, CircularProgress, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/useMockData';
import type { CollectionStatus, StockItem } from '../../types/models';
import { formatAmount, formatRate, formatSignedAmount, getMarketColor } from '../../utils/format';

const collectionStatusLabel: Record<CollectionStatus, string> = {
  success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard();

  if (isPending) return <DashboardLoading />;
  if (isError || !data) {
    return <Card><CardContent><Typography sx={{ fontWeight: 750 }}>대시보드를 불러오지 못했어요.</Typography><Typography color="text.secondary" sx={{ mt: 0.5, cursor: 'pointer' }} onClick={() => refetch()}>눌러서 다시 시도해 주세요.</Typography></CardContent></Card>;
  }

  const { summary, holdings, trend } = data;
  return (
    <Stack spacing={{ xs: 1.5, sm: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ height: '100%', overflow: 'hidden', background: 'linear-gradient(145deg, rgba(96,165,250,0.16), rgba(17,24,39,0.98) 48%)', borderColor: 'rgba(96,165,250,0.30)' }}><CardActionArea onClick={() => navigate('/detail/assets')} sx={{ height: '100%' }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Box sx={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: '8px', bgcolor: 'rgba(96,165,250,0.15)', color: 'primary.main' }}><TrendingUpRounded fontSize="small" /></Box><Box><Typography sx={{ fontWeight: 750 }}>평가자산</Typography><Typography sx={{ fontSize: 11, color: '#94A3B8' }}>주식평가액 + 예수금</Typography></Box></Stack><ArrowForwardIosRounded sx={{ fontSize: 15, color: '#94A3B8' }} /></Stack>
            <Typography variant="h4" sx={{ mt: 2.25, textAlign: 'right', color: 'market.up' }}>{formatAmount(summary.totalAssets)}</Typography>
            <Typography sx={{ mt: 0.35, textAlign: 'right', fontSize: 12, color: 'market.up', fontWeight: 750 }}>{formatSignedAmount(summary.totalProfit)} · {formatRate(summary.totalProfitRate)}</Typography>
            <Stack spacing={0.75} sx={{ mt: 2 }}>
              <SummaryLine label="매입금액" value={formatAmount(summary.stockValue - summary.totalProfit)} />
              <SummaryLine label="평가손익" value={formatSignedAmount(summary.totalProfit)} color={getMarketColor(summary.totalProfit)} suffix={formatRate(summary.totalProfitRate)} />
              <SummaryLine label="주식평가액" value={formatAmount(summary.stockValue)} />
            </Stack>
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, textAlign: 'right', color: '#64748B' }}>시세 수집 {summary.collectedAt}</Typography>
          </CardContent></CardActionArea></Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Grid container spacing={2} sx={{ height: '100%' }}>
            <Grid size={{ xs: 6, sm: 12 }}><MetricCard icon={<PaidRounded />} title="일별 손익" value={formatSignedAmount(summary.dailyProfit)} rate={formatRate(summary.dailyProfitRate)} color={getMarketColor(summary.dailyProfit)} onClick={() => navigate('/detail/daily-profit')} /></Grid>
            <Grid size={{ xs: 6, sm: 12 }}><MetricCard icon={<AccountBalanceWalletRounded />} title="예수금" value={formatAmount(summary.cashBalance)} color="secondary.main" onClick={() => navigate('/detail/cash')} /></Grid>
          </Grid>
        </Grid>
      </Grid>

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', pt: 0.5 }}><Typography variant="subtitle1">투자 현황</Typography><Chip size="small" label="최근 6개월" /></Stack>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Card sx={{ height: '100%' }}><CardActionArea onClick={() => navigate('/assets')} sx={{ height: '100%' }}><CardContent sx={{ p: 2.25 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><QueryStatsRounded color="primary" /><Typography variant="subtitle1">자산 추이</Typography></Stack><ArrowForwardIosRounded sx={{ fontSize: 15, color: '#94A3B8' }} /></Stack>
            <TrendChart values={trend.map((item) => item.value)} />
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>{trend.map((item) => <Typography key={item.label} variant="caption" color="text.secondary">{item.label}</Typography>)}</Stack>
          </CardContent></CardActionArea></Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }}>
          <Card sx={{ height: '100%' }}><CardContent sx={{ p: 0 }}>
            <CardActionArea onClick={() => navigate('/stocks')} sx={{ px: 2.25, py: 2 }}><Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><BarChartRounded color="primary" /><Typography variant="subtitle1">보유종목</Typography></Stack><Chip size="small" label={`${holdings.length}개`} /></Stack></CardActionArea>
            <Box sx={{ px: 2.25, pb: 1.25 }}><Stack spacing={0.25}>{holdings.map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack></Box>
          </CardContent></Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

function SummaryLine({ label, value, suffix, color = 'text.primary' }: { label: string; value: string; suffix?: string; color?: string }) {
  return <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ color, fontWeight: 700 }}>{value}{suffix && <Box component="span" sx={{ ml: 0.75, fontSize: 11 }}>{suffix}</Box>}</Typography></Stack>;
}

function MetricCard({ icon, title, value, rate, color, onClick }: { icon: ReactNode; title: string; value: string; rate?: string; color: string; onClick: () => void }) {
  return <Card sx={{ height: '100%' }}><CardActionArea onClick={onClick} sx={{ height: '100%' }}><CardContent sx={{ p: 2 }}><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Box sx={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: '8px', bgcolor: 'rgba(148,163,184,0.08)', color, '& .MuiSvgIcon-root': { fontSize: 20 } }}>{icon}</Box><ArrowForwardIosRounded sx={{ fontSize: 14, color: '#64748B' }} /></Stack><Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: '#94A3B8' }}>{title}</Typography><Typography sx={{ mt: 0.2, textAlign: 'right', fontWeight: 800, fontSize: { xs: 15, sm: 17 }, color, whiteSpace: 'nowrap' }}>{value}</Typography>{rate && <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', color, fontWeight: 700 }}>{rate}</Typography>}</CardContent></CardActionArea></Card>;
}

function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  return <CardActionArea onClick={onClick} sx={{ borderRadius: '6px', px: 0.5, py: 1.1 }}><Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px 96px', gap: 1, alignItems: 'center' }}><Box sx={{ minWidth: 0 }}><Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><Typography noWrap sx={{ fontWeight: 750 }}>{stock.name}</Typography><Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ flex: '0 0 auto', width: 7, height: 7, borderRadius: '50%', bgcolor: `collection.${stock.collectionStatus}` }} /></Stack><Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{stock.symbol}</Typography></Box><Typography variant="body2" sx={{ textAlign: 'right', color: getMarketColor(stock.priceChangeRate) }}>{formatRate(stock.priceChangeRate)}</Typography><Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 700, color: getMarketColor(stock.priceChangeRate) }}>{formatAmount(stock.marketValue ?? 0)}</Typography></Box></CardActionArea>;
}

function TrendChart({ values }: { values: number[] }) {
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${58 - ((value - min) / range) * 48}`).join(' ');
  return <Box sx={{ mt: 2, mb: 0.75, height: 84, borderBottom: '1px solid', borderColor: 'divider' }}><svg viewBox="0 0 100 64" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="최근 6개월 자산 추이"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60A5FA" stopOpacity="0.34" /><stop offset="100%" stopColor="#60A5FA" stopOpacity="0" /></linearGradient></defs><polygon points={`0,64 ${points} 100,64`} fill="url(#trendFill)" /><polyline points={points} fill="none" stroke="#60A5FA" strokeWidth="2.25" vectorEffect="non-scaling-stroke" /></svg></Box>;
}

function DashboardLoading() {
  return <Stack spacing={2}><Grid container spacing={2}>{[1, 2, 3].map((item) => <Grid key={item} size={{ xs: 12, sm: item === 1 ? 6 : 3 }}><Skeleton variant="rounded" height={item === 1 ? 220 : 106} /></Grid>)}</Grid><Skeleton variant="rounded" height={220} /><Stack direction="row" spacing={1} sx={{ justifyContent: 'center', color: 'text.secondary' }}><CircularProgress size={16} /><Typography variant="body2">목 데이터를 불러오는 중이에요.</Typography></Stack></Stack>;
}
