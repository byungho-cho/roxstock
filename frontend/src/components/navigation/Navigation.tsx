import { ArrowBackRounded } from '@mui/icons-material';
import { AppBar, BottomNavigationAction, Box, IconButton, Toolbar, Typography } from '@mui/material';
import { HeaderAddButton } from './HeaderAddButton';
import { useLocation, useNavigate } from 'react-router-dom';
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@mui/material';
import { colors, pageGutter, pageMetrics } from '../../styles/tokens';
import { navigateToForm } from '../../utils/focusForm';

type PageHeaderProps = {
  valueAnalysis?: boolean;
  stockNavigation?: ReactNode;
  backIcon?: ReactNode;
  title: ReactNode;
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
      {stockNavigation && <Box sx={{ position: 'absolute', ...(valueAnalysis ? {height:14,lineHeight:'14px','& .MuiButton-root':{minHeight:14,height:14,lineHeight:'14px'}} : {}), bottom: 2, left: valueAnalysis ? 8 : 48, right: valueAnalysis ? 8 : 48 }}>{stockNavigation}</Box>}
      {center && <Box sx={{ display: { xs: 'none', sm: 'flex' }, position: 'absolute', left: '50%', transform: 'translateX(-50%)', alignItems: 'center', justifyContent: 'center', maxWidth: 'calc(100% - 240px)' }}>{center}</Box>}
      {action ?? (showAdd && <HeaderAddButton label={addLabel} onClick={onAdd ?? (() => navigateToForm(navigate, addPath))} mobileVisible={mobileAddVisible} />)}
      {hasBack && (compact || !mobileAddVisible) && !action && <Box sx={{ display: { xs: 'block', sm: valueAnalysis ? 'block' : 'none' }, width: valueAnalysis ? 20 : compact && variant === 'more' ? 28 : pageMetrics.headerHeight, flexShrink: 0 }} />}
    </Toolbar>
  </AppBar>;
  return embedded ? slot ? createPortal(header, slot) : null : header;
}

const menuItems = [
  { label: '종목목록', path: '/stocks', asset: 'stocks' },
  { label: '매매일지', path: '/journal', asset: 'journal' },
  { label: '예수금', path: '/detail/cash', asset: 'cash' },
  { label: '자산분석', path: '/assets', asset: 'analysis' },
  { label: '투자금', path: '/detail/investment', asset: 'financials' },
  { label: '투자손익', path: '/detail/investment-profit', asset: 'financials' },
  { label: '가치분석', path: '/detail/value', asset: 'financials' },
  { label: '재무제표', path: '/detail/financials', asset: 'financials' },
  { label: '복리계획', path: '/detail/compound', asset: 'financials' },
  { label: '모니터링', path: '/detail/collection-monitoring', asset: 'financials' },
  { label: '설정', path: '/detail/settings', asset: 'financials' },
];
export function BottomNav() {
  const navigate = useNavigate(), location = useLocation();
  const path = location.pathname;
  const active = path === '/trade' ? (location.state?.backgroundLocation?.pathname?.startsWith('/journal') || new URLSearchParams(location.search).get('return') === 'journal' ? '/journal' : '/stocks')
    : /\/stocks\/[^/]+\/value$/.test(path) ? '/detail/value'
    : /\/stocks\/[^/]+\/financials$/.test(path) ? '/detail/financials'
    : [...menuItems].sort((a,b)=>b.path.length-a.path.length).find(item=>path.startsWith(item.path))?.path
    ?? (path === '/more' ? '/more' : '/');
  const item = (label:string, destination:string, asset:string, fixed=false) => <BottomNavigationAction key={destination} className={active===destination?'Mui-selected':undefined} value={destination} label={label} aria-label={label} aria-current={active===destination?'page':undefined} onClick={()=>navigate(destination)} icon={<Box component="span" sx={{width:18,height:18,bgcolor:'currentColor',maskImage:`url(/navigation-v16/${asset}.svg)`,maskSize:'contain',maskRepeat:'no-repeat',maskPosition:'center'}}><Box component="img" src={`/navigation-v16/${asset}.svg`} alt="" sx={{width:18,height:18,opacity:0}} /></Box>} sx={{minWidth:0,maxWidth:'none',width:fixed?44:{xs:'calc((100vw - 90px) / 5.5)',sm:52},flex:'0 0 auto',height:44,p:0,pt:'8px',gap:'2px',justifyContent:'flex-start',color:active===destination?colors.navActive:colors.textMuted,'&.Mui-selected':{color:colors.navActive},'& .MuiBottomNavigationAction-label':{fontSize:'9px !important',lineHeight:'11px',whiteSpace:'nowrap',opacity:1,transform:'none'}}} showLabel />;
  const divider = <Box sx={{width:'1px',height:28,my:'8px',bgcolor:'#334155',flexShrink:0}}/>;
  return <Box component="nav" className="MuiBottomNavigation-root" aria-label="하단 메뉴" sx={{position:'fixed',inset:'auto 0 0',height:44,zIndex:10,display:'flex',bgcolor:'#0B1220',borderTop:`1px solid ${colors.border}`}}>
    {item('홈','/','home',true)}{divider}
    <Box data-testid="bottom-menu-scroll" sx={{display:'flex',minWidth:0,flex:1,overflowX:'auto',overflowY:'hidden',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'}}}>{menuItems.map(entry=>item(entry.label,entry.path,entry.asset))}</Box>
    {divider}{item('더보기','/more','more',true)}
  </Box>;
}