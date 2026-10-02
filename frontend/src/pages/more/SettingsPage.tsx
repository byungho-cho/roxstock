import { TargetArrivalSettings } from './TargetArrivalSettings';
import '../dashboard/home-font.css';
import { Box, useMediaQuery } from '@mui/material';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { AccountResetFlow } from './AccountResetFlow';
import { AccountForm, AccountManagement, CashAdjustment, CollectionSettings, SettingsMenu, ThemeSettings, type MoreView } from './MoreScreens';

const labels: Record<MoreView, string> = { 'target-arrival': '목표가 도래 조건', settings: '설정', account: '계좌 관리', add: '계좌 추가', edit: '계좌 정보 수정', cash: '예수금 수정', collection: '시세 수집', theme: '테마 설정', reset: '계좌 데이터 초기화' };
export function SettingsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tablet = useMediaQuery('(min-width:600px)');
  const requested = params.get('view') ?? 'settings';
  const view = requested in labels ? requested as MoreView : 'settings';
  const detailView = tablet && view === 'settings' ? 'account' : view;
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [detailView]);
  const backPath = view === 'settings' ? '/more' : ['add', 'edit', 'cash', 'reset'].includes(view) ? '/detail/settings?view=account' : '/detail/settings?view=settings';
  return <>
    <PageHeader embedded title={tablet ? '설정' : labels[view]} backPath={tablet ? '/more' : backPath} showBackTablet showAdd={false} variant="more" compact />
    <Box className="rox-home" data-testid="settings-layout" sx={{ display: { xs: 'block', sm: 'grid' }, gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '16px', height: { sm: '100%' }, minHeight: 0 }}>
      <Box data-testid="settings-menu" sx={{ display: { xs: view === 'settings' ? 'block' : 'none', sm: 'block' }, minWidth: 0 }}><SettingsMenu active={tablet ? detailView : undefined} /></Box>
      {detailView !== 'settings' && <Box ref={detailRef} data-testid="settings-detail" sx={{ minWidth: 0, minHeight: 0, height: { sm: '100%' }, overflowY: { sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, p: 0 }}>
        <Box sx={{ px: { xs: '16px', sm: 0 }, pt: { xs: '14px', sm: 0 }, pb: '80px' }}>
          {detailView === 'target-arrival' && <TargetArrivalSettings />}
          {detailView === 'account' && <AccountManagement openReset={() => navigate('/detail/settings?view=reset')} />}
          {detailView === 'add' && <AccountForm add />}
          {detailView === 'edit' && <AccountForm add={false} />}
          {detailView === 'cash' && <CashAdjustment />}
          {detailView === 'collection' && <CollectionSettings />}
          {detailView === 'theme' && <ThemeSettings />}
          {detailView === 'reset' && <AccountResetFlow />}
        </Box>
      </Box>}
    </Box>
  </>;
}
