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
  const isHomePage = location.pathname === '/';

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
    <Box sx={{ minHeight: '100dvh', bgcolor: 'transparent', pb: isTradePage ? 0 : isHomePage ? '78px' : '104px' }}>
      <AppBar position="sticky" elevation={0} color="transparent" sx={{ bgcolor: isHomePage ? '#080D18' : 'rgba(8, 13, 24, 0.88)', backdropFilter: isHomePage ? 'none' : 'blur(20px)', borderBottom: isHomePage ? 0 : '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ width: '100%', maxWidth: isHomePage ? 400 : 960, mx: 'auto', minHeight: isHomePage ? 74 : { xs: 60, sm: 68 }, height: isHomePage ? 74 : 'auto', px: isHomePage ? 2 : { xs: 2, sm: 3 }, pt: isHomePage ? '18px' : 0, pb: isHomePage ? '12px' : 0, alignItems: isHomePage ? 'flex-start' : 'center' }}>
          <Box sx={{ flex: 1 }}>
            {!isHomePage && <Typography sx={{ fontSize: 10, fontWeight: 800, color: 'primary.main', letterSpacing: '0.12em', lineHeight: 1 }}>ROXSTOCK</Typography>}
            <Typography component="h1" sx={isHomePage ? { mt: '7px', fontSize: 22, lineHeight: '30px', fontWeight: 700, letterSpacing: '-0.11px' } : { mt: 0.45, fontSize: 20, fontWeight: 750 }}>{getHeaderTitle(location.pathname)}</Typography>
          </Box>
          {!isTradePage && (
            <Tooltip title="거래등록">
              <IconButton aria-label="거래등록" onClick={() => navigate('/trade')} sx={{ width: 44, height: 44, bgcolor: isHomePage ? '#1E293B' : 'primary.main', color: isHomePage ? '#F8FAFC' : 'background.default', boxShadow: isHomePage ? 'none' : '0 8px 24px rgba(96, 165, 250, 0.26)', '&:hover': { bgcolor: isHomePage ? '#263449' : '#93C5FD' }, '& .MuiSvgIcon-root': { fontSize: isHomePage ? 26 : 24 } }}>
                <AddRounded />
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ width: '100%', maxWidth: isHomePage ? 400 : 960, mx: 'auto', px: isHomePage ? 2 : { xs: 1.5, sm: 3 }, py: isHomePage ? 0 : { xs: 2, sm: 3 } }}>
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
            sx={{ position: 'fixed', inset: 'auto 0 0', zIndex: 10, height: isHomePage ? 72 : 76, borderTop: '1px solid', borderColor: 'divider', bgcolor: isHomePage ? '#111827' : 'rgba(17, 24, 39, 0.94)', backdropFilter: isHomePage ? 'none' : 'blur(22px)', '& .MuiBottomNavigationAction-root': { minWidth: 0, maxWidth: isHomePage ? 80 : 'none', pt: isHomePage ? '9px' : 0, pb: isHomePage ? '6px' : 0, px: isHomePage ? '2px' : 0.5, justifyContent: isHomePage ? 'flex-start' : 'center', color: '#94A3B8' }, '& .MuiBottomNavigationAction-root::before': { content: '""', position: 'absolute', top: 0, width: 28, height: 3, borderRadius: '0 0 3px 3px', bgcolor: 'transparent' }, '& .Mui-selected': { color: 'secondary.main' }, '& .Mui-selected::before': { bgcolor: isHomePage ? 'transparent' : 'secondary.main' }, '& .MuiSvgIcon-root': { fontSize: isHomePage ? 22 : 23 }, '& .MuiBottomNavigationAction-label': { fontSize: 10, lineHeight: '14px', mt: isHomePage ? '3px' : 0.4, letterSpacing: '0.02px', '&.Mui-selected': { fontSize: 10, fontWeight: isHomePage ? 500 : 800 } } }}
          >
            {navItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}
          </BottomNavigation>
        </>
      )}
    </Box>
  );
}
