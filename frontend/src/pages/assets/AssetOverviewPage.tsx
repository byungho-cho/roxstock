import { AddRounded } from '@mui/icons-material';
import { Box, Button, CircularProgress, IconButton, Snackbar, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { PageHeader } from '../../components/navigation/Navigation';
import { assetComposition } from '../../data/mockData';
import { liveApiEnabled } from '../../data/liveData';
import { useDashboard } from '../../hooks/useMockData';
import { colors } from '../../styles/tokens';
import type { DashboardSummary } from '../../types/models';
import { formatPercent, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { navigateToForm } from '../../utils/focusForm';

const palette = ['#FA6170', '#60A5FA', '#34D399', '#A78BFA', '#FBC02D', '#94A3B8'];
type ChartItem = { id: string; name: string; percent: number; color: string };

export function AssetOverviewPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard({ pollPrices: true });
  const [mode, setMode] = useState<'cumulative' | 'ranked'>('cumulative');
  const header = <PageHeader title="평가자산" variant="detail" backPath="/" embedded action={<Box sx={{ width: { xs: 44, sm: 32 }, flexShrink: 0 }}><IconButton aria-label="거래등록" onClick={() => navigateToForm(navigate, '/trade')} sx={{ display: { xs: 'none', sm: 'flex' }, width: 32, height: 32, bgcolor: '#202938', border: '1px solid #25344D', color: colors.textPrimary }}><AddRounded sx={{ fontSize: 20 }} /></IconButton></Box>} />;
  if (isPending) return <>{header}<Stack sx={{ alignItems: 'center', pt: 8 }}><CircularProgress aria-label="평가자산을 불러오는 중" /></Stack></>;
  if (!data) return <>{header}<AppCard sx={{ p: 2 }}><Typography>평가자산을 불러오지 못했어요.</Typography><Button onClick={() => refetch()}>다시 시도</Button></AppCard></>;
  const { summary, holdings } = data;
  const profit = summary.pricingComplete === false ? Number.NaN : summary.stockValue - summary.stockPurchaseAmount;
  const rate = summary.pricingComplete === false || !summary.stockPurchaseAmount ? Number.NaN : profit / summary.stockPurchaseAmount * 100;
  const composition = liveApiEnabled
    ? summary.pricingComplete === false ? [] : holdings.filter((stock) => Number.isFinite(stock.marketValue) && stock.marketValue! > 0).map((stock) => ({ id: stock.id, percent: summary.stockValue > 0 ? stock.marketValue! / summary.stockValue * 100 : 0 }))
    : assetComposition;
  const items: ChartItem[] = composition.sort((a, b) => b.percent - a.percent).map(({ id, percent }, index) => ({
    id, percent, color: palette[index % palette.length], name: id === 'other' ? '기타' : holdings.find((stock) => stock.id === id)?.name ?? '기타',
  }));
  return <>{header}<Snackbar open={isError} message="최신 데이터 조회에 실패했습니다. 이전 값을 표시합니다." />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: '8px', sm: '16px' }, height: { sm: '100%' }, minHeight: { sm: 327 }, alignItems: 'start' }}>
      <Stack spacing="8px" sx={{ minWidth: 0 }}><TotalAssetCard summary={summary} home /><AssetQuickCards summary={summary} home /><PerformanceCard summary={summary} profit={profit} rate={rate} /></Stack>
      <CompositionCard summary={summary} items={items} mode={mode} onToggle={() => setMode((previous) => previous === 'cumulative' ? 'ranked' : 'cumulative')} />
    </Box>
  </>;
}

function PerformanceCard({ summary, profit, rate }: { summary: DashboardSummary; profit: number; rate: number }) {
  const rows = [
    { label: '매입금액', value: formatWon(summary.stockPurchaseAmount), color: colors.textPrimary },
    { label: '평가손익', value: formatWon(profit), color: Number.isFinite(profit) ? getMarketColor(profit) : colors.textMuted },
    { label: '주식평가액', value: formatWon(summary.stockValue), color: Number.isFinite(profit) ? getMarketColor(profit) : colors.textMuted },
  ];
  return <AppCard sx={{ height: { xs: 174, sm: 167 }, borderRadius: '8px', borderColor: '#25344D', px: { xs: '14px', sm: '17px' }, pt: { xs: '12px', sm: '8px' }, pb: '10px', minWidth: 0 }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', height: { xs: 24, sm: 27 }, mb: { xs: '6px', sm: 0 } }}><Typography sx={{ fontSize: { xs: 16, sm: 15 }, fontWeight: 600 }}>평가손익</Typography><Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 700, color: Number.isFinite(rate) ? getMarketColor(rate) : colors.textMuted }}>{formatPercent(rate)}</Typography></Stack>
    {rows.map((row) => <Stack key={row.label} direction="row" sx={{ height: { xs: 26, sm: 32 }, borderTop: { xs: 'none', sm: '1px solid #25344D' }, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, color: { xs: colors.textSecondary, sm: colors.textMuted } }}>{row.label}</Typography><Typography noWrap sx={{ fontSize: { xs: 12, sm: 15 }, fontWeight: 600, color: row.color }}>{row.value}</Typography></Stack>)}
    <Stack direction="row" sx={{ height: { xs: 36, sm: 32 }, borderTop: { xs: 'none', sm: '1px solid #25344D' }, alignItems: 'flex-start', pt: { xs: '2px', sm: '8px' }, justifyContent: 'space-between' }}><Stack direction="row" spacing="8px"><Typography sx={{ fontSize: 12, color: colors.textMuted }}>전일 대비</Typography><Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 12, color: colors.textMuted }}>{formatPercent(summary.dailyProfitRate)}</Typography></Stack><Stack sx={{ alignItems: 'flex-end' }}><Typography sx={{ fontSize: { xs: 12, sm: 15 }, lineHeight: '18px', fontWeight: 600, color: Number.isFinite(summary.dailyProfit) ? getMarketColor(summary.dailyProfit) : colors.textMuted }}>{formatSignedWon(summary.dailyProfit)}</Typography><Typography sx={{ display: { xs: 'block', sm: 'none' }, fontSize: 10, color: colors.textMuted }}>{formatPercent(summary.dailyProfitRate)}</Typography></Stack></Stack>
  </AppCard>;
}

function CompositionCard({ summary, items, mode, onToggle }: { summary: DashboardSummary; items: ChartItem[]; mode: 'cumulative' | 'ranked'; onToggle: () => void }) {
  const available = Number.isFinite(summary.totalAssets) && summary.totalAssets > 0 && summary.pricingComplete !== false;
  const stockPercent = available ? summary.stockValue / summary.totalAssets * 100 : 0;
  const cashPercent = available ? summary.cashBalance / summary.totalAssets * 100 : 0;
  const gradient = items.reduce<{ stops: string[]; offset: number }>((acc, item) => ({ stops: [...acc.stops, `${item.color} ${acc.offset}% ${acc.offset + item.percent}%`], offset: acc.offset + item.percent }), { stops: [], offset: 0 }).stops.join(', ');
  return <AppCard sx={{ minWidth: 0, height: { xs: 'auto', sm: '100%' }, minHeight: { xs: 494, sm: 327 }, maxHeight: { sm: '100%' }, overflowY: { sm: 'auto' }, overflowX: 'hidden', scrollbarWidth: 'thin', borderRadius: '8px', borderColor: '#25344D', px: { xs: '13px', sm: '17px' }, pt: { xs: '15px', sm: '9px' }, pb: '8px' }}>
    <Typography sx={{ fontSize: 15, lineHeight: '18px', fontWeight: 600 }}>자산구성</Typography>
    {!available && <Typography role="status" sx={{ color: colors.textMuted, fontSize: 11, mt: 1 }}>{summary.pricingComplete === false ? '가격 미수집 종목이 있어 자산구성을 계산할 수 없습니다.' : '표시할 자산 데이터가 없습니다.'}</Typography>}
    {available && <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: { xs: '14px', sm: '10px' }, fontSize: 11, fontWeight: 600, color: colors.positive }}><span>{formatWon(summary.stockValue)}</span><Box component="span" sx={{ color: colors.warning }}>{formatWon(summary.cashBalance)}</Box></Stack>
      <Stack role="img" aria-label={`주식 ${formatPercent(stockPercent)}, 예수금 ${formatPercent(cashPercent)}`} direction="row" sx={{ height: 12, borderRadius: '6px', overflow: 'hidden', mt: '5px', bgcolor: colors.raised }}><Box sx={{ width: `${stockPercent}%`, bgcolor: colors.positive }} /><Box sx={{ width: `${cashPercent}%`, bgcolor: colors.warning }} /></Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: '5px', pb: { xs: '8px', sm: '5px' }, borderBottom: '1px solid #25344D', fontSize: 11, fontWeight: 600, color: colors.positive }}><span>{formatPercent(stockPercent)}</span><Box component="span" sx={{ color: colors.warning }}>{formatPercent(cashPercent)}</Box></Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '156px minmax(0, 1fr)', sm: '112px minmax(0, 1fr)' }, gap: { xs: '6px', sm: '24px' }, alignItems: 'center', mt: { xs: '16px', sm: '7px' }, minHeight: { xs: 180, sm: 112 } }}>
        <Box role="img" aria-label="종목별 자산 구성 도넛" sx={{ width: { xs: 156, sm: 112 }, height: { xs: 156, sm: 112 }, borderRadius: '50%', background: items.length ? `conic-gradient(${gradient})` : colors.raised, display: 'grid', placeItems: 'center' }}><Stack sx={{ width: '54%', height: '54%', bgcolor: colors.surface, borderRadius: '50%', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ fontSize: { xs: 10, sm: 7 }, color: colors.textMuted }}>주식평가액</Typography><Typography noWrap sx={{ fontSize: { xs: 14, sm: 10 }, fontWeight: 700 }}>{`${Math.round(summary.stockValue / 10_000).toLocaleString('ko-KR')}만원`}</Typography></Stack></Box>
        <Stack spacing={{ xs: '8px', sm: '1px' }}>{items.map((item) => <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) 58px', alignItems: 'center', gap: '8px', minHeight: 18 }}><Box sx={{ width: 8, height: 8, bgcolor: item.color, borderRadius: '50%' }} /><Typography noWrap sx={{ fontSize: 11 }}>{item.name}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', color: colors.textMuted }}>{formatPercent(item.percent)}</Typography></Box>)}</Stack>
      </Box>
      <Box sx={{ borderTop: '1px solid #25344D', mt: { xs: '2px', sm: '7px' }, pt: { xs: '10px', sm: '6px' } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>종목별 비중</Typography><Button onClick={onToggle} aria-label="종목별 비중 차트 방식 변경" sx={{ minWidth: 62, height: 22, borderRadius: '11px', bgcolor: colors.raised, color: colors.focus, fontSize: 10, p: 0 }}>{mode === 'cumulative' ? '누적형' : '순위형'}</Button></Stack>
        <Stack direction="row" role="img" aria-label="종목별 비중 누적 막대" sx={{ mt: { xs: '12px', sm: '2px' }, height: 12, borderRadius: '6px', bgcolor: colors.raised, overflow: 'hidden' }}>{items.map((item) => <Box key={item.id} sx={{ width: `${item.percent}%`, bgcolor: item.color }} />)}</Stack>
        <Stack spacing={{ xs: '8px', sm: 0 }} sx={{ mt: { xs: '12px', sm: 0 } }}>{items.map((item, index) => <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr) 62px', alignItems: 'center', gap: '8px', minHeight: { xs: 17, sm: 18 } }}><Typography noWrap sx={{ fontSize: 10.5 }}>{item.name}</Typography><Box sx={{ height: 7, bgcolor: '#202B3E', borderRadius: '4px', overflow: 'hidden' }}><Box sx={{ ml: mode === 'cumulative' ? `${items.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0)}%` : 0, width: `${item.percent}%`, height: '100%', bgcolor: item.color, borderRadius: '4px' }} /></Box><Typography sx={{ textAlign: 'right', color: item.color, fontSize: 10.5, fontWeight: 600 }}>{formatPercent(item.percent)}</Typography></Box>)}</Stack>
        {items.length === 0 && <Typography sx={{ mt: 2, fontSize: 11, color: colors.textMuted }}>보유종목이 없습니다.</Typography>}
      </Box>
    </>}
  </AppCard>;
}
