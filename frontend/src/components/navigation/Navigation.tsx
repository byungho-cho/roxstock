import { AccountBalanceWalletOutlined, ArrowBackRounded, AssessmentOutlined, CalendarMonthRounded, DonutSmallOutlined, HomeRounded, MenuRounded, MoreHorizRounded, PaidOutlined, SyncRounded } from '@mui/icons-material';
import { AppBar, BottomNavigation as MuiBottomNavigation, BottomNavigationAction, Box, IconButton, Toolbar, Typography } from '@mui/material';
import { HeaderAddButton } from './HeaderAddButton';
import { useLocation, useNavigate } from 'react-router-dom';
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@mui/material';
import { colors, pageGutter, pageMetrics } from '../../styles/tokens';
import { navigateToForm } from '../../utils/focusForm';

const coverItems = [
  { label: '종목목록', path: '/stocks', icon: <MenuRounded /> }, { label: '매매일지', path: '/journal', icon: <CalendarMonthRounded /> },
  { label: '홈', path: '/', icon: <HomeRounded /> }, { label: '자산분석', path: '/assets', icon: <DonutSmallOutlined /> }, { label: '더보기', path: '/more', icon: <MoreHorizRounded /> },
];
const tabletItems = [coverItems[0], coverItems[1], { label: '평가자산', path: '/detail/assets', icon: <PaidOutlined /> }, { label: '예수금', path: '/detail/cash', icon: <AccountBalanceWalletOutlined /> }, coverItems[2], coverItems[3], { label: '재무제표', path: '/detail/financials', icon: <AssessmentOutlined /> }, { label: '수집현황', path: '/detail/collection-monitoring', icon: <SyncRounded /> }, coverItems[4]];

type PageHeaderProps = {
  valueAnalysis?: boolean;
  stockNavigation?: ReactNode;
  backIcon?: ReactNode;
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
  homeDashboard?: boolean;
  assetOverview?: boolean;
};

export const HeaderSlotContext = createContext<HTMLElement | null>(null);

// A page can supply its actions, while the header always renders in AppLayout's fixed slot.
export function PageHeader({ valueAnalysis = false, backIcon, stockNavigation, title, variant = 'standard', showAdd = true, compact = false, addPath = '/trade', addLabel = '거래등록', onAdd, backPath, onBack, showBackTablet = false, showAddMobile, action, center, embedded = false, scope, maxWidth = 816, homeDashboard = false, assetOverview = false }: PageHeaderProps) {
  const navigate = useNavigate();
  const slot = useContext(HeaderSlotContext);
  const tablet = useMediaQuery('(min-width:600px)');
  const hasBack = Boolean(backPath || onBack);
  const mobileAddVisible = showAddMobile ?? variant !== 'detail';
  if ((scope === 'cover' && tablet) || (scope === 'tablet' && !tablet)) return null;
  const header = <AppBar position="static" elevation={0} color="transparent" sx={{ height: pageMetrics.headerHeight, bgcolor: colors.canvas, border: 0 }}>
    <Toolbar disableGutters={homeDashboard || assetOverview} className={variant === 'home' || assetOverview ? 'rox-home' : undefined} sx={{ position: 'relative', width: '100%', maxWidth: { xs: 'none', sm: maxWidth }, mx: 'auto', minHeight: `${pageMetrics.headerHeight}px !important`, height: pageMetrics.headerHeight, px: homeDashboard || assetOverview || variant === 'more' ? '8px' : { xs: `${pageGutter.xs}px`, sm: variant === 'home' ? '16px' : `${pageGutter.sm}px` }, py: 0, alignItems: valueAnalysis && stockNavigation ? 'flex-start' : homeDashboard ? 'center' : variant === 'home' ? 'flex-start' : 'center' }}>
      {hasBack && <IconButton aria-label="뒤로가기" onClick={onBack ?? (() => navigate(backPath!))} sx={{ display: { xs: 'flex', sm: showBackTablet ? 'flex' : 'none' }, zIndex: valueAnalysis ? 1 : undefined, width: valueAnalysis ? 20 : variant === 'more' ? 28 : pageMetrics.headerHeight, height: valueAnalysis && stockNavigation ? 22 : pageMetrics.headerHeight, alignSelf: valueAnalysis && stockNavigation ? 'flex-start' : undefined, p: valueAnalysis || variant === 'more' ? 0 : undefined, color: colors.textPrimary }}><>{backIcon ?? <ArrowBackRounded sx={{ fontSize: variant === 'more' ? 18 : 24 }} />}</></IconButton>}
      <Box sx={{ flex: 1, minWidth: 0, textAlign: stockNavigation ? 'center' : assetOverview || variant === 'more' ? 'left' : variant === 'detail' || compact || hasBack ? { xs: 'center', sm: 'left' } : 'left' }}>
        <Typography component="h1" noWrap sx={{ ...(valueAnalysis && stockNavigation ? { mt:0,mb:0,textAlign:'center',lineHeight:'22px !important',fontSize:'14px !important',height:22 } : valueAnalysis ? { fontSize:'22px !important',textAlign:'left' } : {}), mb: valueAnalysis ? 0 : stockNavigation ? '12px' : 0, fontSize: valueAnalysis && stockNavigation ? '14px !important' : { xs: variant === 'more' ? compact ? 16 : 18 : 22, sm: variant === 'home' || assetOverview ? 22 : 21 }, lineHeight: valueAnalysis && stockNavigation ? '22px' : variant === 'more' ? { xs: '22px', sm: '30px' } : '30px', fontWeight: 700, letterSpacing: '-0.11px' }}>{title}</Typography>
      </Box>
      {stockNavigation && <Box sx={{ position: 'absolute', bottom: 2, left: valueAnalysis ? 8 : 48, right: valueAnalysis ? 8 : 48 }}>{stockNavigation}</Box>}
      {center && <Box sx={{ display: { xs: 'none', sm: 'flex' }, position: 'absolute', left: '50%', transform: 'translateX(-50%)', alignItems: 'center', justifyContent: 'center', maxWidth: 'calc(100% - 240px)' }}>{center}</Box>}
      {action ?? (showAdd && <HeaderAddButton label={addLabel} onClick={onAdd ?? (() => navigateToForm(navigate, addPath))} mobileVisible={mobileAddVisible} />)}
      {hasBack && (compact || !mobileAddVisible) && !action && <Box sx={{ display: { xs: 'block', sm: valueAnalysis ? 'block' : 'none' }, width: valueAnalysis ? 20 : compact && variant === 'more' ? 28 : pageMetrics.headerHeight, flexShrink: 0 }} />}
    </Toolbar>
  </AppBar>;
  return embedded ? slot ? createPortal(header, slot) : null : header;
}

export function BottomNav() {
  const navigate = useNavigate(); const location = useLocation();
  const value = location.pathname === '/trade' ? (location.state?.backgroundLocation?.pathname.startsWith('/journal') || new URLSearchParams(location.search).get('return') === 'journal' ? '/journal' : '/stocks') : [...tabletItems].sort((a, b) => b.path.length - a.path.length).find((item) => item.path !== '/' && location.pathname.startsWith(item.path))?.path ?? '/';
  const isValue = location.pathname === '/detail/value' || /^\/stocks\/[^/]+\/value$/.test(location.pathname);
  const isInvestment = location.pathname === '/detail/investment' || location.pathname === '/detail/investment-profit';
  const isAnalysis = location.pathname === '/assets' || isInvestment || isValue;
  const isSettings = location.pathname === '/detail/settings';
  const isStocks = location.pathname.startsWith('/stocks');
  const isCash = location.pathname === '/detail/cash';
  const isCompound = location.pathname === '/detail/compound';
  const isUtilityV04 = location.pathname === '/more' || isSettings || location.pathname.startsWith('/detail/collection-monitoring');
  const isFinancial = location.pathname === '/detail/financials' || /^\/stocks\/[^/]+\/financials$/.test(location.pathname);
  const isV04 = isFinancial || isUtilityV04 || isCompound || isValue || isInvestment || isCash || location.pathname === '/assets' || location.pathname === '/' || location.pathname === '/stocks/add' || location.pathname === '/journal';
  const isTabletV04 = isV04 || isStocks || location.pathname === '/detail/assets';
  const isMore = location.pathname === '/more' || location.pathname === '/detail/settings';
  const iconFor = (item: typeof coverItems[number], tabletMore = false) => {
    if (tabletMore) {
      const names = ['stocks', 'journal', 'assets', 'cash', 'home', 'analysis', 'financials', 'collection', 'more'];
      const src = isTabletV04 ? `/tablet-v04/${names[tabletItems.findIndex(entry => entry.path === item.path)]}.svg` : `/figma-100/tablet-${names[tabletItems.findIndex(entry => entry.path === item.path)]}.svg`;
      return <Box component="span" sx={{ display: 'inline-flex', width: 16, height: 16, bgcolor: 'currentColor', maskImage: `url(${src})`, maskRepeat: 'no-repeat', maskPosition: 'center' }}><Box component="img" src={src} alt="" sx={{ opacity: 0 }} /></Box>;
    }
    const index = coverItems.findIndex(entry => entry.path === item.path);
    if (index < 0) return item.icon;
    const src = `/${isV04 || isStocks ? 'home-v04' : 'home-v03'}/${['stocks', 'journal', 'home', 'assets', 'more'][index]}.svg`;
    return <Box component="span" sx={{ display: 'inline-flex', width: 18, height: 18, bgcolor: 'currentColor', maskImage: `url(${src})`, maskRepeat: 'no-repeat', maskPosition: 'center' }}><Box component="img" src={src} alt="" sx={{ opacity: 0 }} /></Box>;
  };
  const homeItems = coverItems.map(item => ({ ...item, icon: iconFor(item) }));
  const extendedItems = tabletItems.map(item => ({ ...item, label: isTabletV04 && item.path === '/detail/collection-monitoring' ? '시세수집' : item.label, icon: iconFor(item, isMore || isTabletV04) }));
  const isHome = location.pathname === '/' || location.pathname === '/detail/assets';
  const isAssetOverview = location.pathname === '/detail/cash';
  const moreStyle = isMore ? { bgcolor: { xs: colors.surface, sm: '#0B1220' }, '& .MuiBottomNavigationAction-root': { justifyContent: 'flex-start', py: 0, pt: { xs: '9px', sm: '2px' } }, '& .MuiBottomNavigationAction-label': { fontSize: { xs: 9, sm: 8 }, lineHeight: { xs: '11px', sm: '10px' }, mt: { xs: '3px', sm: '10px' }, '&.Mui-selected': { fontSize: { xs: 9, sm: 8 } } } } : {};
  const v04Style = isV04 || isStocks ? { '& .MuiBottomNavigationAction-root': { flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: '3px', sm: '8px' }, justifyContent: 'center', minWidth: 0, px: '2px', py: 0, color: colors.textMuted }, '& .MuiBottomNavigationAction-label': { fontSize: { xs: isUtilityV04 || isAnalysis || isCash || isCompound ? 10 : 9, sm: 13 }, lineHeight: { xs: '11px', sm: '16px' }, mt: 0, '&.Mui-selected': { fontSize: { xs: isUtilityV04 || isAnalysis || isCash || isCompound ? 10 : 9, sm: 13 }, fontWeight: 500 } } } : {};
  const tabletV04Style = isTabletV04 ? { bgcolor: '#0B1220', '& .MuiBottomNavigationAction-root': { flexDirection: 'column', flex: '1 1 11.111%', justifyContent: 'flex-start', gap: '10px', pt: '2px', pb: 0 }, '& .MuiBottomNavigationAction-label': { fontSize: isUtilityV04 || isAnalysis || isCash || isCompound ? 10 : 8, lineHeight: '10px', mt: 0, whiteSpace: 'nowrap', '&.Mui-selected': { fontSize: isUtilityV04 || isAnalysis || isCash || isCompound ? 10 : 8, fontWeight: 600 } } } : {};
  const style = { fontFamily: isHome || isMore || isStocks ? 'RoxHomeInter, sans-serif' : undefined, position: 'fixed', inset: 'auto 0 0', zIndex: 10, mx: 'auto', width: '100%', height: pageMetrics.headerHeight, borderTop: `1px solid ${colors.border}`, bgcolor: colors.surface, '& .MuiBottomNavigationAction-root': { minWidth: 0, height: '100%', color: colors.textMuted, px: '2px', py: '2px', justifyContent: 'center' }, '& .MuiBottomNavigationAction-root.Mui-selected': { color: colors.navActive }, '& .MuiBottomNavigationAction-label': { fontSize: isHome ? 8 : 10, lineHeight: '14px', mt: '1px', '&.Mui-selected': { fontSize: isHome ? 8 : 10, fontWeight: 500 } }, '& .MuiSvgIcon-root': { fontSize: 17 } } as const;
  return <><MuiBottomNavigation showLabels value={isInvestment || isValue || isCompound ? '/assets' : isV04 && location.search.includes('from=home') ? '/' : isSettings || location.pathname.startsWith('/detail/collection-monitoring') ? '/more' : isAssetOverview || location.pathname === '/detail/assets' ? '/' : value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, ...moreStyle, ...v04Style, display: { xs: 'flex', sm: 'none' }, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], ...moreStyle['& .MuiBottomNavigationAction-root'], ...v04Style['& .MuiBottomNavigationAction-root'], flex: '1 1 20%' } }}>{homeItems.map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation><MuiBottomNavigation showLabels value={isInvestment || isValue || isCompound ? '/assets' : isV04 && location.search.includes('from=home') ? '/' : isSettings || location.pathname.startsWith('/detail/collection-monitoring') ? '/more' : value} onChange={(_, path: string) => navigate(path)} sx={{ ...style, ...moreStyle, ...v04Style, ...tabletV04Style, display: { xs: 'none', sm: 'flex' }, '& .MuiBottomNavigationAction-root': { ...style['& .MuiBottomNavigationAction-root'], ...moreStyle['& .MuiBottomNavigationAction-root'], ...v04Style['& .MuiBottomNavigationAction-root'], ...tabletV04Style['& .MuiBottomNavigationAction-root'], flex: isTabletV04 ? '1 1 11.111%' : isHome || isSettings || isStocks ? '1 1 20%' : '1 1 11.111%' } }}>{(isTabletV04 ? extendedItems : isHome || isSettings || isStocks ? homeItems : extendedItems).map((item) => <BottomNavigationAction key={item.path} value={item.path} label={item.label} icon={item.icon} />)}</MuiBottomNavigation></>;
}
