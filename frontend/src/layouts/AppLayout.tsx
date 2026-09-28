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
  if (pathname.startsWith('/stocks')) return '종목목록'; if (pathname.startsWith('/journal')) return '매매일지';
  if (pathname.startsWith('/assets')) return '자산분석'; if (pathname.startsWith('/more')) return '더보기';
  if (pathname === '/detail/settings') return '설정'; if (pathname.startsWith('/detail')) return '상세정보'; return '대시보드';
}

export function AppLayout() {
  const location = useLocation(); const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
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
  const isMoreSettings = location.pathname === '/detail/settings';
  const hasPageHeader = isTradePage || isStockFlowPage || isAssetOverview || isJournal || isMoreSettings;
  return <HeaderSlotContext.Provider value={headerSlot}><Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: isTradePage ? 0 : `${pageMetrics.headerHeight}px` }}>
    <Box ref={setHeaderSlot} sx={{ height: pageMetrics.headerHeight, flexShrink: 0, width: '100%', bgcolor: colors.canvas, zIndex: 11 }}>
      {!hasPageHeader && <PageHeader variant={isHomePage ? 'home' : location.pathname === '/more' ? 'more' : 'standard'} title={getHeaderTitle(location.pathname)} backPath={location.pathname === '/more' ? '/' : undefined} showAdd={isHomePage} addPath="/trade" addLabel="거래등록" />}
    </Box>
    <PageLayout scrollRef={scrollRef} trade={isTradePage} journal={isJournal} more={isMoreSettings || location.pathname === '/more'} home={isHomePage} coverTop={location.pathname === '/detail/assets' ? 18 : 16} stocks={isStockFlowPage}><Outlet /></PageLayout>
    <OverlayPageScrollbar scrollRef={scrollRef} hasHeader={!isTradePage} hasBottomNav={!isTradePage} />
    {new URLSearchParams(location.search).get('viewport') === '1' && <ViewportMetricsPanel />}
    {!isTradePage && <><Zoom in={showScrollTop}><IconButton aria-label="맨 위로" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} sx={{ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: pageMetrics.headerHeight + 8, zIndex: 12, width: 40, height: 40, bgcolor: colors.raised, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><ArrowUpwardRounded /></IconButton></Zoom><BottomNav /></>}
  </Box></HeaderSlotContext.Provider>;
}
