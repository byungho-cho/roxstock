import '../dashboard/home-font.css';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {appMenuItems,menuIconSource} from '../../components/navigation/menuItems';
import { SettingsOverview } from './MoreScreens';

export function MorePage() {
  const navigate = useNavigate();
  return <Box className="rox-home" data-testid="more-layout" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: '8px', height: '100%', minHeight: 0 }}>
    <Box component="nav" aria-label="더보기 메뉴" data-testid="more-menu" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(4, minmax(0, 1fr))', gap: '8px', minWidth: 0, minHeight: 0 }}>
      {appMenuItems.map(item => <ButtonBase data-testid="more-shortcut" data-screen-number={item.screen} key={item.label} onClick={() => navigate(item.path==='/detail/settings'?item.path+'?view=settings':item.path)} aria-label={item.label} sx={{ minWidth: 0, minHeight: 0, p: '8px', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', border: '1px solid #21304A', borderRadius: '8px', bgcolor: '#090F1C', color: '#F0F5FF' }}>
        <Box sx={{ width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '10px' }}><Box component="img" src={menuIconSource(item.icon)} alt="" /></Box>
        <Typography sx={{ flexShrink: 0, fontSize: 12, lineHeight: '15px', fontWeight: 400, whiteSpace: 'nowrap' }}>{item.label}</Typography>
      </ButtonBase>)}
    </Box>
    <Box data-testid="more-settings-area" sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0, minHeight: 0 }}><SettingsOverview compact /></Box>
  </Box>;
}

