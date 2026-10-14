import { ReleaseVersion } from '../components/navigation/ReleaseVersion';
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
import { PullRefreshIndicator } from '../components/navigation/PullRefreshIndicator';
import { MainLoadingBar } from '../components/navigation/MainLoadingBar';

import { PageLayout } from './PageLayout';

function getHeaderTitle(pathname: string): string {
  const collectionTitles: Record<string, string> = { 'security-master': '종목 마스터', 'realtime-prices': '실시간 주가', 'market-prices': '전체 종목 주가', 'account-snapshots': '일별 계좌 스냅샷', 'dart-financial-statements': 'DART 재무제표' };
  if (pathname.startsWith('/detail/collection-monitoring')) return pathname.endsWith('/runs') ? '실행 이력' : pathname.endsWith('/items') ? '대상별 상태' : collectionTitles[pathname.split('/')[3] ?? ''] ?? '수집 모니터링';
  if (pathname.startsWith('/stocks')) return '종목목록'; if (pathname.startsWith('/journal')) return '매매일지';
  if (pathname.startsWith('/assets')) return '자산분석'; if (pathname.startsWith('/more')) return '더보기';
  if (pathname === '/detail/settings') return '설정'; if (pathname.startsWith('/detail/collection-monitoring')) return '수집 모니터링'; if (pathname.startsWith('/detail')) return '상세정보'; return '대시보드';
}

export function AppLayout() {
  const returnMonitor=useReturnNavigation('/detail/collection-monitoring');
  const location = useLocation(); const navigate = useNavigate(); const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  usePageScrollRestoration(scrollRef);
  const { accountId } = useActiveAccount();
  const pull = usePullToRefresh(scrollRef, `${accountId}:${location.pathname}:${location.search}`);
  const isTargetPage = location.pathname === '/detail/target-arrivals';
  const isTargetSettings = location.pathname === '/detail/settings' && new URLSearchParams(location.search).get('view') === 'target-arrival';
  const isTradePage = location.pathname.startsWith('/trade') || location.pathname.startsWith('/journal/trade/'); const isHomePage = location.pathname === '/'; const isStockFlowPage = location.pathname.startsWith('/stocks');

  const isAssetOverview = location.pathname === '/detail/assets' || location.pathname === '/detail/cash';
  const isCash = location.pathname === '/detail/cash';
  const isFinancial = location.pathname === '/detail/financials' || /^\/stocks\/[^/]+\/financials$/.test(location.pathname);
  const isValue = location.pathname === '/detail/value' || /^\/stocks\/[^/]+\/value$/.test(location.pathname);
  const isValueChart = isValue && new URLSearchParams(location.search).get('view') === 'chart';
  const isInvestment = location.pathname === '/detail/investment' || location.pathname === '/detail/investment-profit';
  const isCompound = location.pathname === '/detail/compound';
  const isAnalysis = location.pathname === '/assets';
  const isJournal = location.pathname === '/journal';
  useEffect(() => {
    const content = scrollRef.current;
    if (!content) return;
    const handle = () => { setShowScrollTop(content.scrollTop > content.clientHeight * 0.4); };
    content.addEventListener('scroll', handle, { passive: true });
    setShowScrollTop(content.scrollTop > content.clientHeight * 0.4);
    return () => content.removeEventListener('scroll', handle);
  }, [location.pathname]);
  const isMoreMenu = location.pathname === '/more';
  const isMoreSettings = location.pathname === '/detail/settings'; const isCollectionMonitoring = location.pathname.startsWith('/detail/collection-monitoring');
  const hasPageHeader = location.pathname==='/detail/security-management' || isTargetPage || isTradePage || isStockFlowPage || isAssetOverview || isJournal || isMoreSettings || isAnalysis || isInvestment || isValue || isCompound || isFinancial;
  return <HeaderSlotContext.Provider value={headerSlot}><Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: `${pageMetrics.headerHeight}px` }}>
    <Box component="div" ref={setHeaderSlot} sx={{ height: pageMetrics.headerHeight, flexShrink: 0, width: '100%', bgcolor: colors.canvas, zIndex: 11 }}>
      {isMoreMenu && <PageHeader title="메뉴" showAdd={false} action={<ReleaseVersion />} />}
      {!hasPageHeader && !isMoreMenu && <PageHeader homeDashboard={isHomePage} variant={isCollectionMonitoring ? 'detail' : isHomePage ? 'home' : location.pathname === '/more' ? 'more' : 'standard'} title={isHomePage ? <HomeAccountTitle /> : getHeaderTitle(location.pathname)} backPath={isCollectionMonitoring ? location.pathname === '/detail/collection-monitoring' ? '/detail/settings' : /^\/detail\/collection-monitoring\/[^/]+\/(runs|items)$/.test(location.pathname) ? location.pathname.split('/').slice(0,4).join('/') : '/detail/collection-monitoring' : location.pathname === '/more' ? '/' : undefined} onBack={isCollectionMonitoring && /\/(runs|items)$/.test(location.pathname) && location.state?.returnTo ? returnMonitor : undefined} backIcon={isCollectionMonitoring ? <img src="/stocks-v03/back.svg" alt="" /> : undefined} showBackTablet={isCollectionMonitoring} showAddMobile={!isCollectionMonitoring} showAdd={isHomePage} addPath="/stocks/add?type=holding&from=home" addLabel="종목 추가" onAdd={isHomePage ? () => navigate("/stocks/add?type=holding&from=home",{state:{backgroundLocation:location}}) : undefined} maxWidth={816} />}
    </Box>
    <MainLoadingBar />
    <PullRefreshIndicator distance={pull.distance} refreshing={pull.refreshing} />
    <Snackbar open={pull.error} autoHideDuration={5000} onClose={pull.dismissError} message="새로고침에 실패했습니다. 기존 데이터를 표시합니다." action={<Button onClick={pull.retry}>재시도</Button>} />
    <PageLayout securityManagement={location.pathname==='/detail/security-management'&&new URLSearchParams(location.search).has('selected')} valueChart={isValueChart||isFinancial} scrollRef={scrollRef} settings={isMoreSettings} moreMenu={isMoreMenu} trade={isTradePage} journal={isJournal} cash={isCash} analysis={isAnalysis || isInvestment || isValue || isCompound} targetFlow={isTargetPage || isTargetSettings} more={isMoreSettings || location.pathname === '/more'} home={isHomePage} assetOverview={location.pathname === '/detail/assets'} stocks={isStockFlowPage && !isValue && !isFinancial} stockAdd={location.pathname === "/stocks/add"} collectionMonitoring={isCollectionMonitoring}><RouteContent><Outlet /></RouteContent></PageLayout>
    {!isCash && <OverlayPageScrollbar scrollRef={scrollRef} hasHeader hasBottomNav />}
    {new URLSearchParams(location.search).get('viewport') === '1' && <ViewportMetricsPanel />}
    {<><Zoom in={!isCash && showScrollTop}><IconButton aria-label="맨 위로" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} sx={{ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: pageMetrics.headerHeight + 8, zIndex: 12, width: 40, height: 40, bgcolor: colors.raised, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><ArrowUpwardRounded /></IconButton></Zoom><BottomNav /></>}
  </Box></HeaderSlotContext.Provider>;
}


