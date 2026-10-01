import { ArrowUpwardRounded } from '@mui/icons-material';
import { Box, IconButton, Zoom } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav, HeaderSlotContext, PageHeader } from '../components/navigation/Navigation';
import { OverlayPageScrollbar } from '../components/navigation/OverlayPageScrollbar';
import { ViewportMetricsPanel } from '../components/navigation/ViewportMetricsPanel';
import { colors, pageMetrics } from '../styles/tokens';
import { PageLayout } from './PageLayout';

function getHeaderTitle(pathname: string): string {
  const collectionTitles: Record<string, string> = { 'security-master': '종목 마스터', 'realtime-prices': '실시간 주가', 'market-prices': '전체 종목 주가', 'account-snapshots': '일별 계좌 스냅샷', 'dart-financial-statements': 'DART 재무제표' };
  if (pathname.startsWith('/detail/collection-monitoring')) return collectionTitles[pathname.split('/')[3] ?? ''] ?? '수집 모니터링';
  if (pathname.startsWith('/stocks')) return '종목목록'; if (pathname.startsWith('/journal')) return '매매일지';
  if (pathname.startsWith('/assets')) return '자산분석'; if (pathname.startsWith('/more')) return '더보기';
  if (pathname === '/detail/settings') return '설정'; if (pathname.startsWith('/detail/collection-monitoring')) return '수집 모니터링'; if (pathname.startsWith('/detail')) return '상세정보'; return '대시보드';
}

export function AppLayout() {
  const location = useLocation(); const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const isTargetPage = location.pathname === '/detail/target-arrivals';
  const isTargetSettings = location.pathname === '/detail/settings' && new URLSearchParams(location.search).get('view') === 'target-arrival';
  const isTradePage = location.pathname.startsWith('/trade'); const isHomePage = location.pathname === '/'; const isStockFlowPage = location.pathname.startsWith('/stocks');
  const isAssetOverview = location.pathname === '/detail/assets' || location.pathname === '/detail/cash';
  const isJournal = location.pathname === '/journal';
  useEffect(() => {
    const content = scrollRef.current;
    if (!content) return;
    const handle = () => setShowScrollTop(content.scrollTop > content.clientHeight * 0.4);
    content.addEventListener('scroll', handle, { passive: true });
    handle();
    return () => content.removeEventListener('scroll', handle);
  }, [location.pathname]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setShowScrollTop(false);
  }, [location.pathname]);
  const isMoreMenu = location.pathname === '/more';
  const isMoreSettings = location.pathname === '/detail/settings'; const isCollectionMonitoring = location.pathname.startsWith('/detail/collection-monitoring');
  const hasPageHeader = isTargetPage || isTradePage || isStockFlowPage || isAssetOverview || isJournal || isMoreSettings;
  return <HeaderSlotContext.Provider value={headerSlot}><Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: isTradePage ? 0 : `${pageMetrics.headerHeight}px` }}>
    <Box component={isMoreMenu ? 'header' : 'div'} ref={setHeaderSlot} sx={{ height: pageMetrics.headerHeight, flexShrink: 0, width: '100%', bgcolor: colors.canvas, zIndex: 11, ...(isCollectionMonitoring ? { '& h1': { fontSize: { xs: 18, sm: 21 } } } : {}) }}>
      {!hasPageHeader && !isMoreMenu && <PageHeader homeDashboard={isHomePage} variant={isCollectionMonitoring ? 'detail' : isHomePage ? 'home' : location.pathname === '/more' ? 'more' : 'standard'} title={getHeaderTitle(location.pathname)} backPath={isCollectionMonitoring ? location.pathname === '/detail/collection-monitoring' ? '/more' : '/detail/collection-monitoring' : location.pathname === '/more' ? '/' : undefined} showBackTablet={isCollectionMonitoring} showAddMobile={!isCollectionMonitoring} showAdd={isHomePage} addPath="/trade" addLabel="거래등록" maxWidth={isCollectionMonitoring ? 725 : 816} />}
    </Box>
    <PageLayout scrollRef={scrollRef} moreMenu={isMoreMenu} trade={isTradePage} journal={isJournal} targetFlow={isTargetPage || isTargetSettings} more={isMoreSettings || location.pathname === '/more'} home={isHomePage} assetOverview={location.pathname === '/detail/assets'} stocks={isStockFlowPage} collectionMonitoring={isCollectionMonitoring}><Outlet /></PageLayout>
    <OverlayPageScrollbar scrollRef={scrollRef} hasHeader={!isTradePage} hasBottomNav={!isTradePage} />
    {new URLSearchParams(location.search).get('viewport') === '1' && <ViewportMetricsPanel />}
    {!isTradePage && <><Zoom in={showScrollTop}><IconButton aria-label="맨 위로" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} sx={{ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: pageMetrics.headerHeight + 8, zIndex: 12, width: 40, height: 40, bgcolor: colors.raised, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><ArrowUpwardRounded /></IconButton></Zoom><BottomNav /></>}
  </Box></HeaderSlotContext.Provider>;
}

