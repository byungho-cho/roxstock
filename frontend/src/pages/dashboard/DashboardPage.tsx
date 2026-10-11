import {DelayedSkeleton as Skeleton} from '../../components/common/DelayedSkeleton';
import './home-font.css';
import {useEffect,useState} from 'react';
import {useTargetArrivals} from '../../hooks/useTargetArrivals';
import { TargetArrivalCard } from './TargetArrivalCard';
import { RecentBuysCard } from './RecentBuysCard';
import { Box, Button, CardActionArea, Stack, Typography } from '@mui/material';
import { useListNavigation } from '../../hooks/navigation/usePageMemory';
import { useDashboard } from '../../hooks/useMockData';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { liveApiEnabled } from '../../data/liveData';
import type { StockItem, DashboardSummary } from '../../types/models';
import { formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { AppCard } from '../../components/common/Common';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { HomeEmpty, HomeListCard, HomeListLoading, HomeTwoLineRow } from './HomeListCard';
import { AssetTrendChart } from '../../components/common/AssetTrendChart';
import { colors } from '../../styles/tokens';


export function DashboardPage() {
  const navigate = useListNavigation();
  const { data, isPending, isError, isFetching, refetch, historyData, historyRefetch, historyPending, historyError, historySettled } = useDashboard({ pollPrices: true });
  const { accountId, accounts } = useActiveAccount();
  const targets = useTargetArrivals({poll:false});
  const [recentReady,setRecentReady] = useState<string>();
  const prioritiesSettled = !isPending && historySettled && !targets.isPending;
  // Start after the commit which paints the primary cards (including terminal errors).
  useEffect(()=>{if(accountId&&prioritiesSettled)setRecentReady(accountId);},[accountId,prioritiesSettled]);
  const summary = data?.summary, holdings = data?.holdings;
  // Trend can paint even while the independent dashboard request is still pending.
  const trend = liveApiEnabled ? (historyData?.data ?? []).map(point=>({label:point.date,value:point.totalAssetValue==null?Number.NaN:Number(point.totalAssetValue)})) : data?.trend ?? [];
  const pending = !summary && !isError && !accounts.isError && (!liveApiEnabled || !!accountId || accounts.isPending);
  const noAccount = liveApiEnabled && !accountId && !accounts.isPending && !accounts.isError;
  const chartPending = liveApiEnabled && historyPending && !accounts.isError && !noAccount;
  const retry = () => void refetch();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`); monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const homeTrend = trend.filter(point => !/^\d{4}-\d{2}-\d{2}$/.test(point.label) || (point.label >= monthAgo.toISOString().slice(0, 10) && point.label <= today));
  return <Box data-testid="home-shell" className="rox-home" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gridTemplateAreas: { sm: '"summary targets" "holdings recent"' }, columnGap: '8px', rowGap: '8px', alignItems: 'start', '& [data-testid="home-holding"], & [data-testid="target-lot"], & [data-testid="recent-buy-lot"]': { pr: '8px' } }}>
    <Stack data-testid="home-summary-area" spacing="8px" sx={{ minWidth: 0, minHeight: { sm: 290 }, gridArea: { sm: 'summary' } }}>
      <Box data-testid="home-total-card" aria-busy={pending} sx={{height:76,position:'relative'}}><TotalAssetCard summary={summary ?? unavailableSummary} home loading={pending}/>{(isError||accounts.isError)&&<Button size="small" sx={{position:'absolute',right:13,top:summary?27:9,p:0,fontSize:9,minHeight:18}} onClick={()=>{if(accounts.isError)void accounts.refetch();else retry();}}>조회 실패{summary?' · 이전 값':''} · 재시도</Button>}</Box>
      <Box data-testid="home-quick-cards" aria-busy={pending} sx={{height:68}}><AssetQuickCards allocationAvailable={!isError} summary={summary ?? unavailableSummary} home loading={pending}/></Box>
      <AppCard data-testid="home-trend-card" sx={{ minHeight: { xs: 120, sm: 204 }, flex: { sm: 1 }, borderRadius: '8px' }}><Box sx={{ height: '100%', px: { xs: '14px', sm: '15px' }, py: '12px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' }}>
        <CardActionArea aria-label="자산추이 (상세보기)" onClick={() => navigate('/assets')} sx={{ display: 'flex', justifyContent: 'space-between', gap: '4px', alignItems: 'center', minHeight: 24 }}>
          <Typography component="h2" sx={{ fontSize: 16, fontWeight: 600, lineHeight: '24px' }}>자산추이 <Box component="span" sx={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>(상세보기)</Box></Typography>
          <Typography sx={{ fontSize: { xs: 10, sm: 11 }, lineHeight: '14px', fontWeight: 500, color: colors.focus }}>{chartPending ? <Skeleton width={30} height={14}/> : homeTrend.length > 1 ? '1개월' : '—'}</Typography>
        </CardActionArea>
        <Box data-testid="home-chart-region" aria-busy={chartPending} sx={{height:{xs:87,sm:171},position:"relative",display:"flex",alignItems:"center","& > *":{width:"100%"}}}>{chartPending ? <Skeleton variant="rounded" sx={{transform:"none",height:"100%"}} data-testid="home-trend-loading"/> : historyError&&!historyData || accounts.isError ? <Stack sx={{width:"100%",height:"100%",justifyContent:"center",alignItems:"center"}}><Typography role="alert" sx={{fontSize:11}}>자산 추이 조회 실패</Typography><Button size="small" onClick={()=>{if(accounts.isError)void accounts.refetch();else void historyRefetch();}}>재시도</Button></Stack> : homeTrend.length > 1 ? <AssetTrendChart points={homeTrend.map(item => ({date: item.label, value: item.value}))} height={{xs:64,sm:148}} dateMode="day" /> : <Box sx={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>내용이 없습니다.</Typography></Box>}{historyError&&historyData&&<Button size="small" sx={{position:"absolute",top:0,right:0,p:0,fontSize:9,minHeight:18,width:"auto!important"}} onClick={()=>void historyRefetch()}>조회 실패 · 이전 결과 · 재시도</Button>}</Box>
      </Box></AppCard>
    </Stack>
    <Box sx={{ gridArea: { sm: 'holdings' } }}><HomeListCard stable pending={pending} testId="home-holdings-card" title="보유종목" titleHint="(상세보기)" titleAction={() => navigate('/stocks?tab=holding')} timestampLabel="갱신 " count={holdings ? `${holdings.length}종목` : undefined} notice={isError&&holdings ? <Button size="small" onClick={retry}>조회 실패 · 이전 결과 · 재시도</Button> : summary?.pricingComplete === false ? '시세 미수집 · 평가금액 판정 불가' : undefined} timestamp={summary?.collectedAt} updating={isFetching}>
      {holdings?.slice(0, 5).map(holding => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}
      {pending && <HomeListLoading/>}
      {(isError||accounts.isError)&&!holdings&&<HomeEmpty><span role="alert">보유종목 조회 실패</span><Button size="small" onClick={()=>{if(accounts.isError)void accounts.refetch();else retry();}}>재시도</Button></HomeEmpty>}
      {noAccount&&<HomeEmpty>등록된 계좌가 없습니다.<Button onClick={()=>navigate("/detail/settings?view=add")}>계좌 추가</Button></HomeEmpty>}
      {holdings?.length === 0 && <HomeEmpty />}
    </HomeListCard></Box>
    <Box sx={{ gridArea: { sm: 'targets' } }}><TargetArrivalCard /></Box>
    <Box sx={{ gridArea: { sm: 'recent' } }}><RecentBuysCard enabled={!liveApiEnabled||recentReady===accountId} /></Box>
  </Box>;
}

export function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  const cost = stock.purchaseAmount ?? (stock.quantity !== undefined && stock.averagePrice !== undefined ? stock.quantity * stock.averagePrice : Number.NaN);
  return <HomeTwoLineRow testId="home-holding" onClick={onClick} color={getMarketColor(stock.profitAmount ?? Number.NaN)}
    first={[stock.name, `${stock.quantity?.toLocaleString('ko-KR') ?? '—'} × ${formatWon(stock.averagePrice ?? Number.NaN)}`, formatRate(stock.profitRate ?? Number.NaN)]}
    second={[formatWon(cost), formatWon(stock.marketValue ?? Number.NaN), formatSignedWon(stock.profitAmount ?? Number.NaN)]} />;
}

// Unknown data is never represented as a successful zero amount.
const unavailableSummary: DashboardSummary = {totalAssets:NaN,stockValue:NaN,stockPurchaseAmount:NaN,cashBalance:NaN,dailyProfit:NaN,dailyProfitRate:NaN,stockMonthlyProfit:NaN,cashMonthlyProfit:NaN,totalProfit:NaN,totalProfitRate:NaN,collectedAt:'',pricingComplete:false};

