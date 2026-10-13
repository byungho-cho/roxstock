import './home-font.css';
import {useEffect,useState} from 'react';
import {useTargetArrivals} from '../../hooks/useTargetArrivals';
import { TargetArrivalCard } from './TargetArrivalCard';
import { RecentBuysCard } from './RecentBuysCard';
import { Box, Button, Stack } from '@mui/material';
import { useListNavigation } from '../../hooks/navigation/usePageMemory';
import { useDashboard } from '../../hooks/useMockData';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { liveApiEnabled } from '../../data/liveData';
import type { StockItem, DashboardSummary } from '../../types/models';
import { formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { HomeEmpty, HomeListCard, HomeListLoading, HomeTwoLineRow } from './HomeListCard';
import { PerformanceCard } from '../../components/common/PerformanceCard';


export function DashboardPage() {
  const navigate = useListNavigation();
  const { data, isPending, isError, isFetching, refetch } = useDashboard({ pollPrices: true, includeTrend: false });
  const { accountId, accounts } = useActiveAccount();
  const targets = useTargetArrivals({poll:false});
  const [recentReady,setRecentReady] = useState<string>();
  const prioritiesSettled = !isPending && !targets.isPending;
  // Start after the commit which paints the primary cards (including terminal errors).
  useEffect(()=>{if(accountId&&prioritiesSettled)setRecentReady(accountId);},[accountId,prioritiesSettled]);
  const summary = data?.summary, holdings = data?.holdings;
  const pending = !summary && !isError && !accounts.isError && (!liveApiEnabled || !!accountId || accounts.isPending);
  const noAccount = liveApiEnabled && !accountId && !accounts.isPending && !accounts.isError;
  const retry = () => void refetch();
  return <Box data-testid="home-shell" className="rox-home" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gridTemplateAreas: { sm: '"summary recent" "holdings targets"' }, columnGap: '8px', rowGap: '8px', alignItems: 'start', '& [data-testid="home-holding"], & [data-testid="target-lot"], & [data-testid="recent-buy-lot"]': { pr: '8px' } }}>
    <Stack data-testid="home-summary-area" spacing="8px" sx={{ minWidth: 0, minHeight: { sm: 290 }, gridArea: { sm: 'summary' } }}>
      <Box data-testid="home-total-card" aria-busy={pending} sx={{height:76,position:'relative'}}><TotalAssetCard summary={summary ?? unavailableSummary} home loading={pending}/>{(isError||accounts.isError)&&<Button size="small" sx={{position:'absolute',right:13,top:summary?27:9,p:0,fontSize:9,minHeight:18}} onClick={()=>{if(accounts.isError)void accounts.refetch();else retry();}}>조회 실패{summary?' · 이전 값':''} · 재시도</Button>}</Box>
      <Box data-testid="home-quick-cards" aria-busy={pending} sx={{height:68}}><AssetQuickCards allocationAvailable={!isError} summary={summary ?? unavailableSummary} home loading={pending}/></Box>
      <PerformanceCard summary={summary ?? unavailableSummary} profit={summary?.pricingComplete === false ? NaN : summary?.totalProfit ?? NaN} rate={summary?.pricingComplete === false || !((summary?.stockPurchaseAmount ?? 0) > 0) ? NaN : summary?.totalProfitRate ?? NaN} loading={pending}/>

    </Stack>
    <Box sx={{ gridArea: { sm: 'holdings' } }}><HomeListCard height="auto" stable pending={pending} testId="home-holdings-card" title="보유종목" titleHint="(상세보기)" titleAction={() => navigate('/stocks?tab=holding')} timestampLabel="갱신 " count={holdings ? `${holdings.length}종목` : undefined} notice={isError&&holdings ? <Button size="small" onClick={retry}>조회 실패 · 이전 결과 · 재시도</Button> : summary?.pricingComplete === false ? '시세 미수집 · 평가금액 판정 불가' : undefined} timestamp={summary?.collectedAt} updating={isFetching}>
      {holdings?.slice(0, 5).map(holding => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}?detailTab=summary`)} />)}
      {pending && <HomeListLoading/>}
      {(isError||accounts.isError)&&!holdings&&<HomeEmpty><span role="alert">보유종목 조회 실패</span><Button size="small" onClick={()=>{if(accounts.isError)void accounts.refetch();else retry();}}>재시도</Button></HomeEmpty>}
      {noAccount&&<HomeEmpty>등록된 계좌가 없습니다.<Button onClick={()=>navigate("/detail/settings?view=add")}>계좌 추가</Button></HomeEmpty>}
      {holdings?.length === 0 && <HomeEmpty />}
    </HomeListCard></Box>
    <Box sx={{ gridArea: { sm: 'recent' } }}><RecentBuysCard enabled={!liveApiEnabled||recentReady===accountId} /></Box>
    <Box sx={{ gridArea: { sm: 'targets' } }}><TargetArrivalCard /></Box>
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

