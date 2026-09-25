import { Box, CardActionArea, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/useMockData';
import type { CollectionStatus, StockItem } from '../../types/models';
import { formatAmount, formatRate, formatSignedAmount, getMarketColor } from '../../utils/format';
import { AmountText, AppCard, SectionHeader } from '../../components/common/Common';
import { colors } from '../../styles/tokens';

const collectionStatusLabel: Record<CollectionStatus, string> = { success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패' };

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard();
  if (isPending) return <DashboardLoading />;
  if (isError || !data) return <AppCard><Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 700 }}>대시보드를 불러오지 못했어요.</Typography><Typography color="text.secondary" sx={{ mt: 0.5, cursor: 'pointer' }} onClick={() => refetch()}>눌러서 다시 시도해 주세요.</Typography></Box></AppCard>;

  const { summary, holdings, trend } = data;
  const stockRate = (summary.stockValue / summary.totalAssets) * 100;
  const cashRate = (summary.cashBalance / summary.totalAssets) * 100;
  const previewHoldings = ['hyundai', 'kia', 'samsung'].map((id) => holdings.find((stock) => stock.id === id)).filter((stock): stock is StockItem => Boolean(stock));
  return <Stack spacing={{ xs: '12px', sm: 0 }} sx={{ display: { xs: 'flex', sm: 'grid' }, gridTemplateColumns: { sm: '380px 380px' }, gridTemplateRows: { sm: '116px 88px 224px' }, columnGap: { sm: '16px' }, rowGap: { sm: '12px' } }}>
    <AppCard sx={{ height: { xs: 102, sm: 116 }, position: 'relative', gridColumn: { sm: 1 }, gridRow: { sm: 1 } }}><CardActionArea onClick={() => navigate('/detail/assets')} sx={{ height: '100%' }}>
      <Typography sx={{ position: 'absolute', top: 15, left: 15, fontSize: 12, lineHeight: '18px', color: '#CBD5E1' }}>평가자산</Typography>
      <Box sx={{ position: 'absolute', top: 9, right: 17, width: 256, textAlign: 'right', lineHeight: '36px' }}><AmountText value={summary.totalAssets} size={24} weight={700} color={summary.dailyProfit >= 0 ? colors.marketRise : colors.marketFall} /></Box>
      <Typography sx={{ position: 'absolute', top: 60, left: 15, fontSize: 12, lineHeight: '18px', color: '#CBD5E1' }}>일별손익</Typography>
      <Typography sx={{ position: 'absolute', top: 60, left: 76, fontSize: 12, lineHeight: '18px', color: getMarketColor(summary.dailyProfit) }}>{formatRate(summary.dailyProfitRate)}</Typography>
      <Typography sx={{ position: 'absolute', top: 59, right: 17, width: 161, textAlign: 'right', fontSize: 15, lineHeight: '20px', fontWeight: 600, color: getMarketColor(summary.dailyProfit) }}>{formatSignedAmount(summary.dailyProfit)}</Typography>
    </CardActionArea></AppCard>
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: { xs: '10px', sm: '16px' }, height: { xs: 82, sm: 88 }, gridColumn: { sm: 1 }, gridRow: { sm: 2 } }}>
      <QuickCard title="주식평가액" value={formatAmount(summary.stockValue)} rate={formatRate(stockRate)} monthly={formatSignedAmount(summary.stockMonthlyProfit)} color="#34D399" monthlyColor={getMarketColor(summary.stockMonthlyProfit)} onClick={() => navigate('/detail/stock-value')} />
      <QuickCard title="예수금" value={formatAmount(summary.cashBalance)} rate={formatRate(cashRate)} monthly={formatSignedAmount(summary.cashMonthlyProfit)} color="#FBBF24" monthlyColor={getMarketColor(summary.cashMonthlyProfit)} onClick={() => navigate('/detail/cash')} />
    </Box>
    <AppCard sx={{ height: { xs: 104, sm: 224 }, gridColumn: { sm: 1 }, gridRow: { sm: 3 } }}><CardActionArea onClick={() => navigate('/assets')} sx={{ height: '100%', p: '14px' }}>
      <SectionHeader title="자산 추이" action={<Typography sx={{ fontSize: 10, lineHeight: '14px', fontWeight: 500, color: colors.focus, letterSpacing: '0.02px' }}>1개월</Typography>} />
      <TrendChart values={trend.map((item) => item.value)} />
    </CardActionArea></AppCard>
    <AppCard sx={{ height: { xs: 164, sm: 452 }, gridColumn: { sm: 2 }, gridRow: { sm: '1 / 4' } }}><Box sx={{ px: '14px', py: '12px' }}>
      <CardActionArea onClick={() => navigate('/stocks')} sx={{ height: 24, borderRadius: '4px' }}><Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}><Stack direction="row" spacing="7px" sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>보유종목</Typography><Box role="img" aria-label="시세 수집 정상" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#34D399' }} /></Stack><Typography sx={{ fontSize: 10, lineHeight: '14px', fontWeight: 500, color: '#60A5FA', letterSpacing: '0.02px' }}>전체 {holdings.length}</Typography></Stack></CardActionArea>
      <Stack spacing="10px" sx={{ mt: '10px', display: { sm: 'none' } }}>{previewHoldings.map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
      <Stack spacing="10px" sx={{ mt: '10px', display: { xs: 'none', sm: 'flex' } }}>{holdings.map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
    </Box></AppCard>
  </Stack>;
}

function QuickCard({ title, value, rate, monthly, color, monthlyColor, onClick }: { title: string; value: string; rate: string; monthly: string; color: string; monthlyColor: string; onClick: () => void }) {
  return <AppCard sx={{ height: 82, borderRadius: '14px', position: 'relative' }}><CardActionArea onClick={onClick} sx={{ height: '100%' }}><Typography sx={{ position: 'absolute', top: 7, left: 11, fontSize: 11, lineHeight: '18px', color: colors.textSecondary }}>{title}</Typography><Typography sx={{ position: 'absolute', top: 7, right: 13, fontSize: 10, lineHeight: '18px', color, textAlign: 'right' }}>{rate}</Typography><Typography sx={{ position: 'absolute', top: 27, right: 13, width: 153, fontSize: 15, lineHeight: '22px', fontWeight: 600, letterSpacing: '-0.03px', color, textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</Typography><Typography sx={{ position: 'absolute', top: 54, right: 13, width: 154, fontSize: 9, lineHeight: '18px', fontWeight: 600, letterSpacing: '-0.018px', color: monthlyColor, textAlign: 'right', whiteSpace: 'nowrap' }}>이번달 {monthly}</Typography></CardActionArea></AppCard>;
}

function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  return <CardActionArea onClick={onClick} sx={{ height: 28, borderRadius: '4px' }}><Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 62px 128px', alignItems: 'center' }}><Typography noWrap sx={{ height: 21, fontSize: 14, lineHeight: '21px' }}>{stock.name}</Typography><Typography sx={{ height: 16, fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{formatRate(stock.priceChangeRate)}</Typography><Typography sx={{ height: 16, fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{formatAmount(stock.marketValue ?? 0)}</Typography><Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ display: 'none' }} /></Box></CardActionArea>;
}

function TrendChart({ values }: { values: number[] }) {
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 340},${36 - ((value - min) / range) * 28}`).join(' ');
  return <Box sx={{ mt: '10px', width: '100%', height: 40, overflow: 'hidden' }}><svg viewBox="0 0 340 40" preserveAspectRatio="none" width="100%" height="40" role="img" aria-label="최근 1개월 자산 추이"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60A5FA" stopOpacity="0.28" /><stop offset="100%" stopColor="#60A5FA" stopOpacity="0" /></linearGradient></defs><line x1="0" y1="37.5" x2="340" y2="37.5" stroke="#1E293B" /><polygon points={`0,40 ${points} 340,40`} fill="url(#trendFill)" /><polyline points={points} fill="none" stroke="#60A5FA" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></Box>;
}

function DashboardLoading() {
  return <Stack spacing="12px"><Skeleton variant="rounded" height={102} sx={{ borderRadius: '16px' }} /><Stack direction="row" spacing="10px"><Skeleton variant="rounded" height={82} sx={{ flex: 1, borderRadius: '14px' }} /><Skeleton variant="rounded" height={82} sx={{ flex: 1, borderRadius: '14px' }} /></Stack><Skeleton variant="rounded" height={104} sx={{ borderRadius: '16px' }} /><Skeleton variant="rounded" height={164} sx={{ borderRadius: '16px' }} /><Stack direction="row" spacing={1} sx={{ justifyContent: 'center', color: 'text.secondary' }}><CircularProgress size={16} /><Typography variant="body2">목 데이터를 불러오는 중이에요.</Typography></Stack></Stack>;
}
