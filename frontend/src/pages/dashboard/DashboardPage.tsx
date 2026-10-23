import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import './home-font.css';
import {useEffect,useState} from 'react';
import {useTargetArrivals} from '../../hooks/useTargetArrivals';
import { TargetArrivalCard } from './TargetArrivalCard';
import { RecentBuysCard } from './RecentBuysCard';
import { Box, Button } from '@mui/material';
import { useListNavigation } from '../../hooks/navigation/usePageMemory';
import { useDashboard } from '../../hooks/useMockData';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { liveApiEnabled } from '../../data/liveData';
import type { StockItem } from '../../types/models';
import { formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import {HomeSummaryCards} from './HomeSummaryCards';
import { HomeEmpty, HomeListCard, HomeListBlank, HomeTwoLineRow } from './HomeListCard';



export function DashboardPage() {
  const navigate = useListNavigation();
  const { data, isPending, isError, isFetching, refetch } = useDashboard({ pollPrices: true, includeTrend: false });
  const { accountId, accounts } = useActiveAccount();
  const [holdingsView,setHoldingsView] = useState<{accountId?:string;count:number}>({accountId,count:5});
  const visibleHoldings = holdingsView.accountId===accountId?holdingsView.count:5;
  useEffect(()=>{setHoldingsView({accountId,count:5});},[accountId]);
  const targets = useTargetArrivals({poll:false});
  const [recentReady,setRecentReady] = useState<string>();
  const prioritiesSettled = !isPending && !targets.isPending;
  // Start after the commit which paints the primary cards (including terminal errors).
  useEffect(()=>{if(accountId&&prioritiesSettled)setRecentReady(accountId);},[accountId,prioritiesSettled]);
  const summary = data?.summary, holdings = data?.holdings;
  const pending = !summary && !isError && !accounts.isError && (!liveApiEnabled || !!accountId || accounts.isPending);
  const noAccount = liveApiEnabled && !accountId && !accounts.isPending && !accounts.isError;
  const retry = () => void refetch();
  const hasTargets = targets.data?.meta.accountId === accountId && (targets.data?.meta.total ?? 0) > 0;
  const cards = {
    summary: <HomeSummaryCards key="summary" allocationAvailable={!isError} summary={summary} pending={pending} failed={isError||accounts.isError} retry={()=>{if(accounts.isError)void accounts.refetch();else retry();}}/>,
    holdings: <Box key="holdings" sx={{ gridArea: { sm: 'holdings' } }}><HomeListCard blankLoading height="auto" stable pending={pending} testId="home-holdings-card" title="보유종목" reset={()=>setHoldingsView({accountId,count:5})} resetDisabled={visibleHoldings<=5} more={()=>setHoldingsView({accountId,count:visibleHoldings+5})} moreDisabled={!holdings || visibleHoldings>=holdings.length} count={holdings ? `총 ${Math.min(holdings.length,visibleHoldings)}건` : undefined} notice={isError&&holdings ? <QueryErrorNotice message="조회 실패 · 이전 결과" onRetry={retry}/> : summary?.pricingComplete === false ? '시세 미수집 · 평가금액 판정 불가' : undefined} timestamp={summary?.collectedAt} updating={isFetching}>
      {holdings?.slice(0, visibleHoldings).map(holding => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}?detailTab=summary`)} />)}
      {pending && <HomeListBlank compact/>}
      {(isError||accounts.isError)&&!holdings&&<HomeEmpty><QueryErrorNotice message="보유종목 조회 실패"/><Button size="small" onClick={()=>{if(accounts.isError)void accounts.refetch();else retry();}}>재시도</Button></HomeEmpty>}
      {noAccount&&<HomeEmpty>등록된 계좌가 없습니다.<Button onClick={()=>navigate("/detail/settings?view=add")}>계좌 추가</Button></HomeEmpty>}
      {holdings?.length === 0 && <HomeEmpty />}
    </HomeListCard></Box>,
    recent: <Box key="recent" sx={{ gridArea: { sm: 'recent' } }}><RecentBuysCard enabled={!liveApiEnabled||recentReady===accountId} /></Box>,
    targets: <Box key="targets" sx={{ gridArea: { sm: 'targets' } }}><TargetArrivalCard /></Box>,
  };
  const order: (keyof typeof cards)[] = hasTargets ? ['summary', 'targets', 'holdings', 'recent'] : ['summary', 'holdings', 'recent', 'targets'];
  return <Box data-testid="home-shell" className="rox-home" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gridTemplateAreas: { sm: hasTargets ? '"summary recent" "targets recent" "holdings recent"' : '"summary recent" "holdings targets"' }, columnGap: '8px', rowGap: '8px', alignItems: 'start', '& [data-testid="home-holding"], & [data-testid="target-lot"], & [data-testid="recent-buy-lot"]': { pr: '8px' } }}>
    {order.map(key => cards[key])}
  </Box>;
}

export function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  const cost = stock.purchaseAmount ?? (stock.quantity !== undefined && stock.averagePrice !== undefined ? stock.quantity * stock.averagePrice : Number.NaN);
  return <HomeTwoLineRow testId="home-holding" onClick={onClick} color={getMarketColor(stock.profitAmount ?? Number.NaN)}
    first={[stock.name, formatRate(stock.profitRate ?? Number.NaN), `${stock.quantity?.toLocaleString('ko-KR') ?? '—'} × ${formatWon(stock.averagePrice ?? Number.NaN)}`]}
    second={[formatWon(cost), formatSignedWon(stock.profitAmount ?? Number.NaN), formatWon(stock.marketValue ?? Number.NaN)]} />;
}

