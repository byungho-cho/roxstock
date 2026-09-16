import { AddRounded, AssessmentRounded, HomeRounded, MenuRounded, PieChartRounded } from '@mui/icons-material';
import { AppBar, BottomNavigation, BottomNavigationAction, Box, Fab, Toolbar, Typography } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { label: '홈', path: '/', icon: <HomeRounded /> }, { label: '포트폴리오', path: '/portfolio', icon: <PieChartRounded /> },
  { label: '매매', path: '/trade', icon: <AddRounded /> }, { label: '일지', path: '/journal', icon: <AssessmentRounded /> },
  { label: '더보기', path: '/more', icon: <MenuRounded /> },
];

export function AppLayout() {
  const location = useLocation(); const navigate = useNavigate();
  return <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', pb: 10 }}>
    <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(16px)' }}><Toolbar sx={{ maxWidth: 1120, width: '100%', mx: 'auto' }}><Typography variant="h6" color="primary.main">RoxStock</Typography><Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>나의 투자 기록</Typography></Toolbar></AppBar>
    <Box component="main" sx={{ maxWidth: 1120, mx: 'auto', px: { xs: 2, sm: 3 }, py: 2 }}><Outlet /></Box>
    <BottomNavigation showLabels value={location.pathname} onChange={(_, path: string) => navigate(path)} sx={{ position: 'fixed', inset: 'auto 0 0', zIndex: 10, height: 72, borderTop: '1px solid rgba(148, 163, 184, 0.14)', bgcolor: 'rgba(17, 24, 39, 0.94)', backdropFilter: 'blur(18px)' }}>
      {navItems.map((item) => item.path === '/trade' ? <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={<Fab size="small" color="primary" aria-label="매매 등록">{item.icon}</Fab>} /> : <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}
    </BottomNavigation>
  </Box>;
}
