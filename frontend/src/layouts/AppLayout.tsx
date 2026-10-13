import {useReturnNavigation} from '../hooks/navigation/usePageMemory';
import { RouteContent } from '../components/common/RouteLoading';
import { HomeAccountTitle } from '../components/navigation/HomeAccountTitle';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useActiveAccount } from '../hooks/useActiveAccount';
import { ArrowUpwardRounded } from '@mui/icons-material';
import { Box, Button, IconButton, Snackbar, Zoom } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, HeaderSlotContext, PageHeader } from '../components/navigation/Navigation';
import { OverlayPageScrollbar } from '../components/navigation/OverlayPageScrollbar';
import { ViewportMetricsPanel } from '../components/navigation/ViewportMetricsPanel';
import { colors, pageMetrics } from '../styles/tokens';
import { usePageScrollRestoration } from '../hooks/navigation/usePageScrollRestoration';
import { PullRefreshIndicator } from '../components/navigation/PullRe…9780 tokens truncated…nceCard summary={summary ?? unavailableSummary} profit={summary?.pricingComplete === false ? NaN : summary?.totalProfit ?? NaN} rate={summary?.pricingComplete === false || !((summary?.stockPurchaseAmount ?? 0) > 0) ? NaN : summary?.totalProfitRate ?? NaN} loading={pending}/>

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

