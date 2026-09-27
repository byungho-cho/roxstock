import { AccountBalanceWalletOutlined, AssessmentOutlined, AutoGraphOutlined, CalendarMonthOutlined, ChevronRightRounded, DonutSmallOutlined, EditNoteOutlined, PaidOutlined, QueryStatsOutlined, SavingsOutlined, SettingsOutlined, SyncRounded, TrackChangesOutlined } from '@mui/icons-material';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../styles/tokens';

type Shortcut = { label: string; path: string; icon: ReactNode; description?: string };
const shortcuts: Shortcut[] = [
  { label: '평가자산', path: '/detail/assets', icon: <PaidOutlined /> },
  { label: '예수금', path: '/detail/cash', icon: <AccountBalanceWalletOutlined /> },
  { label: '일별손익', path: '/detail/daily-profit', icon: <CalendarMonthOutlined /> },
  { label: '자산분석', path: '/assets', icon: <DonutSmallOutlined /> },
  { label: '투자금', path: '/detail/investment', icon: <SavingsOutlined />, description: '일별 평가금액과 투자금 추이를 확인합니다.' },
  { label: '투자손익', path: '/detail/investment-profit', icon: <QueryStatsOutlined />, description: '연도·종목별 투자손익을 분석합니다.' },
  { label: '복리계획', path: '/detail/compound', icon: <TrackChangesOutlined /> },
  { label: '가치분석', path: '/detail/value', icon: <AutoGraphOutlined /> },
  { label: '재무제표', path: '/detail/financials', icon: <AssessmentOutlined /> },
  { label: '시세수집', path: '/detail/collection', icon: <SyncRounded /> },
  { label: '설정', path: '/detail/settings', icon: <SettingsOutlined />, description: '테마와 개인 환경을 관리합니다.' },
];

export function MorePage() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'dark' | 'system'>('dark');
  const tabletMenu = shortcuts.filter((item) => ['투자금', '투자손익', '설정'].includes(item.label));

  return <>
    <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
      <Typography sx={{ fontSize: 11, lineHeight: '14px', color: '#7385A1' }}>자주 사용하지 않는 기능을 한곳에서 확인합니다.</Typography>
      <Box sx={{ mt: '14px', p: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 10px' }}>
        {shortcuts.map((item) => <ButtonBase key={item.label} onClick={() => navigate(item.path)} aria-label={item.label} sx={{ height: 86, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', border: '1px solid #21304A', borderRadius: '12px', bgcolor: '#090F1C', color: colors.textPrimary, '& .MuiSvgIcon-root': { fontSize: 20 } }}><Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center' }}>{item.icon}</Box><Typography sx={{ fontSize: 12, lineHeight: '17px' }}>{item.label}</Typography></ButtonBase>)}
      </Box>
    </Box>

    <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
      <Box sx={panelStyle}>
        <Typography sx={{ fontSize: 18, fontWeight: 600 }}>메뉴</Typography>
        <Typography sx={{ mt: '4px', fontSize: 11, color: '#7A859E' }}>필요한 기능을 선택합니다.</Typography>
        <Stack spacing="12px" sx={{ mt: '20px' }}>
          {tabletMenu.map((item) => <ButtonBase key={item.label} onClick={() => item.label === '설정' ? document.getElementById('more-settings')?.focus() : navigate(item.path)} sx={{ height: 86, px: '13px', display: 'flex', gap: '12px', textAlign: 'left', border: `1px solid ${item.label === '설정' ? '#60A5FA' : '#212B40'}`, borderRadius: '12px', bgcolor: item.label === '설정' ? '#3B82F6' : '#121724', color: '#E8EDF7' }}>
            <Box sx={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: '#1E293B', '& .MuiSvgIcon-root': { fontSize: 19 } }}>{item.label === '설정' ? <EditNoteOutlined /> : item.icon}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 15, fontWeight: 600 }}>{item.label}</Typography><Typography noWrap sx={{ mt: '3px', fontSize: 10, color: item.label === '설정' ? '#D9E7FF' : '#7A859E' }}>{item.description}</Typography></Box>
            <ChevronRightRounded sx={{ fontSize: 20, color: '#94A3B8' }} />
          </ButtonBase>)}
        </Stack>
      </Box>
      <Box id="more-settings" tabIndex={-1} sx={panelStyle}>
        <Typography sx={{ fontSize: 18, fontWeight: 600 }}>설정</Typography>
        <Typography sx={{ mt: '4px', fontSize: 11, color: '#7A859E' }}>개인 사용에 필요한 핵심 설정만 제공합니다.</Typography>
        <Box sx={{ mt: '20px', p: '15px', height: 178, border: '1px solid #212B40', borderRadius: '12px', bgcolor: '#121724' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>테마</Typography>
          <Typography sx={{ mt: '6px', fontSize: 10, color: '#7A859E' }}>화면에 적용할 색상 모드를 선택합니다.</Typography>
          <Stack direction="row" spacing="20px" sx={{ mt: '26px' }}>
            {(['dark', 'system'] as const).map((value) => <ButtonBase key={value} aria-pressed={theme === value} onClick={() => setTheme(value)} sx={{ width: 146, height: 62, px: '14px', alignItems: 'center', justifyContent: 'flex-start', border: `1px solid ${theme === value ? '#60A5FA' : '#25344D'}`, borderRadius: '10px', bgcolor: theme === value ? '#3B82F6' : '#0E1420', color: theme === value ? colors.textPrimary : colors.textMuted, textAlign: 'left' }}><Box sx={{ mr: '12px', width: 10, height: 10, borderRadius: '50%', bgcolor: theme === value ? '#FFF' : 'transparent' }} /><Box><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{value === 'dark' ? '다크' : '시스템'}</Typography>{theme === value && <Typography sx={{ fontSize: 10 }}>선택됨</Typography>}</Box></ButtonBase>)}
          </Stack>
        </Box>
        <Typography sx={{ mt: '24px', fontSize: 11, color: '#7A859E' }}>기본은 다크 모드이며, 테마 외 설정은 필요 시 확장합니다.</Typography>
      </Box>
    </Box>
  </>;
}

const panelStyle = { height: 452, minWidth: 0, p: '16px 17px', border: '1px solid #1F2B42', borderRadius: '16px', bgcolor: '#0E1420' } as const;
