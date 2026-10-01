import './home-font.css';
import { TargetArrivalCard } from './TargetArrivalCard';
import { RecentBuysCard } from './RecentBuysCard';
import { Box, Button, CardActionArea, CircularProgress, Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/useMockData';
import type { StockItem } from '../../types/models';
import { formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { AppCard, SectionHeader } from '../../components/common/Common';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { HomeEmpty, HomeListCard, HomeTwoLineRow } from './HomeListCard';
import { colors } from '../../styles/tokens';


export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, isFetching, refetch } = useDashboard({ pollPrices: true });
  if (isPending) return <DashboardLoading />;
  if (!data) return <AppCard><Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 700 }}>대시보드를 불러오지 못했어요.</Typography><Typography color="text.secondary" sx={{ mt: 0.5, cursor: 'pointer' }} onClick={() => refetch()}>눌러서 다시 시도해 주세요.</Typography></Box></AppCard>;

  const { summary, holdings, trend } = data;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`); monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const homeTrend = trend.filter(point => !/^\d{4}-\d{2}-\d{2}$/.test(point.label) || (point.label >= monthAgo.toISOString().slice(0, 10) && point.label <= today));
  return <Box className="rox-home" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gridTemplateAreas: { sm: '"summary targets" "holdings recent"' }, columnGap: { xs: '8px', sm: '16px' }, rowGap: '8px', alignItems: 'start' }}>
    <Snackbar open={isError} message="최신 데이터 조회에 실패했습니다. 이전 값을 표시합니다." />
    <Stack data-testid="home-summary-area" spacing="8px" sx={{ minWidth: 0, height: { sm: 290 }, gridArea: { sm: 'summary' } }}>
      <TotalAssetCard summary={summary} home />
      <AssetQuickCards summary={summary} home />
      <AppCard data-testid="home-trend-card" sx={{ height: { xs: 88, sm: 'auto' }, minHeight: { sm: 130 }, flex: { sm: 1 }, borderRadius: '8px' }}><CardActionArea onClick={() => navigate('/assets')} sx={{ height: '100%', px: { xs: '14px', sm: '15px' }, py: '12px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}>
        <SectionHeader title="자산 추이" action={<Typography sx={{ fontSize: { xs: 10, sm: 11 }, lineHeight: '14px', fontWeight: 500, color: colors.focus }}>{homeTrend.length > 1 ? '1개월' : '—'}</Typography>} />
        {homeTrend.length > 1 ? <TrendChart values={homeTrend.map((item) => item.value)} /> : <Box sx={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>내용이 없습니다.</Typography></Box>}
      </CardActionArea></AppCard>
    </Stack>
    <Box sx={{ gridArea: { sm: 'holdings' } }}><HomeListCard testId="home-holdings-card" title="보유종목" timestampLabel="갱신 " count={`${holdings.length}종목`} notice={summary.pricingComplete === false ? '시세 미수집 · 평가금액 판정 불가' : undefined} timestamp={summary.collectedAt} updating={isFetching} more={holdings.length > 5 ? () => navigate('/stocks?tab=holding') : undefined}>
      {holdings.slice(0, 5).map(holding => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}
      {holdings.length === 0 && <HomeEmpty />}
    </HomeListCard></Box>
    <Box sx={{ gridArea: { sm: 'targets' } }}><TargetArrivalCard /></Box>
    <Box sx={{ gridArea: { sm: 'recent' } }}><RecentBuysCard /></Box>
  </Box>;
}

function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  const cost = stock.purchaseAmount ?? (stock.quantity !== undefined && stock.averagePrice !== undefined ? stock.quantity * stock.averagePrice : Number.NaN);
  return <HomeTwoLineRow testId="home-holding" onClick={onClick} color={getMarketColor(stock.profitAmount ?? Number.NaN)}
    first={[stock.name, `${stock.quantity?.toLocaleString('ko-KR') ?? '—'} × ${formatWon(stock.averagePrice ?? Number.NaN)}`, formatRate(stock.profitRate ?? Number.NaN)]}
    second={[formatWon(cost), formatWon(stock.marketValue ?? Number.NaN), formatSignedWon(stock.profitAmount ?? Number.NaN)]} />;
}

function TrendChart({ values }: { values: number[] }) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return <HomeEmpty />;
  const min = Math.min(...finite); const max = Math.max(...finite); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 340},${72 - ((value - min) / range) * 58}`).join(' ');
  return <Box sx={{ mt: '7px', width: '100%', height: { xs: 32, sm: 74 }, overflow: 'hidden' }}><ChartLine points={points} /></Box>;
}

function ChartLine({ points }: { points: string }) {
  return <svg viewBox="0 0 340 80" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="자산 추이"><defs><linearGradient id="homeTrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60A5FA" stopOpacity="0.28" /><stop offset="100%" stopColor="#60A5FA" stopOpacity="0" /></linearGradient></defs><path d="M 0 16 H 340 M 0 42 H 340 M 0 68 H 340" stroke="#25344D" strokeWidth="0.7" /><polygon points={`0,80 ${points} 340,80`} fill="url(#homeTrendFill)" /><polyline points={points} fill="none" stroke="#60A5FA" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function DashboardLoading() {
  return <Stack spacing="8px"><Skeleton variant="rounded" height={76} sx={{ borderRadius: '8px' }} /><Stack direction="row" spacing="10px"><Skeleton variant="rounded" height={68} sx={{ flex: 1, borderRadius: '8px' }} /><Skeleton variant="rounded" height={68} sx={{ flex: 1, borderRadius: '8px' }} /></Stack><Skeleton variant="rounded" height={88} sx={{ borderRadius: '8px' }} /><Skeleton variant="rounded" height={156} sx={{ borderRadius: '8px' }} /><Stack direction="row" spacing={1} sx={{ justifyContent: 'center', color: 'text.secondary' }}><CircularProgress size={16} /><Typography variant="body2">데이터를 불러오는 중이에요.</Typography></Stack></Stack>;
}

