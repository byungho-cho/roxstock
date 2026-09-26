import { Box, CardActionArea, CircularProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { useDashboard } from '../../hooks/useMockData';
import { assetComposition } from '../../data/mockData';
import { formatAmount } from '../../utils/format';
import { colors } from '../../styles/tokens';
import type { DashboardSummary } from '../../types/models';

const won = (value: number) => `${Math.abs(value).toLocaleString('ko-KR')}원`;
const signedWon = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${won(value)}`;
const ratio = (value: number) => `${value.toFixed(1)}%`;
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
  const chartItems = assetComposition.map(({ id, percent }, index) => ({
    id, percent, color: chartColors[index],
    name: id === 'other' ? '기타' : holdings.find((stock) => stock.id === id)?.name ?? '기타',
  }));
  const donutGradient = chartItems.reduce(({ stops, offset }, item) => ({
    stops: [...stops, `${item.color} ${offset}% ${offset + item.percent}%`], offset: offset + item.percent,
  }), { stops: [] as string[], offset: 0 }).stops.join(', ');

  return <Box sx={{ pb: '72px' }}>
    <PageHeader title="평가자산" subtitle="보유 주식의 현재 평가금액과 자산 구성을 확인합니다" backPath="/" showAddMobile={false} embedded embeddedGutter={16} />

    <Box sx={{ display: { xs: 'flex', sm: 'grid' }, flexDirection: 'column', gridTemplateColumns: { sm: '380px minmax(0, 380px)' }, gap: { xs: '12px', sm: '16px' }, alignItems: { xs: 'stretch', sm: 'start' } }}>
      <Stack spacing="12px" sx={{ width: '100%', minWidth: 0 }}>
        <AppCard sx={{ height: { xs: 102, sm: 112 }, borderRadius: '16px' }}><CardActionArea onClick={() => navigate('/stocks?tab=holding')} sx={{ height: '100%', px: '16px', py: '11px', position: 'relative' }}>
          <Typography sx={{ position: 'absolute', top: 18, left: 16, color: colors.textSecondary, fontSize: 12 }}>평가자산</Typography>
          <Typography sx={{ position: 'absolute', top: 10, right: 16, color: marketColor(summary.dailyProfit), fontSize: { xs: 24, sm: 25 }, fontWeight: 700, lineHeight: '36px' }}>{won(summary.totalAssets)}</Typography>
          <Typography sx={{ position: 'absolute', top: 62, left: 16, color: colors.textSecondary, fontSize: 12 }}>일별손익</Typography>
          <Typography sx={{ position: 'absolute', top: 62, left: 77, color: marketColor(summary.dailyProfit), fontSize: 12 }}>{ratio(summary.dailyProfitRate)}</Typography>
          <Typography sx={{ position: 'absolute', top: 60, right: 16, color: marketColor(summary.dailyProfit), fontSize: 15, fontWeight: 600 }}>{won(summary.dailyProfit)}</Typography>
          <Typography sx={{ display: { xs: 'none', sm: 'block' }, position: 'absolute', right: 16, bottom: 5, color: '#475569', fontSize: 10 }}>수집 {summary.collectedAt}</Typography>
        </CardActionArea></AppCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <QuickAssetCard label="주식평가액" amount={summary.stockValue} percent={stockPercent} monthly={summary.stockMonthlyProfit} color={colors.positive} onClick={() => navigate('/detail/stock-value')} />
          <QuickAssetCard label="예수금" amount={summary.cashBalance} percent={cashPercent} monthly={summary.cashMonthlyProfit} color={colors.warning} onClick={() => navigate('/detail/cash')} />
        </Box>

        <AppCard sx={{ height: { xs: 174, sm: 232 }, p: { xs: '12px 14px', sm: '12px 16px' }, borderRadius: '16px' }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", mb: { xs: '9px', sm: '14px' } }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>평가손익</Typography><Typography sx={{ color: marketColor(valuationProfit), fontSize: 16, fontWeight: 700 }}>{ratio(valuationRate)}</Typography></Stack>
          <Stack spacing={{ xs: '6px', sm: '8px' }}>
            <MetricRow label="매입금액" value={won(summary.stockPurchaseAmount)} />
            <MetricRow label="평가손익" value={won(valuationProfit)} color={marketColor(valuationProfit)} />
            <MetricRow label="주식평가액" value={won(summary.stockValue)} color={marketColor(valuationProfit)} />
            <MetricRow label="전일 대비" value={won(summary.dailyProfit)} color={marketColor(summary.dailyProfit)} secondary={ratio(summary.dailyProfit / (summary.stockValue - summary.dailyProfit) * 100)} />
          </Stack>
        </AppCard>
      </Stack>

      <AppCard sx={{ width: '100%', minWidth: 0, p: { xs: '14px 16px', sm: '14px 16px' }, minHeight: { xs: 494, sm: 452 }, borderRadius: '16px' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, mb: '12px' }}>자산구성</Typography>
        <Stack direction="row" sx={{ justifyContent: "space-between", px: '2px', mb: '3px' }}><Typography sx={{ color: colors.positive, fontSize: 11, fontWeight: 600 }}>{won(summary.stockValue)}</Typography><Typography sx={{ color: colors.warning, fontSize: 11, fontWeight: 600 }}>{won(summary.cashBalance)}</Typography></Stack>
        <Stack direction="row" role="img" aria-label={`주식 ${ratio(stockPercent)}, 예수금 ${ratio(cashPercent)}`} sx={{ height: 12, overflow: 'hidden', borderRadius: 6, bgcolor: colors.raised }}><Box sx={{ width: `${stockPercent}%`, bgcolor: colors.positive }} /><Box sx={{ width: `${cashPercent}%`, bgcolor: colors.warning }} /></Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", mt: '3px' }}><Typography sx={{ color: colors.positive, fontSize: 11, fontWeight: 600 }}>{ratio(stockPercent)}</Typography><Typography sx={{ color: colors.warning, fontSize: 11, fontWeight: 600 }}>{ratio(cashPercent)}</Typography></Stack>

        <Box sx={{ borderTop: `1px solid ${colors.borderStrong}`, mt: '13px', pt: '15px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: { xs: 148, sm: 132 }, height: { xs: 148, sm: 132 }, mx: 'auto', borderRadius: '50%', background: `conic-gradient(${donutGradient})`, display: 'grid', placeItems: 'center' }}>
            <Stack sx={{ width: '53%', height: '53%', bgcolor: colors.surface, borderRadius: '50%', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 9 }}>주식평가액</Typography><Typography sx={{ fontSize: 13, fontWeight: 700 }}>{formatAmount(summary.stockValue)}</Typography></Stack>
          </Box>
          <Stack spacing="8px">{chartItems.map((item) => <Stack key={item.id} direction="row" sx={{ alignItems: "center" }} spacing="6px"><Box sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: '50%', bgcolor: item.color }} /><Typography noWrap sx={{ flex: 1, fontSize: 11 }}>{item.name}</Typography><Typography sx={{ color: colors.textMuted, fontSize: 11 }}>{ratio(item.percent)}</Typography></Stack>)}</Stack>
        </Box>

        <Box sx={{ borderTop: `1px solid ${colors.borderStrong}`, mt: '16px', pt: '10px' }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: '11px' }}><Typography sx={{ fontSize: 15, fontWeight: 600 }}>종목별 비중</Typography><Box component="button" onClick={() => setBarMode((mode) => mode === 'cumulative' ? 'ranked' : 'cumulative')} aria-label="종목별 비중 차트 방식 변경" sx={{ border: 0, borderRadius: 3, bgcolor: colors.raised, color: colors.focus, px: 1.5, py: 0.5, fontSize: 10, cursor: 'pointer' }}>{barMode === 'cumulative' ? '누적형' : '순위형'}</Box></Stack>
          <Stack direction="row" role="img" aria-label="종목별 비중 누적 막대" sx={{ height: 12, borderRadius: 6, overflow: 'hidden', mb: '11px' }}>{chartItems.map((item) => <Box key={item.id} sx={{ width: `${item.percent}%`, bgcolor: item.color }} />)}</Stack>
          <Stack spacing="7px">{chartItems.slice(0, 5).map((item, index) => <Stack key={item.id} direction="row" sx={{ alignItems: "center" }} spacing="8px"><Typography noWrap sx={{ width: { xs: 98, sm: 100 }, fontSize: 10 }}>{item.name}</Typography><Box sx={{ flex: 1, height: 7, bgcolor: colors.raised, borderRadius: 4, overflow: 'hidden' }}><Box sx={{ ml: barMode === 'cumulative' ? `${chartItems.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0)}%` : 0, width: `${item.percent}%`, height: '100%', borderRadius: 4, bgcolor: item.color }} /></Box><Typography sx={{ width: 43, textAlign: 'right', color: item.color, fontSize: 10 }}>{ratio(item.percent)}</Typography></Stack>)}</Stack>
        </Box>
      </AppCard>
    </Box>
  </Box>;
}

function QuickAssetCard({ label, amount, percent, monthly, color, onClick }: { label: string; amount: number; percent: number; monthly: number; color: string; onClick: () => void }) {
  return <AppCard sx={{ height: 82, borderRadius: '14px' }}><CardActionArea onClick={onClick} sx={{ height: '100%', position: 'relative' }}><Typography sx={{ position: 'absolute', top: 8, left: 12, color: colors.textSecondary, fontSize: 11 }}>{label}</Typography><Typography sx={{ position: 'absolute', top: 8, right: 12, color, fontSize: 10 }}>{ratio(percent)}</Typography><Typography sx={{ position: 'absolute', top: 27, right: 12, color, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{won(amount)}</Typography><Typography sx={{ position: 'absolute', bottom: 8, right: 12, color: marketColor(monthly), fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap' }}>이번달 {signedWon(monthly)}</Typography></CardActionArea></AppCard>;
}

function MetricRow({ label, value, color = colors.textPrimary, secondary }: { label: string; value: string; color?: string; secondary?: string }) {
  return <Stack direction="row" sx={{ alignItems: "start", justifyContent: "space-between", minHeight: secondary ? 31 : 20, borderTop: { xs: 'none', sm: `1px solid ${colors.border}` }, pt: { xs: 0, sm: '4px' } }}><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>{label}</Typography><Stack sx={{ alignItems: "end" }}><Typography sx={{ color, fontSize: { xs: 12, sm: 14 }, fontWeight: 600 }}>{value}</Typography>{secondary && <Typography sx={{ color, fontSize: 10 }}>{secondary}</Typography>}</Stack></Stack>;
}
