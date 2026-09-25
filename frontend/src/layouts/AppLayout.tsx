import { ArrowUpwardRounded } from '@mui/icons-material';
import { Box, IconButton, Zoom } from '@mui/material';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav, PageHeader } from '../components/navigation/Navigation';
import { colors } from '../styles/tokens';

function getHeaderTitle(pathname: string): string {
  if (pathname.startsWith('/stocks')) return '종목목록'; if (pathname.startsWith('/journal')) return '매매일지';
  if (pathname.startsWith('/assets')) return '자산분석'; if (pathname.startsWith('/more')) return '더보기';
  if (pathname.startsWith('/detail')) return '상세정보'; return '대시보드';
}

export function AppLayout() {
  const location = useLocation(); const [showScrollTop, setShowScrollTop] = useState(false);
  const isTradePage = location.pathname.startsWith('/trade'); const isHomePage = location.pathname === '/';
  useEffect(() => { const handle = () => setShowScrollTop(window.scrollY > window.innerHeight * 0.4); handle(); window.addEventListener('scroll', handle, { passive: true }); return () => window.removeEventListener('scroll', handle); }, []);
  return <Box sx={{ minHeight: '100dvh', pb: isTradePage ? 0 : { xs: '78px', sm: '70px' } }}>
    {!isTradePage && <PageHeader title={getHeaderTitle(location.pathname)} subtitle={isHomePage ? undefined : undefined} />}
    <Box component="main" sx={{ width: '100%', maxWidth: isTradePage ? 880 : { xs: 400, sm: 816 }, mx: 'auto', px: isTradePage ? 0 : { xs: 2, sm: 2.5 }, py: isTradePage || isHomePage ? 0 : 2 }}><Outlet /></Box>
    {!isTradePage && <><Zoom in={showScrollTop}><IconButton aria-label="맨 위로" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })} sx={{ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: { xs: 88, sm: 78 }, zIndex: 12, width: 44, height: 44, bgcolor: colors.raised, color: colors.textPrimary, border: `1px solid ${colors.border}` }}><ArrowUpwardRounded /></IconButton></Zoom><BottomNav /></>}
  </Box>;
}
