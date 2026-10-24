import {SettingsLink} from './SettingsLink';
import {AuthSettingsActions} from '../../auth/AuthSettingsActions';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {Stack} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {useMoreAccounts} from '../../hooks/useMoreAccounts';
import {liveApiEnabled} from '../../data/liveData';
import {AndroidDownload} from './AndroidDownload';
import {useAuth} from '../../auth/AuthGate';
import type {MoreView} from './MoreScreens';
const row={bgcolor:'#111825',border:'1px solid #25344D',borderRadius:'8px'} as const;
export function SettingsMenu({ active }: { active?: MoreView }) {
  const navigate = useNavigate();
  const auth=useAuth();
  const { accounts, query } = useMoreAccounts();

  const selected = ['add','edit','cash','reset'].includes(active ?? '') ? 'account' : active;
  const items = [
    { view: 'account', title: '계좌 관리', caption: '계좌 정보와 현재 예수금을 관리합니다.', value: query.isError ? '—' : liveApiEnabled&&query.isPending ? '—' : `${accounts.length}개 계좌` },
    { view: 'target-arrival', title: '목표가 도래 조건', caption: '보유기간별 목표수익률 조건을 편집합니다.', value: '계좌별' },
    { view:'notifications',title:'알림 설정',caption:'앱 알림의 수신 여부를 각각 설정합니다.',value:'' },
    { view: 'theme', title: '테마 설정', caption: '앱 화면의 테마를 선택합니다.', value: '' },
  ].filter(item=>!liveApiEnabled||auth.user?.role==='ADMIN'||!['monitoring','backup','collection','news-collection','security-management'].includes(item.view));
  return <Stack component="nav" aria-label="설정 메뉴" spacing="12px"><QueryErrorNotice active={query.isError} message="계좌 조회에 실패했습니다." onRetry={()=>void query.refetch()} inlineRetry={false}/>{items.map(item=><SettingsLink key={item.view} title={item.title} caption={item.caption} value={item.value} active={selected===item.view} valueColor={item.view==='target-arrival'?'#33D48C':undefined} onClick={()=>navigate('/detail/settings?view='+item.view)}/>)} <AndroidDownload />{liveApiEnabled&&<AuthSettingsActions/>}</Stack>;
}

