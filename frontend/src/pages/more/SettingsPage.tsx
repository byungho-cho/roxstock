import { Box } from '@mui/material';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { AccountResetFlow } from './AccountResetFlow';
import { AccountForm, AccountManagement, CashAdjustment, CollectionSettings, SettingsOverview, ThemeSettings, type MoreView } from './MoreScreens';

const labels: Record<MoreView, string> = { settings: '설정', account: '계좌 관리', add: '계좌 추가', edit: '계좌 정보 수정', cash: '예수금 수정', collection: '시세 수집', theme: '테마 설정', reset: '계좌 데이터 초기화' };
export function SettingsPage() {
  const [params] = useSearchParams();
  const requested = params.get('view') ?? 'settings';
  const view = requested in labels ? requested as MoreView : 'settings';
  const [tabletReset, setTabletReset] = useState(false);
  const backPath = view === 'settings' ? '/more' : ['add', 'edit', 'cash', 'reset'].includes(view) ? '/detail/settings?view=account' : '/detail/settings?view=settings';
  const openReset = () => {
    if (window.matchMedia('(min-width:600px)').matches) setTabletReset(true);
    else window.location.assign('/detail/settings?view=reset');
  };
  return <>
    <PageHeader embedded title={labels[view]} backPath={backPath} showAdd={false} variant="more" compact />
    <Box sx={{ mt: { xs: '14px', sm: 0 }, height: { sm: 'calc(100dvh - 120px)' }, minHeight: 0, pb: { xs: ['add', 'edit', 'cash', 'reset', 'collection'].includes(view) ? '75px' : 0, sm: 0 } }}>
      {view === 'settings' && <SettingsOverview />}
      {view === 'account' && <AccountManagement openReset={openReset} />}
      {view === 'add' && <AccountForm add />}
      {view === 'edit' && <AccountForm add={false} />}
      {view === 'cash' && <CashAdjustment />}
      {view === 'collection' && <CollectionSettings />}
      {view === 'theme' && <ThemeSettings />}
      {view === 'reset' && <AccountResetFlow />}
    </Box>
    {tabletReset && <AccountResetFlow tablet onClose={() => setTabletReset(false)} />}
  </>;
}
