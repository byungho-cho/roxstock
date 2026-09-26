import { ArrowUpwardRounded } from '@mui/icons-material';
import { Box, IconButton, Zoom } from '@mui/material';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav, PageHeader } from '../components/navigation/Navigation';
import { colors, pageMetrics } from '../styles/tokens';
import { PageLayout } from './PageLayout';

function getHeaderTitle(pathname: string): string {
  if (pathname.startsWith('/stocks')) return '종목목록'; if (pathname.startsWith('/journal')) return '매매일지';
  if (pathname.startsWith('/assets')) return '자산분석'; if (pathname.startsWith('/more')) return '더보기';
  if (pathname.startsWith('/detail')) return '상세정보'; return '대시보드';
}

export function AppLayout() {
  const location = useLocation(); const [showScrollTop, setShowScrollTop] = useState(false);
  const isTradePage = location.pathname.startsWith('/trade'); const isHomePage = location.pathname === '/'; const isStockFlowPage = location.pathname.startsWith('/stocks');
  const isAssetOverview = location.pathname === '/detail/assets' || location.pathname === '/detail/cash';
  useEffect(() => { const handle = () => setShowScrollTop(window.scrollY > window.innerHeight * 0.4); handle(); window.addEventListener('scroll', handle, { passive: true }); return () => window.removeEventListener('scroll', handle); }, []);
  return <Box sx={{ minHeight: '100dvh', pb: isTradePage ? 0 : `${pageMetrics.headerHeight}px` }}>
    {!isTradePage && !isStockFlowPage && !isAssetOverview && <PageHeader variant={isHomePage ? 'home' : 'standard'} title={getHeaderTitle(location.pathname)} subtitle={isHomePage ? `${new Date().toLocaleDateString('ko-KR').replaceAll(' ', '')} · 실시간 자산 현황` : undefined} addPath={isHomePage ? '/stocks/add?type=watchlist' : '/trade'} addLabel={isHomePage ? '종목 추가' : '거래등록'} />}
    <PageLayout trade={isTradePage} embeddedHeader={isAssetOverview || isStockFlowPage}><Outlet /></PageLayout>
    {!isTradePage && <><Zoom in={showScrollTop}><IconButton aria-label="맨 위로" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} sx={{ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: pageMetrics.headerHeight + 8, zIndex: 12, width: 40, height: 40, bgcolor: colors.raised, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><ArrowUpwardRounded /></IconButton></Zoom><BottomNav /></>}
  </Box>;
}
