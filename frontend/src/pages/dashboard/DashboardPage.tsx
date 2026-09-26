import { Box, CardActionArea, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/useMockData';
import type { CollectionStatus, StockItem } from '../../types/models';
import { formatPercent, formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { AppCard, SectionHeader } from '../../components/common/Common';
import { colors, pageMetrics } from '../../styles/tokens';

const collectionStatusLabel: Record<CollectionStatus, string> = { success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패' };

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard();
  if (isPending) return <DashboardLoading />;
  if (isError || !data) return <AppCard><Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 700 }}>대시보드를 불러오지 못했어요.</Typography><Typography color="text.secondary" sx={{ mt: 0.5, cursor: 'pointer' }} onClick={() => refetch()}>눌러서 다시 시도해 주세요.</Typography></Box></AppCard>;

  const { summary, holdings, trend } = data;
  const stockRate = (summary.stockValue / summary.totalAssets) * 100;
  const cashRate = (summary.cashBalance / summary.totalAssets) * 100;
  return <Stack spacing={{ xs: `${pageMetrics.gap}px`, sm: 0 }} sx={{ display: { xs: 'flex', sm: 'grid' }, gridTemplateColumns: { sm: '380px 380px' }, gridTemplateRows: { sm: '116px 88px 224px' }, columnGap: { sm: '16px' }, rowGap: { sm: `${pageMetrics.gap}px` } }}>
    <AppCard sx={{ height: { xs: 102, sm: 116 }, position: 'relative', gridColumn: { sm: 1 }, gridRow: { sm: 1 } }}><CardActionArea onClick={() => navigate('/detail/assets')} sx={{ height: '100%' }}>
      <Typography sx={{ position: 'absolute', top: 17, left: pageMetrics.cardInset, fontSize: 12, lineHeight: '18px', color: colors.textSecondary }}>평가자산</Typography>
      <Box sx={{ position: 'absolute', top: 9, right: pageMetrics.cardInset, maxWidth: 'calc(100% - 32px)', textAlign: 'right', lineHeight: '36px' }}><Typography component="span" sx={{ color: getMarketColor(summary.dailyProfit), fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatWon(summary.totalAssets)}</Typography></Box>
      <Typography sx={{ position: 'absolute', top: 61, left: pageMetrics.cardInset, fontSize: 12, lineHeight: '18px', color: colors.textSecondary }}>일별손익</Typography>
      <Typography sx={{ position: 'absolute', top: 61, left: 77, fontSize: 12, lineHeight: '18px', color: getMarketColor(summary.dailyProfit) }}>{formatRate(summary.dailyProfitRate)}</Typography>
      <Typography sx={{ position: 'absolute', top: 59, right: pageMetrics.cardInset, textAlign: 'right', fontSize: 15, lineHeight: '20px', fontWeight: 600, color: getMarketColor(summary.dailyProfit) }}>{formatSignedWon(summary.dailyProfit)}</Typography>
    </CardActionArea></AppCard>
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: { xs: '10px', sm: '16px' }, height: { xs: 82, sm: 88 }, gridColumn: { sm: 1 }, gridRow: { sm: 2 } }}>
      <QuickCard title="주식평가액" value={formatWon(summary.stockValue)} rate={formatPercent(stockRate)} monthly={formatSignedWon(summary.stockMonthlyProfit)} color="#34D399" monthlyColor={getMarketColor(summary.stockMonthlyProfit)} onClick={() => navigate('/detail/stock-value')} />
      <QuickCard title="예수금" value={formatWon(summary.cashBalance)} rate={formatPercent(cashRate)} monthly={formatSignedWon(summary.cashMonthlyProfit)} color="#FBBF24" monthlyColor={getMarketColor(summary.cashMonthlyProfit)} onClick={() => navigate('/detail/cash')} />
    </Box>
    <AppCard sx={{ height: { xs: 104, sm: 224 }, gridColumn: { sm: 1 }, gridRow: { sm: 3 } }}><CardActionArea onClick={() => navigate('/assets')} sx={{ height: '100%', p: `${pageMetrics.cardInset}px` }}>
      <SectionHeader title="자산 추이" action={<Typography sx={{ fontSize: 10, lineHeight: '14px', fontWeight: 500, color: colors.focus, letterSpacing: '0.02px' }}>1개월</Typography>} />
      <TrendChart values={trend.map((item) => item.value)} />
    </CardActionArea></AppCard>
    <AppCard sx={{ height: { xs: 'auto', sm: 452 }, gridColumn: { sm: 2 }, gridRow: { sm: '1 / 4' } }}><Box sx={{ px: `${pageMetrics.cardInset}px`, py: '12px', height: '100%' }}>
      <CardActionArea onClick={() => navigate('/stocks')} sx={{ height: 24, borderRadius: '4px' }}><Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}><Stack direction="row" spacing="7px" sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>보유종목</Typography><Box role="img" aria-label="시세 수집 정상" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#34D399' }} /></Stack><Typography sx={{ fontSize: 10, lineHeight: '14px', fontWeight: 500, color: '#60A5FA', letterSpacing: '0.02px' }}>전체 {holdings.length}</Typography></Stack></CardActionArea>
      <Stack spacing="10px" sx={{ mt: '10px', display: { sm: 'none' } }}>{holdings.map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
      <Stack spacing="10px" sx={{ mt: '10px', display: { xs: 'none', sm: 'flex' }, maxHeight: 392, overflowY: 'auto', scrollbarGutter: 'stable', pr: 0.5 }}>{holdings.map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
    </Box></AppCard>
  </Stack>;
}

function QuickCard({ title, value, rate, monthly, color, monthlyColor, onClick }: { title: string; value: string; rate: string; monthly: string; color: string; monthlyColor: string; onClick: () => void }) {
  return <AppCard sx={{ height: 82, borderRadius: '14px', position: 'relative' }}><CardActionArea onClick={onClick} sx={{ height: '100%' }}><Typography sx={{ position: 'absolute', top: 7, left: pageMetrics.compactCardInset, fontSize: 11, lineHeight: '18px', color: colors.textSecondary }}>{title}</Typography><Typography sx={{ position: 'absolute', top: 7, right: pageMetrics.compactCardInset, fontSize: 10, lineHeight: '18px', color, textAlign: 'right' }}>{rate}</Typography><Typography sx={{ position: 'absolute', top: 27, right: pageMetrics.compactCardInset, maxWidth: 'calc(100% - 24px)', fontSize: 15, lineHeight: '22px', fontWeight: 600, letterSpacing: '-0.03px', color, textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</Typography><Typography sx={{ position: 'absolute', top: 54, right: pageMetrics.compactCardInset, maxWidth: 'calc(100% - 24px)', fontSize: 9, lineHeight: '18px', fontWeight: 600, letterSpacing: '-0.018px', color: monthlyColor, textAlign: 'right', whiteSpace: 'nowrap' }}>이번달 {monthly}</Typography></CardActionArea></AppCard>;
}

function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  return <CardActionArea onClick={onClick} sx={{ height: 28, borderRadius: '4px' }}><Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 62px 128px', alignItems: 'center' }}><Typography noWrap sx={{ height: 21, fontSize: 14, lineHeight: '21px' }}>{stock.name}</Typography><Typography sx={{ height: 16, fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{formatRate(stock.priceChangeRate)}</Typography><Typography sx={{ height: 16, fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{formatWon(stock.marketValue ?? 0)}</Typography><Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ display: 'none' }} /></Box></CardActionArea>;
}

function TrendChart({ values }: { values: number[] }) {
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 340},${36 - ((value - min) / range) * 28}`).join(' ');
  return <Box sx={{ mt: '10px', width: '100%', height: 40, overflow: 'hidden' }}><svg viewBox="0 0 340 40" preserveAspectRatio="none" width="100%" height="40" role="img" aria-label="최근 1개월 자산 추이"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60A5FA" stopOpacity="0.28" /><stop offset="100%" stopColor="#60A5FA" stopOpacity="0" /></linearGradient></defs><line x1="0" y1="37.5" x2="340" y2="37.5" stroke="#1E293B" /><polygon points={`0,40 ${points} 340,40`} fill="url(#trendFill)" /><polyline points={points} fill="none" stroke="#60A5FA" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></Box>;
}

function DashboardLoading() {
  return <Stack spacing="12px"><Skeleton variant="rounded" height={102} sx={{ borderRadius: '16px' }} /><Stack direction="row" spacing="10px"><Skeleton variant="rounded" height={82} sx={{ flex: 1, borderRadius: '14px' }} /><Skeleton variant="rounded" height={82} sx={{ flex: 1, borderRadius: '14px' }} /></Stack><Skeleton variant="rounded" height={104} sx={{ borderRadius: '16px' }} /><Skeleton variant="rounded" height={164} sx={{ borderRadius: '16px' }} /><Stack direction="row" spacing={1} sx={{ justifyContent: 'center', color: 'text.secondary' }}><CircularProgress size={16} /><Typography variant="body2">목 데이터를 불러오는 중이에요.</Typography></Stack></Stack>;
}
