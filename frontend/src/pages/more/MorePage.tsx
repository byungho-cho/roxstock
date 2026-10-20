import '../dashboard/home-font.css';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {getAppMenuItems,menuIconSource} from '../../components/navigation/menuItems';
import {useAuth} from '../../auth/AuthGate';
import {liveApiEnabled} from '../../data/liveData';
import { SettingsOverview } from './SettingsOverview';

export function MorePage() {
  const navigate = useNavigate(),{user}=useAuth();
  const menuItems=getAppMenuItems(!liveApiEnabled||user?.role==='ADMIN');
  return <Box className="rox-home" data-testid="more-layout" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: '8px', height: '100%', minHeight: 0 }}>
    <Box component="nav" aria-label="더보기 메뉴" data-testid="more-menu" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(5, minmax(72px, 1fr))', overflowY:'auto', scrollbarWidth:'none', gap: '8px', minWidth: 0, minHeight: 0 }}>
      {menuItems.map(item => <ButtonBase data-testid="more-shortcut" data-screen-number={item.screen} key={item.label} onClick={() => navigate(item.path==='/detail/settings'?item.path+'?view=settings':item.path)} aria-label={item.label} sx={{ minWidth: 0, minHeight: 0, p: '8px', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', border: '1px solid #21304A', borderRadius: '8px', bgcolor: '#090F1C', color: '#F0F5FF' }}>
        <Box sx={{ width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '10px' }}>{item.icon==='stock-news'?<Box component="span" role="img" aria-label={item.label+' 아이콘'} sx={{width:18,height:18,bgcolor:'currentColor',mask:`url(${menuIconSource(item.icon)}) center / contain no-repeat`,WebkitMask:`url(${menuIconSource(item.icon)}) center / contain no-repeat`}} />:<Box component="img" src={menuIconSource(item.icon)} alt="" />}</Box>
        <Typography sx={{ flexShrink: 0, fontSize: 12, lineHeight: '15px', fontWeight: 400, whiteSpace: 'nowrap' }}>{item.label}</Typography>
      </ButtonBase>)}
    </Box>
    <Box data-testid="more-settings-area" sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0, minHeight: 0 }}><SettingsOverview compact /></Box>
  </Box>;
}

