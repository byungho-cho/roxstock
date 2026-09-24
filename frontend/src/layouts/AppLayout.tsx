import {
  AddRounded, AnalyticsRounded, ArrowUpwardRounded, CalendarMonthRounded,
  HomeRounded, MenuRounded, StarRounded,
} from '@mui/icons-material';
import {
  AppBar, BottomNavigation, BottomNavigationAction, Box, IconButton,
  Toolbar, Tooltip, Typography, Zoom,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { label: '종목목록', path: '/stocks', icon: <StarRounded /> },
  { label: '매매일지', path: '/journal', icon: <CalendarMonthRounded /> },
  { label: '홈', path: '/', icon: <HomeRounded /> },
  { label: '자산분석', path: '/assets', icon: <AnalyticsRounded /> },
  { label: '더보기', path: '/more', icon: <MenuRounded /> },
];

function getHeaderTitle(pathname: string): string {
  if (pathname.startsWith('/stocks')) return '종목목록';
  if (pathname.startsWith('/journal')) return '매매일지';
  if (pathname.startsWith('/assets')) return '자산분석';
  if (pathname.startsWith('/more')) return '더보기';
  if (pathname.startsWith('/trade')) return '거래등록';
  if (pathname.startsWith('/detail')) return '상세정보';
  return '대시보드';
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const isTradePage = location.pathname.startsWith('/trade');

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > window.innerHeight * 0.4);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navigationValue = useMemo(() => (
    navItems.find((item) => item.path !== '/' && location.pathname.startsWith(item.path))?.path ?? '/'
  ), [location.pathname]);

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'transparent', pb: isTradePage ? 0 : '104px' }}>
      <AppBar position="sticky" elevation={0} color="transparent" sx={{ bgcolor: 'rgba(8, 13, 24, 0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ width: '100%', maxWidth: 960, mx: 'auto', minHeight: { xs: 60, sm: 68 }, px: { xs: 2, sm: 3 } }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 800, color: 'primary.main', letterSpacing: '0.12em', lineHeight: 1 }}>ROXSTOCK</Typography>
            <Typography variant="h6" component="h1" sx={{ mt: 0.45 }}>{getHeaderTitle(location.pathname)}</Typography>
          </Box>
          {!isTradePage && (
            <Tooltip title="거래등록">
              <IconButton aria-label="거래등록" onClick={() => navigate('/trade')} sx={{ width: 44, height: 44, bgcolor: 'primary.main', color: 'background.default', boxShadow: '0 8px 24px rgba(96, 165, 250, 0.26)', '&:hover': { bgcolor: '#93C5FD' } }}>
                <AddRounded />
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ width: '100%', maxWidth: 960, mx: 'auto', px: { xs: 1.5, sm: 3 }, py: { xs: 2, sm: 3 } }}>
        <Outlet />
      </Box>

      {!isTradePage && (
        <>
          <Zoom in={showScrollTop}>
            <IconButton
              aria-label="맨 위로"
              onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
              sx={{ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: 88, zIndex: 12, width: 44, height: 44, bgcolor: 'rgba(31, 41, 55, 0.82)', color: 'text.primary', border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'rgba(41, 53, 72, 0.9)' } }}
            >
              <ArrowUpwardRounded />
            </IconButton>
          </Zoom>

          <BottomNavigation
            showLabels
            value={navigationValue}
            onChange={(_, path: string) => navigate(path)}
            sx={{ position: 'fixed', inset: 'auto 0 0', zIndex: 10, height: 76, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'rgba(17, 24, 39, 0.94)', backdropFilter: 'blur(22px)', '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.5, color: '#94A3B8' }, '& .MuiBottomNavigationAction-root::before': { content: '""', position: 'absolute', top: 0, width: 28, height: 3, borderRadius: '0 0 3px 3px', bgcolor: 'transparent' }, '& .Mui-selected': { color: 'secondary.main' }, '& .Mui-selected::before': { bgcolor: 'secondary.main' }, '& .MuiSvgIcon-root': { fontSize: 23 }, '& .MuiBottomNavigationAction-label': { fontSize: 10, mt: 0.4, '&.Mui-selected': { fontSize: 10, fontWeight: 800 } } }}
          >
            {navItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}
          </BottomNavigation>
        </>
      )}
    </Box>
  );
}
