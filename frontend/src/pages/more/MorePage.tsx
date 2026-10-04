import '../dashboard/home-font.css';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { SettingsOverview } from './MoreScreens';

const shortcuts = [
  { label: '홈', path: '/', icon: 'home' },
  { label: '종목목록', path: '/stocks', icon: 'stocks' },
  { label: '매매일지', path: '/journal', icon: 'journal' },
  { screen: '1300', label: '예수금', path: '/detail/cash', icon: 'cash' },
  { screen: '1400', label: '자산분석', path: '/assets', icon: 'assets' },
  { screen: '1500', label: '투자금', path: '/detail/investment', icon: 'cash' },
  { screen: '1600', label: '투자손익', path: '/detail/investment-profit', icon: 'investment-profit' },
  { label: '가치분석', path: '/detail/value', icon: 'value' },
  { label: '재무제표', path: '/detail/financials', icon: 'financials' },
  { label: '복리계획', path: '/detail/compound', icon: 'compound' },
  { label: '모니터링', path: '/detail/collection-monitoring', icon: 'monitoring' },
  { label: '설정', path: '/detail/settings?view=settings', icon: 'settings' },
];

export function MorePage() {
  const navigate = useNavigate();
  return <Box className="rox-home" data-testid="more-layout" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: '16px', height: '100%', minHeight: 0 }}>
    <Box component="nav" aria-label="더보기 메뉴" data-testid="more-menu" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(4, minmax(0, 1fr))', gap: '8px', minWidth: 0, minHeight: 0 }}>
      {shortcuts.map(item => <ButtonBase data-testid="more-shortcut" data-screen-number={item.screen} key={item.label} onClick={() => navigate(item.path)} aria-label={item.label} sx={{ minWidth: 0, minHeight: 0, p: '8px', display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', border: '1px solid #21304A', borderRadius: '12px', bgcolor: '#090F1C', color: '#F0F5FF' }}>
        <Box sx={{ width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '10px' }}><Box component="img" src={`/more-v03/${item.icon}.svg`} alt="" /></Box>
        <Typography sx={{ flexShrink: 0, fontSize: 12, lineHeight: '15px', fontWeight: 400, whiteSpace: 'nowrap' }}>{item.label}</Typography>
      </ButtonBase>)}
    </Box>
    <Box data-testid="more-settings-area" sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0, minHeight: 0 }}><SettingsOverview compact /></Box>
  </Box>;
}

