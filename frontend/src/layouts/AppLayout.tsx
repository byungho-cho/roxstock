import { ArrowUpwardRounded } from '@mui/icons-material';
import { Box, IconButton, Zoom } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, HeaderSlotContext, PageHeader } from '../components/navigation/Navigation';
import { OverlayPageScrollbar } from '../components/navigation/OverlayPageScrollbar';
import { ViewportMetricsPanel } from '../components/navigation/ViewportMetricsPanel';
import { colors, pageMetrics } from '../styles/tokens';
import { usePageScrollRestoration } from '../hooks/navigation/usePageScrollRestoration';
import { PullRefreshIndicator } from '../components/navigation/PullRefreshIndicator';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PageLayout } from './PageLayout';

function getHeaderTitle(pathname: string): string {
  const collectionTitles: Record<string, string> = { 'security-master': '종목 마스터', 'realtime-prices': '실시간 주가', 'market-prices': '전체 종목 주가', 'account-snapshots': '일별 계좌 스냅샷', 'dart-financial-statements': 'DART 재무제표' };
  if (pathname.startsWith('/detail/collection-monitoring')) return collectionTitles[pathname.split('/')[3] ?? ''] ?? '수집 모니터링';
  if (pathname.startsWith('/stocks')) return '종목목록'; if (pathname.startsWith('/journal')) return '매매일지';
  if (pathname.startsWith('/assets')) return '자산분석'; if (pathname.startsWith('/more')) return '더보기';
  if (pathname === '/detail/settings') return '설정'; if (pathname.startsWith('/detail/collection-monitoring')) return '수집 모니터링'; if (pathname.startsWith('/detail')) return '상세정보'; return '대시보드';
}

export function AppLayout() {
  const location = useLocation(); const navigate = useNavigate(); const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  usePageScrollRestoration(scrollRef);
  const isTargetPage = location.pathname === '/detail/target-arrivals';
  const isTargetSettings = location.pathname === '/detail/settings' && new URLSearchParams(location.search).get('view') === 'target-arrival';
  const isTradePage = location.pathname.startsWith('/trade'); const isHomePage = location.pathname === '/'; const isStockFlowPage = location.pathname.startsWith('/stocks');
  const pull = usePullToRefresh(scrollRef, isHomePage ? 'home' : location.pathname === '/stocks' ? 'stocks' : null);
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
  const hasPageHeader = isTargetPage || isTradePage || isStockFlowPage || isAssetOverview || isJournal || isMoreSettings || isAnalysis || isInvestment || isValue || isCompound || isFinancial;
  return <HeaderSlotContext.Provider value={headerSlot}><Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: `${pageMetrics.headerHeight}px` }}>
    <Box component="div" ref={setHeaderSlot} sx={{ height: pageMetrics.headerHeight, flexShrink: 0, width: '100%', bgcolor: colors.canvas, zIndex: 11, ...(isFinancial ? {'& .MuiToolbar-root':{px:'8px'},'& h1':{fontSize: new URLSearchParams(location.search).has('selected') || isStockFlowPage ? '14px !important':'22px !important',fontWeight:600,textAlign: new URLSearchParams(location.search).has('selected') || isStockFlowPage ? 'center':'left'}} : {}), ...(isAnalysis ? { '& .MuiToolbar-root': { pl: '0px' } } : {}), ...(isCash || isInvestment || isCompound ? { '& .MuiToolbar-root': { px: '8px' }, '& h1': { fontSize: 22, fontWeight: 600 }, '& [aria-label="뒤로가기"]': { width: 11, mr: '16px' } } : {}), ...(isCompound ? { '& h1': { fontSize: { xs: new URLSearchParams(location.search).has('form') ? 16 : new URLSearchParams(location.search).get('view') && new URLSearchParams(location.search).get('view') !== 'list' ? 17 : 22, sm: 22 }, fontWeight: 600 } } : {}), ...(isJournal || isStockFlowPage || isMoreMenu || isMoreSettings ? { '& .MuiToolbar-root': { px: '8px' } } : {}), ...(isTradePage || location.pathname === '/stocks/add' || location.pathname.endsWith('/price') ? { '& h1': { fontSize: { xs: isTradePage ? 16 : 15, sm: 15 }, fontWeight: 600 } } : isStockFlowPage && !isValue || isMoreSettings ? { '& h1': { fontSize: location.pathname === '/stocks' && !new URLSearchParams(location.search).has('selected') ? 22 : 16, fontWeight: location.pathname === '/stocks' ? 700 : 600 } } : {}), ...(location.pathname === '/detail/investment-profit' ? { '& h1': { fontSize: 20, lineHeight: '28px', fontWeight: 700 }, '& [aria-label="뒤로가기"]': { width: 20, minWidth: 20, p: 0, mr: '8px' } } : {}), ...(isJournal ? { '& h1': { fontSize: 20, lineHeight: '32px', textAlign: 'left' }, '& .MuiToolbar-root': { alignItems: 'center' } } : {}), ...(isCollectionMonitoring || isMoreSettings || isCompound ? { '& .MuiToolbar-root': { px: '8px' }, '& [aria-label="뒤로가기"]': { width: 12, minWidth: 12, mr: '16px', p: 0 }, '& [aria-label="뒤로가기"] + .MuiBox-root': { textAlign: 'left' }, '& h1': { textAlign: 'left', fontSize: { xs: isCompound && !new URLSearchParams(location.search).has('form') && !['goal','compare'].includes(new URLSearchParams(location.search).get('view') ?? '') ? 22 : 18, sm: isCollectionMonitoring || isCompound ? 22 : 18 } } } : {}) }}>
      {isMoreMenu && <PageHeader title="메뉴" showAdd={false} />}
      {!hasPageHeader && !isMoreMenu && <PageHeader homeDashboard={isHomePage} variant={isCollectionMonitoring ? 'detail' : isHomePage ? 'home' : location.pathname === '/more' ? 'more' : 'standard'} title={getHeaderTitle(location.pathname)} backPath={isCollectionMonitoring ? location.pathname === '/detail/collection-monitoring' ? '/more' : '/detail/collection-monitoring' : location.pathname === '/more' ? '/' : undefined} backIcon={isCollectionMonitoring ? <img src="/stocks-v03/back.svg" alt="" /> : undefined} showBackTablet={isCollectionMonitoring} showAddMobile={!isCollectionMonitoring} showAdd={isHomePage} addPath="/stocks/add?type=holding&from=home" addLabel="종목 추가" onAdd={isHomePage ? () => navigate("/stocks/add?type=holding&from=home",{state:{backgroundLocation:location}}) : undefined} maxWidth={816} />}
    </Box>
    {(isHomePage || location.pathname === '/stocks') && <PullRefreshIndicator pull={pull}/> }
    <PageLayout valueChart={isValueChart||isFinancial} scrollRef={scrollRef} settings={isMoreSettings} moreMenu={isMoreMenu} trade={isTradePage} journal={isJournal} cash={isCash} analysis={isAnalysis || isInvestment || isValue || isCompound} targetFlow={isTargetPage || isTargetSettings} more={isMoreSettings || location.pathname === '/more'} home={isHomePage} assetOverview={location.pathname === '/detail/assets'} stocks={isStockFlowPage && !isValue && !isFinancial} stockAdd={location.pathname === "/stocks/add"} collectionMonitoring={isCollectionMonitoring}><Outlet /></PageLayout>
    {!isCash && <OverlayPageScrollbar scrollRef={scrollRef} hasHeader hasBottomNav />}
    {new URLSearchParams(location.search).get('viewport') === '1' && <ViewportMetricsPanel />}
    {<><Zoom in={!isCash && showScrollTop}><IconButton aria-label="맨 위로" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} sx={{ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: pageMetrics.headerHeight + 8, zIndex: 12, width: 40, height: 40, bgcolor: colors.raised, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><ArrowUpwardRounded /></IconButton></Zoom><BottomNav /></>}
  </Box></HeaderSlotContext.Provider>;
}


