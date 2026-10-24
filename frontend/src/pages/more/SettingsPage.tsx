import {NotificationSettings} from '../../notifications/NotificationSettings';
import {useAuth} from '../../auth/AuthGate';
import {Navigate} from 'react-router-dom';
import {DelayedSkeleton as Skeleton} from '../../components/common/DelayedSkeleton';
import '../dashboard/home-font.css';
import { Box, useMediaQuery } from '@mui/material';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { PageHeader } from '../../components/navigation/Navigation';
import type {MoreView} from './MoreScreens';
import {SettingsMenu} from './SettingsMenu';
const AccountForm=lazy(()=>import('./MoreScreens').then(m=>({default:m.AccountForm})));
import {AccountManagement} from './AccountManagement';
const CashAdjustment=lazy(()=>import('./MoreScreens').then(m=>({default:m.CashAdjustment})));
const ThemeSettings=lazy(()=>import('./MoreScreens').then(m=>({default:m.ThemeSettings})));
const AccountResetFlow=lazy(()=>import('./AccountResetFlow').then(m=>({default:m.AccountResetFlow})));
const TargetArrivalSettings=lazy(()=>import('./TargetArrivalSettings').then(m=>({default:m.TargetArrivalSettings})));

const labels: Record<MoreView, string> = { notifications:'알림 설정', backup:'DB 백업', 'target-arrival': '목표가 도래 조건', settings: '설정', account: '계좌 관리', add: '계좌 추가', edit: '계좌 정보 수정', cash: '예수금 수정', collection: '시세 수집', theme: '테마 설정', reset: '계좌 데이터 초기화' };
export function SettingsPage() {
  const navigate = useNavigate(),{user}=useAuth();
  const [params] = useSearchParams();
  const tablet = useMediaQuery('(min-width:600px)');
  const requested = params.get('view') ?? 'settings';
  const view = requested in labels ? requested as MoreView : 'settings';
  const detailView = tablet && view === 'settings' ? 'account' : view;
  const menuRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [detailView]);
  const backPath = ['backup','collection'].includes(view)?'/detail/admin':view === 'settings' ? '/more' : view==='reset'?'/detail/settings?view=edit&accountId='+params.get('accountId'):['add', 'edit', 'cash'].includes(view) ? '/detail/settings?view=account' : '/detail/settings?view=settings';
  if(['backup','collection'].includes(view))return <Navigate to={user?.role==='ADMIN'?'/detail/admin/'+view:'/more'} replace/>;
  return <>
    <PageHeader embedded showBack={view !== 'settings'} title={tablet && view!=='notifications' ? '설정' : labels[view]} backPath={tablet && view!=='notifications' ? '/more' : backPath} backIcon={<img src="/stocks-v03/back.svg" alt="" />} showBackTablet showAdd={false} variant="more" compact />
    <Box className="rox-home" data-testid="settings-layout" sx={{ display: view==='notifications'?'block':{ xs: 'block', sm: 'grid' }, gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px', height: { sm: '100%' }, minHeight: 0 }}>
      <Box ref={menuRef} data-scroll-region="settings-menu" data-testid="settings-menu" sx={{ display: view==='notifications'?'none':{ xs: view === 'settings' ? 'block' : 'none', sm: 'block' }, minWidth: 0, minHeight: 0, overflowY: { sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: '80px' }}><SettingsMenu active={tablet ? detailView : undefined} /></Box>
      {detailView !== 'settings' && <Box ref={detailRef} data-scroll-region="settings-detail" data-testid="settings-detail" sx={{ minWidth: 0, minHeight: 0, height: { sm: '100%' }, overflowY: { sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, p: 0, '& .MuiButton-root': { borderRadius: '8px' }, '& .settings-condition-delete': { borderRadius: '2px' } }}>
        <Box sx={{ px: 0, pt: ['target-arrival','account','notifications'].includes(detailView) ? 0 : '14px', pb: '80px' }}>
          <Suspense fallback={<Skeleton aria-label="설정 상세 코드 불러오는 중" height={100}/>} >
          {detailView === 'notifications' && <NotificationSettings/>}
          {detailView === 'target-arrival' && <TargetArrivalSettings />}
          {detailView === 'account' && <AccountManagement openReset={() => navigate('/detail/settings?view=reset')} />}
          {detailView === 'add' && <AccountForm key={'add'} add />}
          {detailView === 'edit' && <AccountForm key={'edit'} add={false} />}
          {detailView === 'cash' && <CashAdjustment />}
          {detailView === 'theme' && <ThemeSettings />}
          {detailView === 'reset' && <AccountResetFlow key={detailView} />}
          </Suspense>
        </Box>
      </Box>}
      {tablet && <><OverlayRegionScrollbar scrollRef={menuRef} label="설정 메뉴 스크롤" offset={0} /><OverlayRegionScrollbar scrollRef={detailRef} label="설정 상세 스크롤" offset={0} /></>}
    </Box>
  </>;
}
