import './home-font.css';
import { TargetArrivalCard } from './TargetArrivalCard';
import { RecentBuysCard } from './RecentBuysCard';
import { Box, Button,  Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import { useListNavigation } from '../../hooks/navigation/usePageMemory';
import { useDashboard } from '../../hooks/useMockData';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { liveApiEnabled } from '../../data/liveData';
import type { StockItem } from '../../types/models';
import { formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { AppCard, SectionHeader } from '../../components/common/Common';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { HomeEmpty, HomeListCard, HomeTwoLineRow } from './HomeListCard';
import { AssetTrendChart } from '../../components/common/AssetTrendChart';
import { colors } from '../../styles/tokens';


export function DashboardPage() {
  const navigate = useListNavigation();
  const { data, isPending, isError, isFetching, refetch, historyPending, historyError } = useDashboard({ pollPrices: true });
  const { accountId, accounts } = useActiveAccount();
  if (liveApiEnabled && !accountId) {
    if (accounts.isPending) return <DashboardLoading />;
    if (accounts.isError) return <AppCard><Stack spacing={2} sx={{ p: 3 }}>
      <Typography role="alert">계좌 정보를 불러오지 못했어요.</Typography>
      <Button variant="outlined" onClick={() => void accounts.refetch()}>다시 시도</Button>
    </Stack></AppCard>;
    return <AppCard><Stack spacing={2} sx={{ p: 3, alignItems: 'center', textAlign: 'center' }}>
      <Typography sx={{ fontWeight: 700 }}>등록된 계좌가 없습니다.</Typography>
      <Typography color="text.secondary">계좌를 추가하면 자산과 보유종목을 확인할 수 있어요.</Typography>
      <Button variant="contained" onClick={() => navigate('/detail/settings?view=add')}>계좌 추가</Button>
    </Stack></AppCard>;
  }
  const summary = data?.summary, holdings = data?.holdings, trend = data?.trend ?? [];
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`); monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const homeTrend = trend.filter(point => !/^\d{4}-\d{2}-\d{2}$/.test(point.label) || (point.label >= monthAgo.toISOString().slice(0, 10) && point.label <= today));
  return <Box className="rox-home" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gridTemplateAreas: { sm: '"summary targets" "holdings recent"' }, columnGap: '8px', rowGap: '8px', alignItems: 'start', '& [data-testid="home-holding"], & [data-testid="target-lot"], & [data-testid="recent-buy-lot"]': { pr: '8px' } }}>
    <Snackbar open={isError} message="최신 데이터 조회에 실패했습니다. 이전 값을 표시합니다." />
    <Stack data-testid="home-summary-area" spacing="8px" sx={{ minWidth: 0, minHeight: { sm: 290 }, gridArea: { sm: 'summary' } }}>
      {summary ? <><TotalAssetCard summary={summary} home /><AssetQuickCards summary={summary} home /></> : isPending ? <><Skeleton variant="rounded" height={76}/><Skeleton variant="rounded" height={68}/></> : <AppCard><Button onClick={() => void refetch()}>대시보드 조회 실패 · 재시도</Button></AppCard>}
      <AppCard data-testid="home-trend-card" sx={{ minHeight: { xs: 120, sm: 204 }, flex: { sm: 1 }, borderRadius: '8px' }}><Box sx={{ height: '100%', px: { xs: '14px', sm: '15px' }, py: '12px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}>
        <SectionHeader title="자산 추이" action={<Typography sx={{ fontSize: { xs: 10, sm: 11 }, lineHeight: '14px', fontWeight: 500, color: colors.focus }}>{homeTrend.length > 1 ? '1개월' : '—'}</Typography>} />
        {liveApiEnabled && historyPending ? <Skeleton data-testid="home-trend-loading" height={50}/> : historyError ? <Typography role="alert" sx={{fontSize:11}}>자산 추이 조회 실패</Typography> : homeTrend.length > 1 ? <AssetTrendChart points={homeTrend.map(item => ({date: item.label, value: item.value}))} height={{xs:64,sm:148}} dateMode="day" /> : <Box sx={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>내용이 없습니다.</Typography></Box>}
      </Box></AppCard>
    </Stack>
    <Box sx={{ gridArea: { sm: 'holdings' } }}>{holdings && summary ? <HomeListCard testId="home-holdings-card" title="보유종목" titleHint="(상세보기)" titleAction={() => navigate('/stocks?tab=holding')} timestampLabel="갱신 " count={`${holdings.length}종목`} notice={summary.pricingComplete === false ? '시세 미수집 · 평가금액 판정 불가' : undefined} timestamp={summary.collectedAt} updating={isFetching}>
      {holdings.slice(0, 5).map(holding => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}
      {holdings.length === 0 && <HomeEmpty />}
    </HomeListCard> : <Skeleton variant="rounded" height={156}/>}</Box>
    <Box sx={{ gridArea: { sm: 'targets' } }}><TargetArrivalCard /></Box>
    <Box sx={{ gridArea: { sm: 'recent' } }}><RecentBuysCard /></Box>
  </Box>;
}

export function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  const cost = stock.purchaseAmount ?? (stock.quantity !== undefined && stock.averagePrice !== undefined ? stock.quantity * stock.averagePrice : Number.NaN);
  return <HomeTwoLineRow testId="home-holding" onClick={onClick} color={getMarketColor(stock.profitAmount ?? Number.NaN)}
    first={[stock.name, `${stock.quantity?.toLocaleString('ko-KR') ?? '—'} × ${formatWon(stock.averagePrice ?? Number.NaN)}`, formatRate(stock.profitRate ?? Number.NaN)]}
    second={[formatWon(cost), formatWon(stock.marketValue ?? Number.NaN), formatSignedWon(stock.profitAmount ?? Number.NaN)]} />;
}

function DashboardLoading() {
  return <Stack spacing="8px"><Skeleton variant="rounded" height={76} sx={{ borderRadius: '8px' }} /><Stack direction="row" spacing="10px"><Skeleton variant="rounded" height={68} sx={{ flex: 1, borderRadius: '8px' }} /><Skeleton variant="rounded" height={68} sx={{ flex: 1, borderRadius: '8px' }} /></Stack><Skeleton variant="rounded" height={88} sx={{ borderRadius: '8px' }} /><Skeleton variant="rounded" height={156} sx={{ borderRadius: '8px' }} /></Stack>;
}

