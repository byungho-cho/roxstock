import { AccountBalanceWalletRounded, AddRounded, ArrowBackRounded, AnalyticsRounded, AssessmentRounded, CalendarMonthRounded, HomeRounded, MenuRounded, PriceCheckRounded, StarRounded } from '@mui/icons-material';
import { AppBar, BottomNavigation as MuiBottomNavigation, BottomNavigationAction, Box, IconButton, Toolbar, Tooltip, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { colors } from '../../styles/tokens';

const coverItems = [
  { label: '종목목록', path: '/stocks', icon: <StarRounded /> }, { label: '매매일지', path: '/journal', icon: <CalendarMonthRounded /> },
  { label: '홈', path: '/', icon: <HomeRounded /> }, { label: '자산분석', path: '/assets', icon: <AnalyticsRounded /> }, { label: '더보기', path: '/more', icon: <MenuRounded /> },
];
const tabletItems = [coverItems[0], coverItems[1], { label: '평가자산', path: '/detail/assets', icon: <AssessmentRounded /> }, { label: '예수금', path: '/detail/cash', icon: <AccountBalanceWalletRounded /> }, coverItems[2], coverItems[3], { label: '재무제표', path: '/financials', icon: <PriceCheckRounded /> }, { label: '시세수집', path: '/collection', icon: <PriceCheckRounded /> }, coverItems[4]];

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  showAdd?: boolean;
  compact?: boolean;
  addPath?: string;
  addLabel?: string;
  onAdd?: () => void;
  backPath?: string;
  onBack?: () => void;
  showAddMobile?: boolean;
  action?: ReactNode;
  embedded?: boolean;
  embeddedGutter?: number;
};

// Every screen uses the same 48px title bar; actions and back navigation vary by route.
export function PageHeader({ title, subtitle, showAdd = true, compact = false, addPath = '/trade', addLabel = '거래등록', onAdd, backPath, onBack, showAddMobile = true, action, embedded = false, embeddedGutter = 12 }: PageHeaderProps) {
  const navigate = useNavigate();
  const hasBack = Boolean(backPath || onBack);
  return <AppBar position="sticky" elevation={0} color="transparent" sx={{ bgcolor: colors.canvas, border: 0, ...(embedded && { width: { xs: `calc(100% + ${embeddedGutter * 2}px)`, sm: 'calc(100% + 40px)' }, mx: { xs: `-${embeddedGutter}px`, sm: '-20px' } }) }}>
    <Toolbar sx={{ width: '100%', maxWidth: { xs: 'none', sm: 816 }, mx: 'auto', minHeight: '48px !important', height: 48, px: { xs: 1.5, sm: 2.5 }, py: 0, alignItems: 'center' }}>
      {hasBack && <IconButton aria-label="뒤로가기" onClick={onBack ?? (() => navigate(backPath!))} sx={{ display: { xs: 'flex', sm: 'none' }, width: 36, height: 36, mr: 1, color: colors.textPrimary }}><ArrowBackRounded /></IconButton>}
      <Box sx={{ flex: 1, minWidth: 0, textAlign: hasBack || compact ? { xs: 'center', sm: 'left' } : 'left' }}>
        <Typography component="h1" noWrap sx={{ fontSize: { xs: 20, sm: 21 }, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.11px' }}>{title}</Typography>
        {subtitle && <Typography noWrap sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11, lineHeight: '14px', color: colors.textMuted }}>{subtitle}</Typography>}
      </Box>
      {action ?? (showAdd && <Tooltip title={addLabel}><IconButton aria-label={addLabel} onClick={onAdd ?? (() => navigate(addPath))} sx={{ display: { xs: showAddMobile ? 'flex' : 'none', sm: 'flex' }, width: 36, height: 36, bgcolor: colors.raised, color: colors.textPrimary, '&:hover': { bgcolor: colors.borderStrong } }}><AddRounded sx={{ fontSize: 22 }} /></IconButton></Tooltip>)}
      {(compact || (hasBack && !showAddMobile && !action)) && <Box sx={{ display: { xs: 'block', sm: 'none' }, width: 36, flexShrink: 0 }} />}
    </Toolbar>
  </AppBar>;
}

export function BottomNav() {
  const navigate = useNavigate(); const location = useLocation();
  const value = [...tabletItems].sort((a, b) => b.path.length - a.path.length).find((item) => item.path !== '/' && location.pathname.startsWith(item.path))?.path ?? '/';
  const isAssetOverview = location.pathname === '/detail/assets' || location.pathname === '/detail/cash';
  const style = { position: 'fixed', inset: 'auto 0 0', zIndex: 10, mx: 'auto', borderTop: `1px solid ${colors.border}`, bgcolor: colors.surface, '& .MuiBottomNavigationAction-root': { minWidth: 0, color: colors.textMuted }, '& .Mui-selected': { color: colors.navActive }, '& .MuiBottomNavigationAction-label': { fontSize: 10, lineHeight: '14px', mt: '3px', '&.Mui-selected': { fontSize: 10, fontWeight: 500 } } } as const;
  return <><MuiBottomNavigation showLabels value={isAssetOverview ? '/' : value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, display: { xs: 'flex', sm: 'none' }, width: '100%', maxWidth: 'none', height: 50, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], flex: '1 1 20%', maxWidth: 'none', pt: '4px', pb: '2px', px: '2px', justifyContent: 'flex-start' }, '& .MuiBottomNavigationAction-label': { ...style['& .MuiBottomNavigationAction-label'], mt: '1px' }, '& .MuiSvgIcon-root': { fontSize: 20 } }}>{coverItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation><MuiBottomNavigation showLabels value={value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, display: { xs: 'none', sm: 'flex' }, width: '100%', maxWidth: 'none', height: 50, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], flex: '1 1 11.111%', maxWidth: 'none', pt: '4px', pb: '2px' }, '& .MuiBottomNavigationAction-label': { ...style['& .MuiBottomNavigationAction-label'], mt: '1px' }, '& .MuiSvgIcon-root': { fontSize: 19 } }}>{tabletItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation></>;
}
