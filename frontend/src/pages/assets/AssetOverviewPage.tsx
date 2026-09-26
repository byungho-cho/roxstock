import { Box, CardActionArea, CircularProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { useDashboard } from '../../hooks/useMockData';
import { formatAmount, formatPercent, formatRate, formatSignedWon, formatWon } from '../../utils/format';
import { colors, pageMetrics } from '../../styles/tokens';

const marketColor = (value: number) => value > 0 ? colors.marketRise : value < 0 ? colors.marketFall : colors.marketFlat;
const chartColors = ['#FB637A', '#60A5FA', '#34D399', '#A78BFA', '#FBBF24', '#94A3B8'];

// The proportions are a single mock chart fixture; labels come from the shared stock list.

export function AssetOverviewPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard();
  const [barMode, setBarMode] = useState<'cumulative' | 'ranked'>('cumulative');

  if (isPending) return <Stack sx={{ alignItems: 'center', pt: 10 }}><CircularProgress aria-label="평가자산을 불러오는 중" /></Stack>;
  if (isError || !data) return <AppCard sx={{ p: 2, mt: 2 }}><Typography>평가자산을 불러오지 못했어요.</Typography><CardActionArea onClick={() => refetch()} sx={{ mt: 1, color: colors.focus }}>다시 시도</CardActionArea></AppCard>;

  const { summary, holdings } = data;
  const stockPercent = summary.totalAssets ? summary.stockValue / summary.totalAssets * 100 : 0;
  const cashPercent = summary.totalAssets ? summary.cashBalance / summary.totalAssets * 100 : 0;
  const valuationProfit = summary.stockValue - summary.stockPurchaseAmount;
  const valuationRate = summary.stockPurchaseAmount ? valuationProfit / summary.stockPurchaseAmount * 100 : 0;
  const ranked = [...holdings].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
  const chartItems = ranked.slice(0, 5).map((stock, index) => ({ id: stock.id, percent: summary.stockValue ? (stock.marketValue ?? 0) / summary.stockValue * 100 : 0, color: chartColors[index], name: stock.name }));
  const otherValue = ranked.slice(5).reduce((sum, stock) => sum + (stock.marketValue ?? 0), 0);
  if (otherValue) chartItems.push({ id: 'other', percent: summary.stockValue ? otherValue / summary.stockValue * 100 : 0, color: chartColors[5], name: '기타' });
  const donutGradient = chartItems.reduce(({ stops, offset }, item) => ({
    stops: [...stops, `${item.color} ${offset}% ${offset + item.percent}%`], offset: offset + item.percent,
  }), { stops: [] as string[], offset: 0 }).stops.join(', ');

  return <Box>
    <PageHeader title="평가자산" subtitle="보유 주식의 현재 평가금액과 자산 구성을 확인합니다" backPath="/" showAddMobile={false} embedded />

    <Stack spacing={`${pageMetrics.gap}px`} sx={{ mt: `${pageMetrics.gap}px` }}>
        <AppCard sx={{ minHeight: 174, p: `12px ${pageMetrics.cardInset}px`, borderRadius: '16px' }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", mb: { xs: '9px', sm: '14px' } }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>평가손익</Typography><Typography sx={{ color: marketColor(valuationProfit), fontSize: 16, fontWeight: 700 }}>{formatRate(valuationRate)}</Typography></Stack>
          <Stack spacing={{ xs: '6px', sm: '8px' }}>
            <MetricRow label="매입금액" value={formatWon(summary.stockPurchaseAmount)} />
            <MetricRow label="평가손익" value={formatSignedWon(valuationProfit)} color={marketColor(valuationProfit)} />
            <MetricRow label="주식평가액" value={formatWon(summary.stockValue)} color={marketColor(valuationProfit)} />
            <MetricRow label="전일 대비" value={formatSignedWon(summary.dailyProfit)} color={marketColor(summary.dailyProfit)} secondary={formatRate(summary.dailyProfit / (summary.stockValue - summary.dailyProfit) * 100)} />
          </Stack>
        </AppCard>
      <AppCard sx={{ width: '100%', minWidth: 0, p: `14px ${pageMetrics.cardInset}px`, minHeight: 494, borderRadius: '16px' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, mb: '12px' }}>자산구성</Typography>
        <Stack direction="row" sx={{ justifyContent: "space-between", px: '2px', mb: '3px' }}><Typography component="button" onClick={() => navigate('/detail/stock-value')} sx={{ border: 0, p: 0, bgcolor: 'transparent', cursor: 'pointer', color: colors.textPrimary, fontSize: 11, fontWeight: 600 }}>{formatWon(summary.stockValue)}</Typography><Typography component="button" onClick={() => navigate('/detail/cash')} sx={{ border: 0, p: 0, bgcolor: 'transparent', cursor: 'pointer', color: colors.textPrimary, fontSize: 11, fontWeight: 600 }}>{formatWon(summary.cashBalance)}</Typography></Stack>
        <Stack direction="row" role="img" aria-label={`주식 ${formatPercent(stockPercent)}, 예수금 ${formatPercent(cashPercent)}`} sx={{ height: 12, overflow: 'hidden', borderRadius: 6, bgcolor: colors.raised }}><Box sx={{ width: `${stockPercent}%`, bgcolor: colors.positive }} /><Box sx={{ width: `${cashPercent}%`, bgcolor: colors.warning }} /></Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", mt: '3px' }}><Typography sx={{ color: colors.positive, fontSize: 11, fontWeight: 600 }}>{formatPercent(stockPercent)}</Typography><Typography sx={{ color: colors.warning, fontSize: 11, fontWeight: 600 }}>{formatPercent(cashPercent)}</Typography></Stack>

        <Box sx={{ borderTop: `1px solid ${colors.borderStrong}`, mt: '13px', pt: '15px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: { xs: 148, sm: 132 }, height: { xs: 148, sm: 132 }, mx: 'auto', borderRadius: '50%', background: `conic-gradient(${donutGradient})`, display: 'grid', placeItems: 'center' }}>
            <Stack sx={{ width: '53%', height: '53%', bgcolor: colors.surface, borderRadius: '50%', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 9 }}>주식평가액</Typography><Typography sx={{ fontSize: 13, fontWeight: 700 }}>{formatAmount(summary.stockValue)}</Typography></Stack>
          </Box>
          <Stack spacing="8px">{chartItems.map((item) => <Stack key={item.id} direction="row" sx={{ alignItems: "center" }} spacing="6px"><Box sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: '50%', bgcolor: item.color }} /><Typography noWrap sx={{ flex: 1, fontSize: 11 }}>{item.name}</Typography><Typography sx={{ color: colors.textMuted, fontSize: 11 }}>{formatPercent(item.percent)}</Typography></Stack>)}</Stack>
        </Box>

        <Box sx={{ borderTop: `1px solid ${colors.borderStrong}`, mt: '16px', pt: '10px' }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: '11px' }}><Typography sx={{ fontSize: 15, fontWeight: 600 }}>종목별 비중</Typography><Box component="button" onClick={() => setBarMode((mode) => mode === 'cumulative' ? 'ranked' : 'cumulative')} aria-label="종목별 비중 차트 방식 변경" sx={{ border: 0, borderRadius: 3, bgcolor: colors.raised, color: colors.focus, px: 1.5, py: 0.5, fontSize: 10, cursor: 'pointer' }}>{barMode === 'cumulative' ? '누적형' : '순위형'}</Box></Stack>
          <Stack direction="row" role="img" aria-label="종목별 비중 누적 막대" sx={{ height: 12, borderRadius: 6, overflow: 'hidden', mb: '11px' }}>{chartItems.map((item) => <Box key={item.id} sx={{ width: `${item.percent}%`, bgcolor: item.color }} />)}</Stack>
          <Stack spacing="7px">{chartItems.slice(0, 5).map((item, index) => <Stack key={item.id} direction="row" sx={{ alignItems: "center" }} spacing="8px"><Typography noWrap sx={{ width: { xs: 98, sm: 100 }, fontSize: 10 }}>{item.name}</Typography><Box sx={{ flex: 1, height: 7, bgcolor: colors.raised, borderRadius: 4, overflow: 'hidden' }}><Box sx={{ ml: barMode === 'cumulative' ? `${chartItems.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0)}%` : 0, width: `${item.percent}%`, height: '100%', borderRadius: 4, bgcolor: item.color }} /></Box><Typography sx={{ width: 43, textAlign: 'right', color: item.color, fontSize: 10 }}>{formatPercent(item.percent)}</Typography></Stack>)}</Stack>
        </Box>
      </AppCard>
    </Stack>
  </Box>;
}

function MetricRow({ label, value, color = colors.textPrimary, secondary }: { label: string; value: string; color?: string; secondary?: string }) {
  return <Stack direction="row" sx={{ alignItems: "start", justifyContent: "space-between", minHeight: secondary ? 31 : 20, borderTop: { xs: 'none', sm: `1px solid ${colors.border}` }, pt: { xs: 0, sm: '4px' } }}><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>{label}</Typography><Stack sx={{ alignItems: "end" }}><Typography sx={{ color, fontSize: { xs: 12, sm: 14 }, fontWeight: 600 }}>{value}</Typography>{secondary && <Typography sx={{ color, fontSize: 10 }}>{secondary}</Typography>}</Stack></Stack>;
}
