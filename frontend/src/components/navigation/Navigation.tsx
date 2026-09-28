import { AccountBalanceWalletRounded, AddRounded, ArrowBackRounded, AnalyticsRounded, AssessmentRounded, CalendarMonthRounded, HomeRounded, MenuRounded, MoreHorizRounded, PriceCheckRounded } from '@mui/icons-material';
import { AppBar, BottomNavigation as MuiBottomNavigation, BottomNavigationAction, Box, IconButton, Toolbar, Tooltip, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@mui/material';
import { colors, pageGutter, pageMetrics } from '../../styles/tokens';
import { navigateToForm } from '../../utils/focusForm';

const coverItems = [
  { label: '종목목록', path: '/stocks', icon: <MenuRounded /> }, { label: '매매일지', path: '/journal', icon: <CalendarMonthRounded /> },
  { label: '홈', path: '/', icon: <HomeRounded /> }, { label: '자산분석', path: '/assets', icon: <AnalyticsRounded /> }, { label: '더보기', path: '/more', icon: <MoreHorizRounded /> },
];
const tabletItems = [coverItems[0], coverItems[1], { label: '평가자산', path: '/detail/assets', icon: <AssessmentRounded /> }, { label: '예수금', path: '/detail/cash', icon: <AccountBalanceWalletRounded /> }, coverItems[2], coverItems[3], { label: '재무제표', path: '/financials', icon: <PriceCheckRounded /> }, { label: '시세수집', path: '/collection', icon: <PriceCheckRounded /> }, coverItems[4]];

type PageHeaderProps = {
  title: string;
  variant?: 'home' | 'detail' | 'standard' | 'more';
  subtitle?: string;
  showAdd?: boolean;
  compact?: boolean;
  addPath?: string;
  addLabel?: string;
  onAdd?: () => void;
  backPath?: string;
  showBackTablet?: boolean;
  onBack?: () => void;
  showAddMobile?: boolean;
  action?: ReactNode;
  center?: ReactNode;
  embedded?: boolean;
  scope?: 'cover' | 'tablet';
  maxWidth?: number;
};

export const HeaderSlotContext = createContext<HTMLElement | null>(null);

// A page can supply its actions, while the header always renders in AppLayout's fixed slot.
export function PageHeader({ title, variant = 'standard', showAdd = true, compact = false, addPath = '/trade', addLabel = '거래등록', onAdd, backPath, onBack, showBackTablet = false, showAddMobile, action, center, embedded = false, scope, maxWidth = 816 }: PageHeaderProps) {
  const navigate = useNavigate();
  const slot = useContext(HeaderSlotContext);
  const tablet = useMediaQuery('(min-width:600px)');
  const hasBack = Boolean(backPath || onBack);
  const mobileAddVisible = showAddMobile ?? variant !== 'detail';
  if ((scope === 'cover' && tablet) || (scope === 'tablet' && !tablet)) return null;
  const header = <AppBar position="static" elevation={0} color="transparent" sx={{ height: pageMetrics.headerHeight, bgcolor: colors.canvas, border: 0 }}>
    <Toolbar sx={{ position: 'relative', width: '100%', maxWidth: { xs: 'none', sm: maxWidth }, mx: 'auto', minHeight: `${pageMetrics.headerHeight}px !important`, height: pageMetrics.headerHeight, px: { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` }, py: 0, alignItems: 'center' }}>
      {hasBack && <IconButton aria-label="뒤로가기" onClick={onBack ?? (() => navigate(backPath!))} sx={{ display: { xs: 'flex', sm: showBackTablet ? 'flex' : 'none' }, width: variant === 'more' ? 28 : pageMetrics.headerHeight, height: pageMetrics.headerHeight, p: variant === 'more' ? 0 : undefined, color: colors.textPrimary }}><ArrowBackRounded sx={{ fontSize: variant === 'more' ? 18 : 24 }} /></IconButton>}
      <Box sx={{ flex: 1, minWidth: 0, textAlign: variant === 'more' ? 'left' : variant === 'detail' || compact || hasBack ? { xs: 'center', sm: 'left' } : 'left' }}>
        <Typography component="h1" noWrap sx={{ fontSize: { xs: variant === 'more' ? 18 : 22, sm: 21 }, lineHeight: variant === 'more' ? { xs: '22px', sm: '30px' } : '30px', fontWeight: 700, letterSpacing: '-0.11px' }}>{title}</Typography>
      </Box>
      {center && <Box sx={{ display: { xs: 'none', sm: 'flex' }, position: 'absolute', left: '50%', transform: 'translateX(-50%)', alignItems: 'center', justifyContent: 'center', maxWidth: 'calc(100% - 240px)' }}>{center}</Box>}
      {action ?? (showAdd && <Tooltip title={addLabel}><IconButton aria-label={addLabel} onClick={onAdd ?? (() => navigateToForm(navigate, addPath))} sx={{ display: { xs: mobileAddVisible ? 'flex' : 'none', sm: 'flex' }, width: pageMetrics.headerHeight, height: pageMetrics.headerHeight, bgcolor: colors.raised, color: colors.textPrimary, '&:hover': { bgcolor: colors.borderStrong } }}><AddRounded sx={{ fontSize: 22 }} /></IconButton></Tooltip>)}
      {hasBack && !mobileAddVisible && !action && <Box sx={{ display: { xs: 'block', sm: 'none' }, width: pageMetrics.headerHeight, flexShrink: 0 }} />}
    </Toolbar>
  </AppBar>;
  return embedded ? slot ? createPortal(header, slot) : null : header;
}

export function BottomNav() {
  const navigate = useNavigate(); const location = useLocation();
  const value = [...tabletItems].sort((a, b) => b.path.length - a.path.length).find((item) => item.path !== '/' && location.pathname.startsWith(item.path))?.path ?? '/';
  const isAssetOverview = location.pathname === '/detail/assets' || location.pathname === '/detail/cash';
  const style = { position: 'fixed', inset: 'auto 0 0', zIndex: 10, mx: 'auto', width: '100%', height: pageMetrics.headerHeight, borderTop: `1px solid ${colors.border}`, bgcolor: colors.surface, '& .MuiBottomNavigationAction-root': { minWidth: 0, height: '100%', color: colors.textMuted, px: '2px', py: '2px', justifyContent: 'center' }, '& .Mui-selected': { color: colors.navActive }, '& .MuiBottomNavigationAction-label': { fontSize: 10, lineHeight: '14px', mt: '1px', '&.Mui-selected': { fontSize: 10, fontWeight: 500 } }, '& .MuiSvgIcon-root': { fontSize: 17 } } as const;
  return <><MuiBottomNavigation showLabels value={isAssetOverview ? '/' : value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, display: { xs: 'flex', sm: 'none' }, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], flex: '1 1 20%' } }}>{coverItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation><MuiBottomNavigation showLabels value={value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, display: { xs: 'none', sm: 'flex' }, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], flex: '1 1 11.111%' } }}>{tabletItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation></>;
}
