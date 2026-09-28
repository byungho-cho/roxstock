import { AccountBalanceWalletOutlined, AssessmentOutlined, AutoGraphOutlined, CalendarMonthOutlined, DonutSmallOutlined, PaidOutlined, QueryStatsOutlined, SavingsOutlined, SettingsOutlined, SyncRounded, TrackChangesOutlined } from '@mui/icons-material';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { SettingsOverview } from './MoreScreens';

const shortcuts = [
  { label: '평가자산', path: '/detail/assets', icon: <PaidOutlined /> },
  { label: '예수금', path: '/detail/cash', icon: <AccountBalanceWalletOutlined /> },
  { label: '일별손익', path: '/detail/daily-profit', icon: <CalendarMonthOutlined /> },
  { label: '자산분석', path: '/assets', icon: <DonutSmallOutlined /> },
  { label: '투자금', path: '/detail/investment', icon: <SavingsOutlined /> },
  { label: '투자손익', path: '/detail/investment-profit', icon: <QueryStatsOutlined /> },
  { label: '복리계획', path: '/detail/compound', icon: <TrackChangesOutlined /> },
  { label: '가치분석', path: '/detail/value', icon: <AutoGraphOutlined /> },
  { label: '재무제표', path: '/detail/financials', icon: <AssessmentOutlined /> },
  { label: '시세수집', path: '/detail/settings?view=collection', icon: <SyncRounded /> },
  { label: '설정', path: '/detail/settings?view=settings', icon: <SettingsOutlined /> },
];

export function MorePage() {
  const navigate = useNavigate();
  const menu = <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '10px', alignContent: 'start' }}>
    {shortcuts.map((item) => <ButtonBase key={item.label} onClick={() => navigate(item.path)} aria-label={item.label} sx={{ height: { xs: 86, sm: 83 }, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', border: '1px solid #25344D', borderRadius: '9px', bgcolor: '#111825', color: '#E8EDF7', '& .MuiSvgIcon-root': { fontSize: 20 } }}><Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }}>{item.icon}</Box><Typography sx={{ fontSize: 12 }}>{item.label}</Typography></ButtonBase>)}
  </Box>;
  return <>
    <Box sx={{ display: { xs: 'block', sm: 'none' }, mt: '16px' }}>{menu}</Box>
    <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '16px', height: 'calc(100dvh - 120px)', minHeight: 0 }}>
      <Box sx={{ bgcolor: '#0E1420', border: '1px solid #1F2B42', borderRadius: '8px', p: '16px', overflowY: 'auto' }}><Typography sx={{ mb: 1.5, fontSize: 18, fontWeight: 600 }}>메뉴</Typography>{menu}</Box>
      <SettingsOverview />
    </Box>
  </>;
}
