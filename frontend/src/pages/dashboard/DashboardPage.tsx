import { Box, Button, CardActionArea, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/useMockData';
import type { CollectionStatus, StockItem } from '../../types/models';
import { formatRate, formatWon, getMarketColor } from '../../utils/format';
import { AppCard, SectionHeader } from '../../components/common/Common';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { colors, pageMetrics } from '../../styles/tokens';

const collectionStatusLabel: Record<CollectionStatus, string> = { success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패' };

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard();
  if (isPending) return <DashboardLoading />;
  if (isError || !data) return <AppCard><Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 700 }}>대시보드를 불러오지 못했어요.</Typography><Typography color="text.secondary" sx={{ mt: 0.5, cursor: 'pointer' }} onClick={() => refetch()}>눌러서 다시 시도해 주세요.</Typography></Box></AppCard>;

  const { summary, holdings, trend } = data;
  const featuredHoldings = holdings.slice(0, 3);
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: `${pageMetrics.gap}px`, sm: '16px' }, alignItems: 'start' }}>
    <Stack spacing={`${pageMetrics.gap}px`} sx={{ minWidth: 0 }}>
    <TotalAssetCard summary={summary} />
    <AssetQuickCards summary={summary} />
    <AppCard sx={{ height: { xs: 104, sm: 224 } }}><CardActionArea onClick={() => navigate('/assets')} sx={{ height: '100%', p: `${pageMetrics.cardInset}px` }}>
      <SectionHeader title="자산 추이" action={<Typography sx={{ fontSize: 10, lineHeight: '14px', fontWeight: 500, color: colors.focus, letterSpacing: '0.02px' }}>1개월</Typography>} />
      {trend.length > 1 ? <TrendChart values={trend.map((item) => item.value)} /> : <Typography sx={{ mt: 1, color: colors.textMuted, fontSize: 11 }}>과거 자산 추이 데이터가 없습니다.</Typography>}
    </CardActionArea></AppCard>
    </Stack>
    <AppCard sx={{ minWidth: 0, height: { xs: 164, sm: 452 } }}><Box sx={{ px: `${pageMetrics.cardInset}px`, py: '12px' }}>
      <CardActionArea onClick={() => navigate('/stocks')} sx={{ height: 24, borderRadius: '4px' }}><Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}><Stack direction="row" spacing="7px" sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>보유종목</Typography><Box role="img" aria-label={summary.pricingComplete === false ? '가격 미수집' : '시세 수집 정상'} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: summary.pricingComplete === false ? colors.textMuted : '#34D399' }} /></Stack><Typography sx={{ fontSize: 10, lineHeight: '14px', fontWeight: 500, color: '#60A5FA', letterSpacing: '0.02px' }}>전체 {holdings.length}</Typography></Stack></CardActionArea>
      {summary.pricingComplete === false && <Typography role="status" sx={{ color: colors.textMuted, fontSize: 11 }}>가격 미수집 종목이 있어 평가자산을 계산할 수 없습니다.</Typography>}
      {holdings.length === 0 && <Typography role="status" sx={{ mt: 2, color: colors.textMuted, fontSize: 12 }}>보유종목이 없습니다.</Typography>}
      <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: 'minmax(0, 1fr) 62px 98px', borderTop: `1px solid ${colors.borderStrong}`, mt: '9px', pt: '9px', color: colors.textMuted, fontSize: 10 }}><span>종목</span><Box sx={{ textAlign: 'right' }}>등락률</Box><Box sx={{ textAlign: 'right' }}>평가금액</Box></Box>
      <Stack spacing="10px" sx={{ mt: '10px', display: { xs: 'flex', sm: 'none' } }}>{featuredHoldings.map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
      <Stack sx={{ display: { xs: 'none', sm: 'flex' } }}>{holdings.slice(0, 8).map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
      <Button onClick={() => navigate('/stocks?tab=holding')} fullWidth sx={{ display: { xs: 'none', sm: 'flex' }, mt: 1, fontSize: 11, minHeight: 28, color: colors.focus }}>보유종목 전체 보기 →</Button>
    </Box></AppCard>
  </Box>;
}

function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  return <CardActionArea onClick={onClick} sx={{ minHeight: { xs: 28, sm: 39 }, borderRadius: '4px', borderBottom: { sm: `1px solid ${colors.border}` } }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 62px 128px', sm: 'minmax(0, 1fr) 62px 98px' }, alignItems: 'center', minWidth: 0 }}><Typography noWrap sx={{ fontSize: { xs: 14, sm: 12 }, lineHeight: '21px' }}>{stock.name}</Typography><Typography sx={{ fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{stock.priceAvailable === false ? '—' : formatRate(stock.priceChangeRate)}</Typography><Typography noWrap sx={{ fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{formatWon(stock.marketValue ?? Number.NaN)}</Typography><Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ display: 'none' }} /></Box></CardActionArea>;
}

function TrendChart({ values }: { values: number[] }) {
  if (values.length < 2) return <Box sx={{ mt: '10px', height: 40 }} />;
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 340},${36 - ((value - min) / range) * 28}`).join(' ');
  return <Box sx={{ mt: '10px', width: '100%', height: 40, overflow: 'hidden' }}><svg viewBox="0 0 340 40" preserveAspectRatio="none" width="100%" height="40" role="img" aria-label="최근 1개월 자산 추이"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60A5FA" stopOpacity="0.28" /><stop offset="100%" stopColor="#60A5FA" stopOpacity="0" /></linearGradient></defs><line x1="0" y1="37.5" x2="340" y2="37.5" stroke="#1E293B" /><polygon points={`0,40 ${points} 340,40`} fill="url(#trendFill)" /><polyline points={points} fill="none" stroke="#60A5FA" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></Box>;
}

function DashboardLoading() {
  return <Stack spacing="12px"><Skeleton variant="rounded" height={102} sx={{ borderRadius: '16px' }} /><Stack direction="row" spacing="10px"><Skeleton variant="rounded" height={82} sx={{ flex: 1, borderRadius: '14px' }} /><Skeleton variant="rounded" height={82} sx={{ flex: 1, borderRadius: '14px' }} /></Stack><Skeleton variant="rounded" height={104} sx={{ borderRadius: '16px' }} /><Skeleton variant="rounded" height={164} sx={{ borderRadius: '16px' }} /><Stack direction="row" spacing={1} sx={{ justifyContent: 'center', color: 'text.secondary' }}><CircularProgress size={16} /><Typography variant="body2">데이터를 불러오는 중이에요.</Typography></Stack></Stack>;
}
