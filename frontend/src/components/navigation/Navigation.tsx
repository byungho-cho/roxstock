import { AccountBalanceWalletRounded, AddRounded, AnalyticsRounded, AssessmentRounded, CalendarMonthRounded, HomeRounded, MenuRounded, PriceCheckRounded, StarRounded } from '@mui/icons-material';
import { AppBar, BottomNavigation as MuiBottomNavigation, BottomNavigationAction, Box, IconButton, Toolbar, Tooltip, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { colors } from '../../styles/tokens';

const coverItems = [
  { label: '종목목록', path: '/stocks', icon: <StarRounded /> }, { label: '매매일지', path: '/journal', icon: <CalendarMonthRounded /> },
  { label: '홈', path: '/', icon: <HomeRounded /> }, { label: '자산분석', path: '/assets', icon: <AnalyticsRounded /> }, { label: '더보기', path: '/more', icon: <MenuRounded /> },
];
const tabletItems = [coverItems[0], coverItems[1], { label: '평가자산', path: '/detail/assets', icon: <AssessmentRounded /> }, { label: '예수금', path: '/detail/cash', icon: <AccountBalanceWalletRounded /> }, coverItems[2], coverItems[3], { label: '재무제표', path: '/financials', icon: <PriceCheckRounded /> }, { label: '시세수집', path: '/collection', icon: <PriceCheckRounded /> }, coverItems[4]];

export function PageHeader({ title, subtitle, showAdd = true, compact = false }: { title: string; subtitle?: string; showAdd?: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  return <AppBar position="sticky" elevation={0} color="transparent" sx={{ bgcolor: colors.canvas, border: 0 }}><Toolbar sx={{ width: '100%', maxWidth: { xs: 'none', sm: 816 }, mx: 'auto', minHeight: compact ? 56 : { xs: 74, sm: 84 }, px: { xs: 1.5, sm: 2.5 }, py: compact ? 0 : { xs: '18px', sm: '18px' }, alignItems: compact ? 'center' : 'flex-start' }}><Box sx={{ flex: 1, mt: compact ? 0 : { xs: '7px', sm: 0 } }}><Typography component="h1" sx={{ fontSize: 22, lineHeight: '30px', fontWeight: 700, letterSpacing: '-0.11px', textAlign: compact ? 'center' : 'left' }}>{title}</Typography>{subtitle && <Typography sx={{ mt: 0.25, fontSize: 11, color: colors.textMuted }}>{subtitle}</Typography>}</Box>{showAdd && <Tooltip title="거래등록"><IconButton aria-label="거래등록" onClick={() => navigate('/trade')} sx={{ width: { xs: 44, sm: 38 }, height: { xs: 44, sm: 38 }, bgcolor: colors.raised, color: colors.textPrimary, '&:hover': { bgcolor: colors.borderStrong } }}><AddRounded sx={{ fontSize: { xs: 26, sm: 24 } }} /></IconButton></Tooltip>}{compact && <Box sx={{ width: 40 }} />}</Toolbar></AppBar>;
}

export function BottomNav() {
  const navigate = useNavigate(); const location = useLocation();
  const value = [...tabletItems].sort((a, b) => b.path.length - a.path.length).find((item) => item.path !== '/' && location.pathname.startsWith(item.path))?.path ?? '/';
  const style = { position: 'fixed', inset: 'auto 0 0', zIndex: 10, mx: 'auto', borderTop: `1px solid ${colors.border}`, bgcolor: colors.surface, '& .MuiBottomNavigationAction-root': { minWidth: 0, color: colors.textMuted }, '& .Mui-selected': { color: colors.navActive }, '& .MuiBottomNavigationAction-label': { fontSize: 10, lineHeight: '14px', mt: '3px', '&.Mui-selected': { fontSize: 10, fontWeight: 500 } } } as const;
  return <><MuiBottomNavigation showLabels value={value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, display: { xs: 'flex', sm: 'none' }, width: '100%', maxWidth: 'none', height: 72, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], flex: '1 1 20%', maxWidth: 'none', pt: '9px', pb: '6px', px: '2px', justifyContent: 'flex-start' }, '& .MuiSvgIcon-root': { fontSize: 22 } }}>{coverItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation><MuiBottomNavigation showLabels value={value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, display: { xs: 'none', sm: 'flex' }, width: '100%', maxWidth: 'none', height: 64, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], flex: '1 1 11.111%', maxWidth: 'none', pt: '9px', pb: '5px' }, '& .MuiSvgIcon-root': { fontSize: 20 } }}>{tabletItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation></>;
}
