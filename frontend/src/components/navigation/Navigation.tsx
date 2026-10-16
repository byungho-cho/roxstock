import { ArrowBackRounded } from '@mui/icons-material';
import { AppBar, BottomNavigationAction, Box, IconButton, Toolbar, Typography } from '@mui/material';
import {appMenuItems,menuIconSource} from './menuItems';
import { HeaderAddButton } from './HeaderAddButton';
import { useLocation, useNavigate } from 'react-router-dom';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@mui/material';
import { colors, pageMetrics } from '../../styles/tokens';
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
  showBack?: boolean;
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
export function PageHeader({ valueAnalysis = false, backIcon, stockNavigation, title, variant = 'standard', showAdd = true, compact = false, addPath = '/trade', addLabel = '거래등록', onAdd, backPath, onBack, showBack, showBackTablet = false, showAddMobile, action, center, embedded = false, scope, maxWidth = 816, homeDashboard = false, assetOverview = false }: PageHeaderProps) {
  const navigate = useNavigate();
  const slot = useContext(HeaderSlotContext);
  const tablet = useMediaQuery('(min-width:600px)');
  const { pathname } = useLocation();
  const isMenuPage = pathname === '/more' || appMenuItems.some(item => item.path === pathname);
  const hasBack = Boolean(backPath || onBack) && (showBack ?? !isMenuPage);
  const mobileAddVisible = showAddMobile ?? variant !== 'detail';
  if ((scope === 'cover' && tablet) || (scope === 'tablet' && !tablet)) return null;
  const header = <AppBar position="static" elevation={0} color="transparent" sx={{ height: pageMetrics.headerHeight, bgcolor: colors.canvas, border: 0 }}>
    <Toolbar disableGutters className={variant === 'home' || assetOverview ? 'rox-home' : undefined} sx={{ position: 'relative', width: '100%', boxSizing:'border-box', maxWidth: { xs: 'none', sm: maxWidth }, mx: 'auto', minHeight: `${pageMetrics.headerHeight}px !important`, height: pageMetrics.headerHeight, px:'8px', py:0, alignItems:stockNavigation?'flex-start':'center' }}>
      {hasBack && <IconButton aria-label="뒤로가기" onClick={onBack ?? (() => navigate(backPath!))} sx={{ display:{xs:'flex',sm:showBackTablet?'flex':'none'}, zIndex:1, width:20, minWidth:20, height:stockNavigation?22:pageMetrics.headerHeight, mr:'8px', p:0, flexShrink:0, color:colors.textPrimary, '& svg, & img':{width:20,height:20,objectFit:'contain'}, '& > span':{fontSize:24,lineHeight:'24px'} }}>{backIcon ?? <ArrowBackRounded />}</IconButton>}
      <Box sx={{flex:1,minWidth:0,textAlign:stockNavigation?'center':'left'}}>
        <Typography component="h1" noWrap sx={{m:0,fontSize:stockNavigation?14:hasBack?18:22,lineHeight:stockNavigation?'22px':'30px',height:stockNavigation?22:30,fontWeight:700,letterSpacing:'-0.11px',textAlign:stockNavigation?'center':'left'}}>{title}</Typography>
      </Box>
      {stockNavigation && <Box sx={{ position: 'absolute', ...(valueAnalysis ? {height:14,lineHeight:'14px','& .MuiButton-root':{minHeight:14,height:14,lineHeight:'14px'}} : {}), bottom: 2, left: valueAnalysis ? 8 : 48, right: valueAnalysis ? 8 : 48 }}>{stockNavigation}</Box>}
      {center && <Box sx={{ display: { xs: 'none', sm: 'flex' }, position: 'absolute', left: '50%', transform: 'translateX(-50%)', alignItems: 'center', justifyContent: 'center', maxWidth: 'calc(100% - 240px)' }}>{center}</Box>}
      {action ?? (showAdd && <HeaderAddButton label={addLabel} onClick={onAdd ?? (() => navigateToForm(navigate, addPath))} mobileVisible={mobileAddVisible} />)}
      {hasBack && stockNavigation && !action && <Box sx={{ display:'block', width:28, flexShrink: 0 }} />}
    </Toolbar>
  </AppBar>;
  return embedded ? slot ? createPortal(header, slot) : null : header;
}

const menuItems=appMenuItems.filter(item=>item.path!=='/');
export function BottomNav() {
  const navigate = useNavigate(), location = useLocation();
  const path = location.pathname;
  const scroll = useRef<HTMLDivElement>(null);
  const active = path.startsWith('/detail/collection-monitoring') || path === '/detail/security-management' ? '/detail/settings' : path === '/trade' ? (location.state?.backgroundLocation?.pathname?.startsWith('/journal') || new URLSearchParams(location.search).get('return') === 'journal' ? '/journal' : '/stocks')
    : /\/stocks\/[^/]+\/value$/.test(path) ? '/detail/value'
    : /\/stocks\/[^/]+\/financials$/.test(path) ? '/detail/financials'
    : [...menuItems].sort((a,b)=>b.path.length-a.path.length).find(item=>path.startsWith(item.path))?.path
    ?? (path === '/more' ? '/more' : '/');
  useEffect(() => { scroll.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'}); }, [active]);
  const item = (label:string, destination:string, asset:string, fixed=false) => <BottomNavigationAction key={destination} className={active===destination?'Mui-selected':undefined} value={destination} label={label} aria-label={label} aria-current={active===destination?'page':undefined} onClick={()=>navigate(destination)} icon={<Box component="span" sx={{width:18,height:18,bgcolor:'currentColor',maskImage:`url(${asset})`,maskSize:asset.includes('investor-trends')?'16px 16px':'contain',maskRepeat:'no-repeat',maskPosition:'center'}}><Box component="img" src={asset} alt="" sx={{width:asset.includes('investor-trends')?16:18,height:asset.includes('investor-trends')?16:18,opacity:0}} /></Box>} sx={{minWidth:0,maxWidth:'none',width:fixed?44:{xs:'calc((100vw - 90px) / 5.5)',sm:52},flex:'0 0 auto',height:44,p:0,pt:'8px',gap:'2px',justifyContent:'flex-start',color:active===destination?colors.navActive:colors.textMuted,'&.Mui-selected':{color:colors.navActive},'& .MuiBottomNavigationAction-label':{fontSize:'9px !important',lineHeight:'11px',whiteSpace:'nowrap',opacity:1,transform:'none'}}} showLabel />;
  const divider = <Box sx={{width:'1px',height:28,my:'8px',bgcolor:'#334155',flexShrink:0}}/>;
  return <Box component="nav" className="MuiBottomNavigation-root" aria-label="하단 메뉴" sx={{position:'fixed',inset:'auto 0 0',height:44,zIndex:10,display:'flex',bgcolor:'#0B1220',borderTop:`1px solid ${colors.border}`}}>
    {item('홈','/',menuIconSource('home'),true)}{divider}
    <Box ref={scroll} data-testid="bottom-menu-scroll" sx={{display:'flex',minWidth:0,flex:1,overflowX:'auto',overflowY:'hidden',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'}}}>{menuItems.map(entry=>item(entry.label,entry.path,menuIconSource(entry.icon)))}</Box>
    {divider}{item('더보기','/more','/navigation-v16/more.svg',true)}
  </Box>;
}