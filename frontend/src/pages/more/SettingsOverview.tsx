import {Box,ButtonBase,Stack,Typography} from '@mui/material';
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {readDemoSettings,saveDemoSettings} from '../../data/mockMoreSettings';
import {SettingsMenu} from './SettingsMenu';
import type {MoreView} from './MoreScreens';
const panel = { bgcolor: '#0E1420', border: '1px solid #1F2B42', borderRadius: '8px', p: '16px', minWidth: 0 } as const;
const row = { bgcolor: '#111825', border: '1px solid #25344D', borderRadius: '8px' } as const;
const hint = { fontSize: 11, color: '#7A859E' } as const;
const heading = { fontSize: 18, fontWeight: 600, lineHeight: '26px' } as const;


function LinkRow({ title, caption, value, onClick, active = false }: { title: string; caption?: string; value?: string; onClick: () => void; active?: boolean }) {
  return <ButtonBase onClick={onClick} sx={{ ...row, width: '100%', minHeight: caption ? 72 : 40, px: '13px', py: '10px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 1, ...(active ? { bgcolor: '#14386B', borderColor: '#3C85F2' } : {}) }}>
    <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 13, color: '#E8EDF7', fontWeight: active ? 600 : 400 }}>{title}</Typography>{caption && <Typography sx={{ ...hint, display: { xs: 'block', sm: 'none' }, mt: 0.5 }}>{caption}</Typography>}</Box>
    {value && <Typography sx={{ fontSize: 11, color: active ? '#E8EDF7' : '#7A859E', whiteSpace: 'nowrap' }}>{value}</Typography>}
    <Typography sx={{ color: '#7A859E', fontSize: 19, lineHeight: 1 }}>›</Typography>
  </ButtonBase>;
}

export function SettingsOverview({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(readDemoSettings().theme);
  const chooseTheme = (value: 'dark' | 'light' | 'system') => { setTheme(value); saveDemoSettings({ theme: value }); };
  const go = (view: MoreView) => navigate(`/detail/settings?view=${view}`);
  if (compact) return <Box data-testid="more-settings-panel" sx={{ ...panel, height: 300, p: '13px', boxSizing: 'border-box' }}>
    <Typography sx={{ ...heading, lineHeight: '28px', mb: '6px' }}>설정</Typography>
    <Stack spacing="16px">
      <LinkRow title="계좌 관리" onClick={() => go('account')} />
      <LinkRow title="시세 수집" value="상태 조회" onClick={() => go('collection')} />
      <LinkRow title="테마 설정" value={theme === 'dark' ? '다크' : theme === 'light' ? '라이트' : '시스템 설정'} onClick={() => go('theme')} active />
      <Box data-testid="theme-buttons" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '8px' }}>{(['dark', 'light', 'system'] as const).map(value => <ButtonBase key={value} aria-label={value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'} aria-pressed={theme === value} onClick={() => chooseTheme(value)} sx={{ ...row, flex: 1, minWidth: 0, height: 56, display: 'flex', flexDirection: 'column', gap: '4px', bgcolor: theme === value ? '#3C85F2' : '#0B111B', borderColor: '#1F2B42', color: '#E8EDF7' }}>
        <Typography sx={{ fontSize: 12, lineHeight: '19px', fontWeight: theme === value ? 600 : 400, whiteSpace: 'nowrap' }}>{value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'}</Typography>
        <Typography sx={{ fontSize: 10, lineHeight: '14px', height: 14 }}>{theme === value ? '선택됨' : ''}</Typography>
      </ButtonBase>)}</Box>
    </Stack>
  </Box>;
  return <SettingsMenu />;
}

