import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {Box,ButtonBase,Stack,Typography} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {useMoreAccounts} from '../../hooks/useMoreAccounts';
import {storedQueryOptions} from '../../data/storedQueryOptions';
import {liveApiEnabled} from '../../data/liveData';
import {getCollectionMonitorSummary} from '../../data/roxstockApi';
import {AndroidDownload} from './AndroidDownload';
import type {MoreView} from './MoreScreens';
const row={bgcolor:'#111825',border:'1px solid #25344D',borderRadius:'8px'} as const;
export function SettingsMenu({ active }: { active?: MoreView }) {
  const navigate = useNavigate();
  const { accounts, query } = useMoreAccounts();
  const status = useQuery({ ...storedQueryOptions, staleTime:60_000, queryKey: ['collection-monitoring-summary'], queryFn: getCollectionMonitorSummary, enabled: liveApiEnabled, refetchInterval: 60_000 });
  const selected = ['add','edit','cash','reset'].includes(active ?? '') ? 'account' : active;
  const items = [
    { view: 'account', title: '계좌 관리', caption: '계좌 정보와 현재 예수금을 관리합니다.', value: query.isError ? '—' : liveApiEnabled&&query.isPending ? '—' : `${accounts.length}개 계좌` },
    { view: 'target-arrival', title: '목표가 도래 조건', caption: '보유기간별 목표수익률 조건을 편집합니다.', value: '계좌별' },
    { view: 'monitoring', title: '수집 모니터링', caption: '수집 결과와 실행 이력을 확인합니다.', value: '' },
    { view: 'backup', title: 'DB 백업', caption: 'DB 백업 파일을 생성하고 관리합니다.', value: '관리자' },
    { view: 'collection', title: '시세 수집', caption: '수집 주기와 최근 수집 상태를 확인합니다.', value: status.isError ? '—' : ({ OK: '정상', SUCCESS: '완료', RUNNING: '진행 중', PARTIAL: '일부 실패', FAILED: '실패', DELAYED: '지연', WAITING: '대기', NOT_IMPLEMENTED: '미구현', NO_DATA: '미수집', NOT_CONFIGURED: '설정 필요', NO_FILING: '미공시' } as Record<string,string>)[status.data?.features?.find(item => item.id === 'realtime-prices')?.status ?? ''] ?? '상태 조회' },
    { view:'news-collection',title:'종목소식 수집 설정',caption:'수집 주기와 기준 시작 시각을 설정합니다.',value:'공통' },
    { view: 'theme', title: '테마 설정', caption: '앱 화면의 테마를 선택합니다.', value: '' },
    { view:'security-management',title:'종목 관리',caption:'종목 정보와 수집 대상 설정을 관리합니다.',value:'' },
  ];
  return <Stack component="nav" aria-label="설정 메뉴" spacing="12px"><QueryErrorNotice active={query.isError} message="계좌 조회에 실패했습니다." onRetry={()=>void query.refetch()} inlineRetry={false}/><QueryErrorNotice active={status.isError} message="수집 상태 조회에 실패했습니다." onRetry={()=>void status.refetch()} inlineRetry={false}/>{items.map(item => <ButtonBase key={item.view} aria-current={selected === item.view ? 'page' : undefined} onClick={() => navigate(item.view==='news-collection'?'/detail/news-collection-settings':item.view==='monitoring'?'/detail/collection-monitoring':item.view==='security-management'?'/detail/security-management':`/detail/settings?view=${item.view}`)} sx={{ ...row, bgcolor: '#090F1C', borderColor: selected === item.view ? '#3B82F6' : '#21304A', width: '100%', height: { xs: 72, sm: 72 }, px: '14px', gap: '10px', display: 'flex', textAlign: 'left' }}>
    <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 15, fontWeight: 400, color: '#F8FAFC' }}>{item.title}</Typography><Typography sx={{ fontSize: 11, fontWeight: 400, color: '#7385A1', mt: '5px' }}>{item.caption}</Typography></Box>
    {item.value && <Typography sx={{ flexShrink: 0, fontSize: 11, color: item.view === 'target-arrival' ? '#33D48C' : '#7385A1' }}>{item.value}</Typography>}<Typography sx={{ flexShrink: 0, fontSize: 22, color: '#7385A1' }}>›</Typography>
  </ButtonBase>)}<AndroidDownload /></Stack>;
}

