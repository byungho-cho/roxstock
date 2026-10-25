import {DartTaskList} from './DartTaskList';
import {CollectionBugReportSummary} from './CollectionBugReports';
import {summarizeMonitorStatuses} from './monitorStatusSummary';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {CollectionSettingToggle,featureLabels,type ManagedSecurity} from './CollectionSettingToggle';
import '../dashboard/home-font.css';
import {collectionTaskLabel} from './collectionTaskLabel';
import {colors} from '../../styles/tokens';
import {useListNavigation} from '../../hooks/navigation/usePageMemory';
import {apiRequest} from '../../data/apiClient';
import { FilterListRounded, RefreshRounded } from '@mui/icons-material';
import { Box, Button, ButtonBase, CircularProgress, Collapse, FormControl, MenuItem, Select, Stack, Typography, useMediaQuery } from '@mui/material';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { getCollectionMonitorDetail, getCollectionMonitorSummary, type CollectionMonitorSummary } from '../../data/roxstockApi';

import { DelayedSkeleton, useDelayedIndicator } from '../../components/common/DelayedSkeleton';

type ApiFeature = CollectionMonitorSummary['features'][number];
type Feature = Pick<ApiFeature, 'id' | 'status'> & Partial<Omit<ApiFeature, 'id' | 'status' | 'recent'>> & { recent: Partial<ApiFeature['recent']> };
type DataRecord = Record<string, any>;

const statusStyle: Record<string, { label: string; background: string; foreground: string }> = {
  OK: { label: '완료', background: '#3D8CF5', foreground: '#050A12' },
  RUNNING: { label: '진행 중', background: '#34D399', foreground: '#050A12' },
  PARTIAL: { label: '일부 실패', background: colors.warning, foreground: '#050A12' },
  FAILED: { label: '오류', background: '#F26A6F', foreground: '#050A12' },
  DELAYED: { label: '지연', background: '#FAB83B', foreground: '#050A12' },
  WAITING: { label: '실행 전', background: '#111825', foreground: '#F2F7FC' },
  NOT_CONFIGURED: { label: '설정 누락', background: '#7A8CA8', foreground: '#050A12' },
  NOT_IMPLEMENTED: { label: '미구현', background: '#7A8CA8', foreground: '#050A12' },
  NO_DATA: { label: '데이터 없음', background: '#7A8CA8', foreground: '#050A12' },
  NO_FILING: { label: '미공시', background: '#3D8CF5', foreground: '#050A12' },
  NOT_APPLICABLE: { label: '수집 제외 여부 검토', background: '#7A8CA8', foreground: '#050A12' },
  SUCCESS: { label: '완료', background: '#3D8CF5', foreground: '#050A12' },
  SKIPPED: { label: '건너뜀', background: '#7A8CA8', foreground: '#050A12' },
};
const featureNames: Record<string, string> = {
  'realtime-prices': '실시간 주가',
  'account-snapshots': '일별 계좌 스냅샷',
  'market-prices': '전체 종목 주가',
  'investor-trends': '투자동향',
  'dart-financial-statements': 'DART 재무제표',
  'security-master': '종목 마스터',
  'stock-news': '종목소식',
};
const dateText = (value?: string | null) => value
  ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  : '기록 없음';
const clockText = (value?: string | null) => value
  ? new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })
  : '미정';
const unknownStatus = { label: '상태 미확인', background: '#7A8CA8', foreground: '#050A12' };
const numberText = (value?: number | null) => value == null ? '—' : value.toLocaleString('ko-KR');
const asRecord = (value: unknown): DataRecord => value && typeof value === 'object' ? value as DataRecord : {};
const mutedText = { color: '#7A8CA8' };
const cardSx = { bgcolor: '#0E131F', border: '1px solid #26334A', borderRadius: '8px', minWidth: 0 };

// Pending values never render fabricated counts/statuses; reserve only each value's space.
const PendingData = createContext(false);
const FailedData = createContext(false);
function DataValue({ children, width = 80 }: { children?: ReactNode; width?: number }) {
  const pending = useContext(PendingData);
  const failed = useContext(FailedData);
  if (pending && failed) return <Box component="span" aria-label="조회 실패">—</Box>;
  return pending ? <Box component="span" aria-label="데이터 조회 중" sx={{ display: 'inline-flex', verticalAlign: 'baseline', width, maxWidth: '100%', height: '0.8em' }}><DelayedSkeleton variant="rounded" width="100%" height="100%" /></Box> : <>{children}</>;
}
function Updating({ initialIcon = false }: { initialIcon?: boolean }) {
  const visible = useDelayedIndicator();
  if (!visible && initialIcon) return <RefreshRounded sx={{ fontSize: 16 }} />;
  return <CircularProgress aria-label="갱신 중" size={13} color="inherit" sx={{ visibility: visible ? 'visible' : 'hidden' }} />;
}
function QueryNotice({ error, retry }: { error: boolean; retry: () => void }) {
  if (!error) return null;
  return <Box sx={{ height: 24, display: 'flex', alignItems: 'center', gap: 1 }}>
    {error && <><QueryErrorNotice message="조회 실패 · 수집기 상태와 별개입니다."/><Button onClick={retry} sx={{ minWidth: 0, p: 0, fontSize: 10 }}>다시 시도</Button></>}
  </Box>;
}
// These descriptors supply fixed titles/layout only. Every data field is hidden by PendingData.
const featureShell = (id: string): Feature => ({ id, name: featureNames[id], status: '', recent: {} });

function StatusPill({ feature }: { feature: Feature; compact?: boolean }) {
  const pending = useContext(PendingData);
  const base = statusStyle[feature.status] ?? unknownStatus;
  const outOfSession = feature.id === 'realtime-prices' && feature.realtime?.session === 'OUT_OF_SESSION' && ['OK', 'WAITING', 'RUNNING'].includes(feature.status);
  const phaseOne = feature.id === 'dart-financial-statements' && feature.phase === 'BACKFILL' && feature.status === 'RUNNING';
  const label = feature.id==='investor-trends'&&feature.status==='PARTIAL'&&!feature.recent.failed?'자료 제한':outOfSession ? '장 외 대기' : phaseOne ? '1단계 진행' : base.label;
  const style = outOfSession ? statusStyle.WAITING : base;
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, minWidth: 82, width: 82, boxSizing: 'border-box', height: 19, px: 1, borderRadius: '999px', bgcolor: pending ? 'transparent' : style.background, color: style.foreground, fontSize: 10, lineHeight: 1, fontWeight: 600, whiteSpace: 'nowrap' }}><DataValue width={60}>{label}</DataValue></Box>;
}

function ManualRefresh({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
  return <Button aria-label="통계 새로고침" onClick={onClick} disabled={refreshing} sx={{ minWidth: 20, minHeight: 20, width: 20, height: 20, p: 0, color: '#7A8CA8', flexShrink: 0 }}>
    {refreshing ? <Updating initialIcon /> : <RefreshRounded sx={{ fontSize: 16 }} />}
  </Button>;
}

function SummaryStatus({ features, generatedAt }: { features: Feature[]; generatedAt: string }) {
  const counts=summarizeMonitorStatuses(features);
  const groups=[{label:'완료',count:counts.completed,color:'#3D8CF5'},{label:'오류',count:counts.failed,color:'#F26A6F'},{label:'경고',count:counts.warning,color:'#FAB83B'},{label:'대기',count:counts.waiting,color:'#7A8CA8'},{label:'진행 중',count:counts.running,color:'#34D399'}];
  return <Box data-testid="monitor-summary" sx={{ ...cardSx, mb:'7px', p:'12px' }}>
    <Typography sx={{color:'#F2F7FC',fontSize:12,fontWeight:600}}>전체 상태</Typography>
    <Box sx={{display:'flex',flexWrap:'wrap',gap:'4px 12px',mt:'6px'}}>
      {groups.map(group=><Typography key={group.label} sx={{color:group.color,fontSize:11,lineHeight:'16px'}}>{group.label} <DataValue width={20}>{group.count}건</DataValue></Typography>)}
    </Box>
    <Typography sx={{...mutedText,fontSize:10,lineHeight:'14px',mt:'4px'}}>통계 갱신 <DataValue width={130}>{dateText(generatedAt)}</DataValue></Typography>
  </Box>;
}

function FeatureTiming({feature}:{feature:Feature}) {
  const state=feature.lastExecution?.status??feature.status;
  const tones:Record<string,{label:string;color:string}>={
    OK:{label:'성공',color:'#3D8CF5'},SUCCESS:{label:'성공',color:'#3D8CF5'},
    FAILED:{label:'오류',color:'#F26A6F'},PARTIAL:{label:'일부 실패',color:colors.warning},
    WAITING:{label:'대기',color:'#34D399'},SKIPPED:{label:'대기',color:'#34D399'},RUNNING:{label:'진행 중',color:'#3D8CF5'},
    DELAYED:{label:'지연',color:colors.warning},NO_FILING:{label:'미공시',color:'#7A8CA8'},
  };
  const tone=tones[state]??{label:'미정',color:'#7A8CA8'};
  const realtime=feature.id==='realtime-prices';
  const attempt=realtime?feature.realtime?.lastPriceReceivedAt??feature.lastAttemptAt:feature.lastAttemptAt;
  const finished=['OK','SUCCESS'].includes(state)?(realtime?feature.realtime?.lastDbSavedAt??feature.lastSuccessAt:feature.lastSuccessAt):feature.lastExecution?.finishedAt??feature.lastAttemptAt;
  return <Typography component="span" data-testid="feature-timing" sx={{...mutedText,fontSize:10,lineHeight:'14px',whiteSpace:'nowrap',flexShrink:0}}><Box component="span" data-testid="feature-result-status" sx={{color:tone.color}}><DataValue width={25}>{tone.label}</DataValue>{finished&&<> <DataValue width={30}>{clockText(finished)}</DataValue></>}</Box>(시도 <DataValue width={30}>{clockText(attempt)}</DataValue>)</Typography>;
}

function FeatureSummaryCard({ item, onOpen, selected = false }: { item: Feature; onOpen: () => void; selected?: boolean }) {
  const name = featureNames[item.id] ?? item.name;
  const dart = item.id === 'dart-financial-statements';
  const realtime = item.id === 'realtime-prices';
  return <Box
    data-testid={`monitor-feature-${item.id}`}
    role="link"
    aria-current={selected ? 'true' : undefined}
    tabIndex={0}
    aria-label={`${name} 상세 보기`}
    onClick={onOpen}
    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}
    sx={{ ...cardSx, display: 'block', textAlign: 'left', cursor: 'pointer', textDecoration: 'none', p: '12px', minHeight: 75, boxSizing: 'border-box', borderColor: selected ? '#3B82F6' : '#26334A', '&:hover': { borderColor: '#456186' }, '&:focus-visible': { outline: '2px solid #3D8CF5', outlineOffset: 1 } }}
  >
    <Stack direction="row" sx={{minHeight:19,alignItems:'center',gap:'8px'}}>
      <Box sx={{display:'flex',alignItems:'center',gap:'8px',flex:1,minWidth:0}}>
        <Typography sx={{color:'#F2F7FC',fontSize:12,fontWeight:600,lineHeight:1.1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</Typography>
        <FeatureTiming feature={item}/>
      </Box>
      <StatusPill feature={item} compact/>
    </Stack>
    <ScheduleNotice feature={item}/>
    {dart&&<Typography sx={{...mutedText,fontSize:10,lineHeight:'14px'}}>1단계 <DataValue width={65}>{numberText((item.backfill?.success??0)+(item.backfill?.noFiling??0)+(item.backfill?.notApplicable??0))}/{numberText(item.backfill?.currentTarget)}</DataValue> · 2단계 <DataValue width={35}>{item.phase==='CURRENT'?'확인 중':'대기'}</DataValue></Typography>}
    {item.id==='investor-trends'&&<Typography sx={{...mutedText,fontSize:10,lineHeight:'14px'}}>원문만 <DataValue width={25}>{numberText(item.investor?.rawOnly)}</DataValue>건 · 자료 대기 <DataValue width={25}>{numberText(item.investor?.waiting)}</DataValue>건</Typography>}
    <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px',mt:'1px',fontSize:10,lineHeight:'14px'}}>
      <Typography data-testid="feature-result-count" sx={{color:'#F2F7FC',fontSize:'inherit',lineHeight:'inherit',minWidth:0,whiteSpace:'nowrap'}}>
        {item.id==='stock-news'?<>신규 소식 <DataValue width={30}>{numberText(item.recent.success)}</DataValue>건</>
          :item.id==='investor-trends'?<>수집 성공 <DataValue width={65}>{numberText(item.recent.success)}/{numberText(item.recent.target)}</DataValue>건</>
          :realtime?<>수신 <DataValue width={30}>{numberText(item.recent.processed)}</DataValue>건</>
          :<><DataValue width={65}>{numberText(item.recent.success)}/{numberText(item.recent.target)}</DataValue>건 성공</>}
      </Typography>
      <Typography data-testid="feature-next-message" sx={{color:item.nextAt||realtime?'#3D8CF5':'#7A8CA8',fontSize:'inherit',lineHeight:'inherit',textAlign:'right',whiteSpace:'nowrap',ml:'auto'}}>다음 <DataValue width={35}>{item.nextAt?clockText(item.nextAt):realtime?'장중':'미정'}</DataValue></Typography>
    </Box>
  </Box>;
}

function ScheduleNotice({feature}:{feature:Feature}) {
  if(!feature.scheduleState&&!feature.lastExecution)return null;
  return <Box sx={{fontSize:10,lineHeight:'15px',color:colors.textMuted,overflowWrap:'anywhere'}}>
    {feature.lastExecution && <Typography sx={{fontSize:'inherit'}}>실행 #{feature.lastExecution.id} · 마지막 실행: {feature.id==='investor-trends'&&feature.lastExecution.status==='PARTIAL'&&!feature.recent.failed?'자료 제한':feature.lastExecution.status==='SUCCESS'&&feature.recent.success===0&&feature.recent.excluded? '정상 · 전체 수집 제외':statusStyle[feature.lastExecution.status]?.label??feature.lastExecution.status}</Typography>}
    {feature.scheduleState && <Typography sx={{fontSize:'inherit',color:feature.scheduleState.status==='DELAYED'?colors.warning:colors.textMuted}}>스케줄: {feature.scheduleState.reason??(feature.scheduleState.status==='RUNNING'?'진행 중':'다음 회차 대기')} · 기준 {dateText(feature.scheduleState.dueAt)}</Typography>}
    {feature.duplicateRequest && <Typography sx={{fontSize:'inherit'}}>별도 요청 #{feature.duplicateRequest.id}: {feature.duplicateRequest.reason}</Typography>}
    {feature.investor&&<Typography sx={{fontSize:'inherit'}}>{feature.investor.dataScope} · {feature.investor.scheduleEnabled?'스케줄 판정 사용':'자동 실행 연결 미확인 · 지연 판정 보류'}</Typography>}
    {feature.id!=='investor-trends'&&feature.recent.excluded!=null && <Typography sx={{fontSize:'inherit'}}>정상 제외 {feature.recent.excluded}건 · 기타 건너뜀 {Math.max(0,(feature.recent.skipped??0)-feature.recent.excluded)}건</Typography>}
  </Box>;
}

function CountStrip({ target, success, failed, skipped,feature,runId,scopeLabel }: { target?: number|null; success?: number|null; failed?: number|null; skipped?: number|null;feature:string;runId?:string;scopeLabel?:string }) {
  const navigate=useListNavigation();const pending=useContext(PendingData);
  const open=(result:string)=>navigate(`/detail/collection-monitoring/${feature}/items?${new URLSearchParams({result,...(runId?{runId}:{})})}`);
  const values = [
    ['대상', target, colors.textPrimary],
    ['성공', success, colors.positive],
    ['실패', failed, colors.error],
    ['건너뜀', skipped, '#F2F7FC'],
  ] as const;
  return <><Typography sx={{fontSize:10,color:colors.textMuted,mb:0.5}}>{scopeLabel??'최근 실행 대상 결과'}</Typography><Box data-testid="monitor-counts" sx={{ ...cardSx, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', minHeight: 44, bgcolor: '#0E131F', borderRadius: '8px', px: '4px', py: '3px' }}>
    {values.map(([label, value, color]) => <ButtonBase key={label} disabled={pending||!['성공','실패'].includes(label)} aria-label={['성공','실패'].includes(label)?`${label} 대상 목록`:undefined} onClick={()=>open(label==='성공'?'SUCCESS':'FAILED')} sx={{minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:0.15,'&.Mui-disabled':{color}}}>
      <Typography sx={{ color, fontSize: 10, lineHeight: '11px' }}>{feature==='investor-trends'&&label==='건너뜀'?'미완료':label}</Typography>
      <Typography sx={{ color, fontSize: 11, lineHeight: '15px', fontWeight: 600 }}><DataValue width={30}>{numberText(value)}</DataValue></Typography>
    </ButtonBase>)}
  </Box></>;
}

function CurrentStatusCard({ feature, onRefresh, refreshing }: { feature: Feature; onRefresh: () => void; refreshing: boolean }) {
  return <Box data-testid="monitor-current" sx={{ ...cardSx, px: '12px', py: '12px', minHeight: feature.id === 'realtime-prices' ? 70 : 55, position: 'relative' }}>
    <Stack direction="row" spacing={0.5} sx={{ height: 20, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1 }}>현재 상태</Typography>
      <StatusPill feature={feature} />

    </Stack>
    {feature.id==='dart-financial-statements'&&<Typography data-testid="monitor-dart-active-phase" sx={{fontSize:12,fontWeight:700,color:'#3D8CF5',mt:'4px'}}>현재 단계: {feature.phase==='CURRENT'?'2단계 · 현행 수집':'1단계 · 과거 자료 수집'}</Typography>}
    <ScheduleNotice feature={feature} />
    {feature.lastExecution && <Typography sx={{fontSize:10,color:colors.textMuted,overflowWrap:'anywhere'}}>{feature.id==='investor-trends'?'최근 저장 기준':'원천 기준'} {feature.id==='investor-trends'?(feature.lastDataAt?.slice(0,10)??'기록 없음'):dateText(feature.lastDataAt)} · 수집 완료 {dateText(feature.lastCollectedAt)}</Typography>}
    {feature.id === 'realtime-prices' ? <><Box sx={{ position: 'absolute', right: 10, bottom: 0 }}><ManualRefresh refreshing={refreshing} onClick={onRefresh} /></Box>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>워커 <DataValue>{dateText(feature.realtime?.heartbeatAt)}</DataValue> · <DataValue>{feature.realtime?.session ?? '세션 기록 없음'}</DataValue></Typography>
      <Typography sx={{ color: '#3D8CF5', fontSize: 10, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>수신 <DataValue width={30}>{clockText(feature.realtime?.lastPriceReceivedAt)}</DataValue> · 발행 <DataValue width={30}>{clockText(feature.realtime?.lastSsePublishedAt)}</DataValue> · 저장 <DataValue width={30}>{clockText(feature.realtime?.lastDbSavedAt)}</DataValue></Typography>
    </> : <>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>시도 <DataValue>{dateText(feature.lastAttemptAt)}</DataValue> · 성공 <DataValue>{dateText(feature.lastSuccessAt)}</DataValue></Typography>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '15px' }}>다음 예정 <DataValue width={40}>{clockText(feature.nextAt)}</DataValue><Box component="span" sx={{position:'absolute',right:10,bottom:0}}><ManualRefresh refreshing={refreshing} onClick={onRefresh}/></Box></Typography>
    </>}
  </Box>;
}

function InvestorDiagnostics({feature}:{feature:Feature}){
 const data=feature.investor;
 return <Box data-testid="monitor-investor-diagnostics" sx={{...cardSx,p:'8px 12px',fontSize:11}}>
  <Typography sx={{fontSize:12,fontWeight:600,mb:'4px'}}>투자동향 수집 결과 · 미제공 항목 안내</Typography>
  <Typography sx={{fontSize:12,fontWeight:600,color:'#3D8CF5',mb:'4px'}}>수집 성공 {numberText(feature.recent.success)}/{numberText(feature.recent.target)}건</Typography>
  {([['API 자료 저장 · 수량 또는 금액',data?.quantityStored],['원문만 저장 · 단위 검증 대기',data?.rawOnly],['시작일 이후 자료 미제공 대기',data?.waiting],['조회·검증·저장 실패',data?.failed],['기타 결과',data?.other]]as const).map(([label,count])=><Box key={label} sx={{display:'flex',justifyContent:'space-between',gap:'8px',py:'2px'}}><span>{label}</span><DataValue width={24}>{numberText(count)}건</DataValue></Box>)}
  <Typography sx={{fontSize:10,color:colors.textMuted,mt:'6px',overflowWrap:'anywhere'}}>{data?.notice??'현재 연결 DB의 기록을 조회합니다.'}</Typography>
  {data?.backfill&&<Box data-testid="monitor-investor-backfill" sx={{borderTop:`1px solid ${colors.border}`,mt:'8px',pt:'8px'}}>
   <Typography sx={{fontSize:12,fontWeight:600}}>과거 자료 보충 · {data.backfill.from??'기준 확인 중'}부터</Typography>
   <Typography sx={{fontSize:11,mt:'4px'}}>완료 {data.backfill.complete}/{data.backfill.total??'—'}종목 · 저장 구간 {data.backfill.pages}개 · 실패 {data.backfill.failed}종목</Typography>
   {data.backfill.exhausted>0&&<Typography sx={{fontSize:10,color:colors.textMuted}}>제공 가능한 과거 자료까지 확보 {data.backfill.exhausted}종목</Typography>}
   <Typography sx={{fontSize:10,color:colors.textMuted}}>실행 #{data.backfill.id} · 갱신 {dateText(data.backfill.updatedAt)} · 종목 완료는 과거 보충 범위 기준입니다.</Typography>
  </Box>}
 </Box>;
}

type MonitorPage = {note?:string;rows: DataRecord[]; hasNext: boolean; nextCursor: string | null};
function useMonitorPages(feature: string, stream: 'runs' | 'items', filters: Record<string,string> = {}, limit = 50) {
  return useInfiniteQuery({
    queryKey: ['collection-monitor-pages',feature,stream,filters,limit],
    initialPageParam: null as string | null,
    queryFn: ({pageParam,signal}) => {
      const params = new URLSearchParams({...filters,limit:String(limit),...(pageParam ? {cursor:pageParam}: {})});
      return apiRequest<MonitorPage>(`/collection/monitoring/${encodeURIComponent(feature)}/${stream}?${params}`,{signal});
    },
    getNextPageParam: last => last.hasNext ? last.nextCursor : undefined,
    staleTime: Infinity, gcTime: 30*60_000, refetchOnWindowFocus: false, refetchOnMount: false, retry: false,
  });
}
function RunHistory({runs,feature}: {runs: DataRecord[]; feature: string}) {
  const pending=useContext(PendingData);
  return <Box sx={{...cardSx,border:0,bgcolor:'transparent',p:'0 12px'}}>
    <Typography sx={{color:colors.textPrimary,fontSize:12,fontWeight:600,mb:0.75}}>과거 실행 이력</Typography>
    <Box data-testid="monitor-history-data" sx={{minHeight:pending?42:0}}>
      {pending ? <Stack spacing={1}><DataValue width={200}/><DataValue width={240}/></Stack> : runs.length ? <Stack spacing={0.5}>{runs.map(run=>{
        const style=statusStyle[String(run.status)]??unknownStatus;
        const metadata=asRecord(run.metadata);
        return <Box key={run.id} data-testid="monitor-run-row" data-scroll-item={`run-${run.id}`} sx={{py:0.5,minWidth:0,overflowWrap:'anywhere'}}>
          <Typography sx={{color:style.background,fontSize:10,lineHeight:'14px'}}>{dateText(run.startedAt)} · {feature==='investor-trends'&&run.status==='PARTIAL'&&!run.failed?'자료 제한':style.label}{feature==='dart-financial-statements' ? ` · ${metadata.phase==='BACKFILL'?'1단계 과거 수집':metadata.phase==='MANUAL'?'수동 갱신':'2단계 현행 수집'}`:''}</Typography>
          <Typography sx={{color:run.status==='PARTIAL'?colors.warning:colors.textMuted,fontSize:10,lineHeight:'14px'}}>대상 {numberText(run.target)} · 성공 {numberText(run.success)} · 실패 {numberText(run.failed)} · 정상 제외 {numberText(run.excluded)} · {feature==='investor-trends'?'미완료':'건너뜀'} {numberText(run.skipped)}</Typography>
          {run.failureReason && <Typography sx={{color:run.status==='PARTIAL'?colors.warning:colors.error,fontSize:10,lineHeight:'14px',whiteSpace:'normal',overflowWrap:'anywhere'}}>{run.failureReason}</Typography>}
        </Box>;
      })}</Stack> : <Typography sx={{...mutedText,fontSize:10}}>실행 이력이 없습니다.</Typography>}
    </Box>
  </Box>;
}
function TargetResults({items,feature}: {items: DataRecord[];feature:string}) {
  const pending=useContext(PendingData);
  return <Box sx={{...cardSx,border:0,bgcolor:'transparent',p:'0 12px',minWidth:0}}>
    <Stack direction="row" sx={{alignItems:'center',mb:0.5}}><Typography sx={{color:colors.textPrimary,fontSize:12,fontWeight:600,flex:1}}>대상별 상태</Typography><Typography sx={{...mutedText,fontSize:10}}>확인 <DataValue width={24}>{numberText(items.length)}</DataValue></Typography></Stack>
    <Box data-testid="monitor-results-data" sx={{minHeight:pending?42:0}}>
      {pending ? <Stack spacing={1}><DataValue width={180}/><DataValue width={220}/></Stack> : items.length ? items.map(item=>{
        const style=statusStyle[String(item.status)]??unknownStatus;
        const emptyAccountExcluded=feature==='account-snapshots'&&item.status==='SKIPPED'&&item.reason?.startsWith('빈 계좌 수집 제외:');
        const label=emptyAccountExcluded||item.status==='NOT_APPLICABLE'&&item.sourceReview?.resolutionStatus==='EXCLUDED'?'수집 제외':feature==='investor-trends'&&item.status==='STALE'&&item.reason?.startsWith('RAW_OBSERVATION_ONLY:')?'원문만 저장':feature==='investor-trends'&&item.status==='STALE'&&item.reason?.startsWith('PARTIAL_FIELDS:')?(item.reason.includes('시장 순매수')?'시장 순매수 금액 저장':item.reason.includes('수량·금액')?'KRX 수량·금액 저장':'KRX 수량 저장'):feature==='investor-trends'&&item.status==='SKIPPED'&&item.reason?.startsWith('NO_CURRENT_DATA:')?'자료 미제공 대기':feature==='investor-trends'&&item.reason?.startsWith('API_MARKET_NOT_READY:')?'시장 API 검증 대기':style.label;
        return <Box key={item.id} data-testid="monitor-target-row" data-scroll-item={`item-${item.id}`} sx={{py:0.5,borderBottom:'1px solid #26334A',minWidth:0,overflowWrap:'anywhere'}}>
          <Stack direction="row" sx={{alignItems:'baseline',gap:0.5}}><Typography sx={{color:style.background,fontSize:10,flex:1,minWidth:0}}>{feature==='realtime-prices'&&item.security?`${item.security.name}(${String(item.symbol).split(':')[0]})`:item.security?.name??item.symbol??'대상'} <Box component="span" sx={mutedText}>{collectionTaskLabel(item)}</Box></Typography><Typography sx={{color:style.background,fontSize:10,flexShrink:0}}>{label}</Typography>{item.status==='FAILED'&&item.security?.id&&featureLabels[feature]&&<CollectionSettingToggle security={item.security as ManagedSecurity} feature={feature}/>}</Stack>
          <Typography sx={{...mutedText,fontSize:10,lineHeight:'14px'}}>실행시각 {dateText(item.occurredAt)}</Typography>
          {(item.status==='FAILED'||emptyAccountExcluded)&&item.reason&&<Typography sx={{fontSize:10,lineHeight:'14px',color:emptyAccountExcluded?colors.textMuted:colors.error,overflowWrap:'anywhere',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{item.reason}</Typography>}
          {item.security?.exclusionReason&&<Typography sx={{fontSize:10,color:colors.warning,overflowWrap:'anywhere'}}>{item.security.exclusionReason}</Typography>}
          {item.security&&item.recordedSymbol&&item.recordedSymbol!==item.security.symbol&&<Typography sx={{fontSize:10,color:colors.textMuted}}>이전 코드 {item.recordedSymbol}의 기록 · 현재 코드 {item.security.symbol}</Typography>}
          {/^\d+:\d{4}:(ANNUAL|Q[1-4])$/.test(item.symbol)&&!item.recordedSymbol&&<Typography sx={{fontSize:10,color:colors.textMuted}}>이력의 종목코드 미기록 · 현재 코드의 수집 결과로 대체하지 않습니다.</Typography>}
          <Box component="details" sx={{fontSize:10,lineHeight:'14px',color:colors.textMuted,whiteSpace:'normal',overflowWrap:'anywhere'}}><Box component="summary" sx={{cursor:'pointer',color:colors.focus}}>상세내용</Box>{item.sourceReview?.validationResult?item.sourceReview.message:item.reason??style.label}{feature==='dart-financial-statements'&&<div>{item.sourceReview?.validationResult?`${item.sourceReview.requestedYear?'요청 '+item.sourceReview.requestedYear+'년 · ':''}${item.sourceReview.candidatePeriod?'검토 후보 '+item.sourceReview.candidatePeriod+' (대상 확정 아님)':''}`:'상세 사유 미기록'}</div>}{item.observedAt && <div>관측시각 {dateText(item.observedAt)}</div>}</Box>
        </Box>;
      }) : <Typography sx={{...mutedText,fontSize:10}}>대상 내역이 없습니다.</Typography>}
    </Box>
  </Box>;
}
function SummaryRecords({feature,stream}: {feature:string;stream:'runs'|'items'}) {
  const navigate=useListNavigation();
  const query=useMonitorPages(feature,stream,{},3);
  // Summary refresh does not invalidate a previously paged detail list.
  useEffect(()=>{const timer=window.setInterval(()=>{void query.refetch();},60_000);return ()=>window.clearInterval(timer);},[query.refetch]);
  const rows=query.data?.pages[0]?.rows??[];
  return <FailedData.Provider value={query.isError}><PendingData.Provider value={!query.data}>
    <QueryNotice error={query.isError} retry={()=>{void query.refetch();}}/>
    {stream==='runs'?<RunHistory runs={rows} feature={feature}/>:<TargetResults items={rows} feature={feature}/>}
    <Box sx={{display:'flex',justifyContent:'flex-end',px:'12px'}}><Button aria-label={`${stream==='runs'?'실행 이력':'대상별 상태'} 상세보기`} onClick={()=>navigate(`/detail/collection-monitoring/${feature}/${stream}`)} sx={{fontSize:11}}>상세보기</Button></Box>
  </PendingData.Provider></FailedData.Provider>;
}
function MonitorListDetail({feature,stream}: {feature:string;stream:'runs'|'items'}) {
  const [params,setParams]=useSearchParams();
  const location=useLocation();
  const filters=Object.fromEntries(['result','phase','symbol','market','accountId','from','to','runId'].flatMap(key=>params.get(key)?[[key,params.get(key)!]]:[]));
  const [filtersOpen,setFiltersOpen]=useState(params.size>0);
  const query=useMonitorPages(feature,stream,filters);
  const queryClient=useQueryClient();
  const lock=useRef(false);
  const rows=query.data?.pages.flatMap(page=>page.rows)??[];
  const changeFilters=(next:URLSearchParams)=>{
    const nextFilters=Object.fromEntries(['result','phase','symbol','market','accountId','from','to','runId'].flatMap(key=>next.get(key)?[[key,next.get(key)!]]:[]));
    if(JSON.stringify(filters)===JSON.stringify(nextFilters))return;
    void queryClient.resetQueries({queryKey:['collection-monitor-pages',feature,stream,nextFilters,50],exact:true});
    setParams(next,{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});
  };
  const update=(key:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);changeFilters(next);};
  const loadMore=async()=>{if(lock.current || query.isFetching || !query.hasNextPage)return;lock.current=true;try{await query.fetchNextPage();}finally{lock.current=false;}};
  return <Box sx={{pb:'32px'}} data-list-condition={`${feature}:${stream}:${JSON.stringify(filters)}`} data-restoration-ready={query.isPending?'false':'true'}>
    <Stack direction="row" sx={{alignItems:'center',gap:1,pt:0,pb:1}}><Typography sx={{fontSize:12,fontWeight:600,flex:1}}>{featureNames[feature]} · {stream==='runs'?'실행 이력':'대상별 상태'}</Typography><Button onClick={()=>setFiltersOpen(v=>!v)} startIcon={<FilterListRounded/>} sx={{fontSize:11}}>필터</Button><Button onClick={()=>changeFilters(new URLSearchParams())} sx={{fontSize:11}}>전체 기록</Button></Stack>
    {filters.runId&&<Typography sx={{fontSize:10,color:colors.textMuted}}>최근 실행 대상 결과 · 실행 #{filters.runId}</Typography>}
    <Collapse in={filtersOpen}><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:0.5,mb:1}}><CollectionFilters itemStream={stream==='items'} feature={feature} resultFilter={filters.result??''} setResultFilter={v=>update('result',v)} phaseFilter={filters.phase??''} setPhaseFilter={v=>update('phase',v)} symbolFilter={filters.symbol??''} setSymbolFilter={v=>update('symbol',v)} marketFilter={filters.market??''} setMarketFilter={v=>update('market',v)} accountFilter={filters.accountId??''} setAccountFilter={v=>update('accountId',v)} from={filters.from??''} setFrom={v=>update('from',v)} to={filters.to??''} setTo={v=>update('to',v)}/></Box></Collapse>
    {query.data?.pages[0]?.note&&<Typography sx={{fontSize:11,color:colors.warning,my:1}}>{query.data.pages[0].note}</Typography>}
    <FailedData.Provider value={query.isError}><PendingData.Provider value={!query.data}>
      {stream==='runs'?<RunHistory runs={rows} feature={feature}/>:<TargetResults items={rows} feature={feature}/>}
    </PendingData.Provider></FailedData.Provider>
    {query.isError && <Box sx={{fontSize:11,color:colors.error,mt:1}}><QueryErrorNotice message="조회 실패 · 기존 목록을 유지합니다." onRetry={()=>{if(query.isFetchNextPageError)void loadMore();else void query.refetch();}}/></Box>}
    {query.hasNextPage && <Box sx={{textAlign:'center',mt:1}}><Button disabled={query.isFetching} onClick={()=>{void loadMore();}}>더보기</Button>{query.isFetchingNextPage && <Updating/>}</Box>}
  </Box>;
}

function DartCurrentStageCard({ phase, status, priorityCheckedWithinDay, universeOver90Days, priorityPending, universePending, dailyApiCalls, dailyApiLimit, companyChecks, collectionState, temporaryHistory=false }: {
  temporaryHistory?:boolean; phase: string; status: string; collectionState?: string; priorityCheckedWithinDay: number | null; universeOver90Days: number | null; priorityPending: number | null; universePending: number | null; dailyApiCalls: number | null; dailyApiLimit: number | null; companyChecks: number | null;
}) {
  const disabled = phase !== 'CURRENT';
  const statusInfo = statusStyle[status] ?? unknownStatus;
  const label = temporaryHistory?'보류':!['OK','SUCCESS','RUNNING','WAITING'].includes(status)
    ? statusInfo.label
    : disabled ? '1단계 후 대기' : collectionState==='DAILY_LIMIT'?'호출 한도 대기':status==='WAITING'?'실행 대기':status === 'RUNNING' ? '진행 중' : '상시 수집';
  const badge = temporaryHistory?statusStyle.WAITING:!['OK','SUCCESS','RUNNING','WAITING'].includes(status)
    ? statusInfo : disabled||status==='WAITING' ? statusStyle.WAITING : status === 'RUNNING' ? statusStyle.RUNNING : statusStyle.OK;
  return <Box data-testid="monitor-dart-current" sx={{ ...cardSx, p: '12px', minHeight: 55, opacity: disabled ? 0.86 : 1 }}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{temporaryHistory?'2단계 · 보류':'2단계 · 현재 사업연도 상시 수집'}</Typography>
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: badge.background, color: badge.foreground, borderRadius: '999px', minWidth: 76, px: 1, height: 19, justifyContent: 'center', alignItems: 'center', fontSize: 12, fontWeight: 600 }}><DataValue width={65}>{label}</DataValue></Box>
    </Stack>
    <Typography sx={{ color: disabled ? '#7A8CA8' : '#3D8CF5', fontSize: 10, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: 0, sm: 0.5 } }}><DataValue width={240}>
      {temporaryHistory?'우선종목 보류 · 전체종목 과거 자료 보완 후 별도 설계':disabled ? status === 'NOT_CONFIGURED' ? '설정 후 1단계 완료 시 시작' : status === 'NOT_IMPLEMENTED' ? '수집기 배포 후 1단계 완료 시 시작' : '1단계 완료 후 자동 시작' : collectionState==='DAILY_LIMIT'?'2단계 전환 완료 · 오늘 호출 한도 도달로 대기':'2단계 전환 완료 · 우선종목 하루 1회 · 전체종목 약 3개월 순환'}
    </DataValue></Typography>
    <Typography sx={{ display: { xs: 'none', sm: 'block' }, ...mutedText, fontSize: 10, lineHeight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><DataValue width={240}>
      {temporaryHistory?'2단계는 별도 설계 후 재개합니다.':disabled ? '현행 공시 확인은 과거 자료 구축 완료 후 시작합니다.' : `우선 확인 ${numberText(priorityCheckedWithinDay)} · 전체 지연 ${numberText(universeOver90Days)}`}
    </DataValue></Typography>
    <Typography sx={{ display: { xs: 'none', sm: 'block' }, ...mutedText, fontSize: 10, lineHeight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>API <DataValue width={42}>{numberText(dailyApiCalls)}/{numberText(dailyApiLimit)}</DataValue> · 종목 확인 <DataValue width={20}>{numberText(companyChecks)}</DataValue> · 우선 대기 <DataValue width={20}>{numberText(priorityPending)}</DataValue> · 전체 대기 <DataValue width={20}>{numberText(universePending)}</DataValue></Typography>
  </Box>;
}

function CollectionFilters({ itemStream=false, feature, resultFilter, setResultFilter, phaseFilter, setPhaseFilter, symbolFilter, setSymbolFilter, marketFilter, setMarketFilter, accountFilter, setAccountFilter, from, setFrom, to, setTo }: {
  itemStream?:boolean; feature: string; resultFilter: string; setResultFilter: (value: string) => void; phaseFilter: string; setPhaseFilter: (value: string) => void;
  symbolFilter: string; setSymbolFilter: (value: string) => void; marketFilter: string; setMarketFilter: (value: string) => void;
  accountFilter: string; setAccountFilter: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void;
}) {
  const selectSx = { height: 30, color: '#CBD5E1', fontSize: 10, bgcolor: '#0B1220', borderRadius: '6px', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#26334A' }, '& .MuiSelect-select': { py: '5px', pl: '8px' }, minWidth: 0 };
  const inputSx = { width: '100%', minWidth: 0, height: 30, boxSizing: 'border-box', bgcolor: '#0B1220', color: '#E8EDF7', border: '1px solid #26334A', borderRadius: '6px', px: '7px', fontSize: 10, outline: 'none', colorScheme: 'dark' };
  return <>
    <FormControl size="small"><Select<string> value={resultFilter} displayEmpty onChange={(event) => setResultFilter(event.target.value)} aria-label="결과 필터" sx={selectSx}><MenuItem value="">전체 결과</MenuItem>{(itemStream?['SUCCESS','FAILED','STALE','SKIPPED','NO_DATA','NOT_APPLICABLE']:['SUCCESS','PARTIAL','FAILED','SKIPPED']).map((value) => <MenuItem key={value} value={value}>{statusStyle[value]?.label ?? value}</MenuItem>)}</Select></FormControl>
    {feature === 'dart-financial-statements' && <FormControl size="small"><Select<string> value={phaseFilter} displayEmpty onChange={(event) => setPhaseFilter(event.target.value)} aria-label="수집 단계 필터" sx={selectSx}><MenuItem value="">전체 단계</MenuItem><MenuItem value="BACKFILL">1단계 과거 구축</MenuItem><MenuItem value="CURRENT">2단계 상시</MenuItem></Select></FormControl>}
    <Box component="input" aria-label="종목 필터" placeholder="종목코드" value={symbolFilter} onChange={(event: ChangeEvent<HTMLInputElement>) => setSymbolFilter(event.target.value)} sx={inputSx} />
    {feature !== 'account-snapshots' && <FormControl size="small"><Select<string> value={marketFilter} displayEmpty onChange={(event) => setMarketFilter(event.target.value)} aria-label="시장 필터" sx={selectSx}><MenuItem value="">전체 시장</MenuItem>{['KOSPI','KOSDAQ','KONEX','OTHER'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>}
    {feature === 'account-snapshots' && <Box component="input" aria-label="계좌 필터" placeholder="계좌 ID" value={accountFilter} onChange={(event: ChangeEvent<HTMLInputElement>) => setAccountFilter(event.target.value)} sx={inputSx} />}
    <Box component="input" aria-label="시작일" type="date" value={from} onChange={(event: ChangeEvent<HTMLInputElement>) => setFrom(event.target.value)} sx={inputSx} />
    <Box component="input" aria-label="종료일" type="date" value={to} onChange={(event: ChangeEvent<HTMLInputElement>) => setTo(event.target.value)} sx={inputSx} />
  </>;
}

function MonitoringContent({ feature, selected, onOpen }: { feature?: string; selected?: string; onOpen?: (id: string) => void }) {
  const navigate = useNavigate();
  const queryClient=useQueryClient();
  const summary = useQuery({ queryKey: ['collection-monitoring-summary'], queryFn: getCollectionMonitorSummary, refetchInterval: 60_000 });
  const detailQueryParams = {overview:'1'};
  const detail = useQuery({
    queryKey: ['collection-monitoring-detail', feature, detailQueryParams],
    queryFn: () => getCollectionMonitorDetail(feature ?? '', detailQueryParams),
    enabled: Boolean(feature),
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === feature ? previous : undefined,
    refetchInterval: feature ? 60_000 : false,
  });
  const current = summary.data?.features.find((item) => item.id === feature) ?? featureShell(feature ?? '');

  const body = asRecord(detail.data);
  const dart = asRecord(body.dart);
  const refreshStats = () => {
    void summary.refetch();
    if (feature) {void detail.refetch();void queryClient.refetchQueries({predicate:q=>q.queryKey[0]==='collection-monitor-pages' && q.queryKey[1]===feature && q.queryKey[4]===3,type:'active'});}
  };

  if (!feature) {
    const sourceFeatures = summary.data?.features ?? Object.keys(featureNames).map(featureShell);
    const featureOrder = Object.keys(featureNames);
    const features = [...sourceFeatures].sort((a, b) => {
      const rank = (id: string) => featureOrder.includes(id) ? featureOrder.indexOf(id) : featureOrder.length;
      return rank(a.id) - rank(b.id);
    });
    const generatedAt = summary.data?.generatedAt ?? '';
    
    return <FailedData.Provider value={summary.isError}><PendingData.Provider value={!summary.data}><Box sx={{ pb: '80px' }}>
      <QueryNotice error={summary.isError} retry={() => { void summary.refetch(); }} />
      <SummaryStatus features={features} generatedAt={generatedAt} />
      <Box sx={{ display: 'grid', gap: '4px' }}>
        {features.map(item => <FeatureSummaryCard key={item.id} item={item} selected={selected === item.id} onOpen={() => onOpen ? onOpen(item.id) : navigate('/detail/collection-monitoring/' + item.id)} />)}
      </Box>
      <CollectionBugReportSummary/>
    </Box></PendingData.Provider></FailedData.Provider>;
  }

  const backfill = asRecord(dart.backfill);
  const dartCurrent = asRecord(dart.current);
  const byStatus = asRecord(backfill.byStatus);
  const planned = backfill.planned == null ? null : Number(backfill.planned);
  const hasBackfill = backfill.planned != null;
  const completed = hasBackfill ? Number(backfill.completed??0) : null;
  const isDart = feature === 'dart-financial-statements';
  const isRealtime = feature === 'realtime-prices';
  const stageOneComplete = Boolean(current.backfillCompletedAt) && current.phase === 'CURRENT';
  const stageOneBadge = stageOneComplete ? statusStyle.OK : statusStyle[current.status] ?? unknownStatus;
  const stageOneLabel = stageOneComplete ? (Number(dart.reviewRequired??0)>0?'검토 보류 있음':Number(backfill.supplementPending??0)>0?'원문 보완 필요':Number(byStatus.NOT_DUE??0)>0?'미도래 재확인 예정':Number(backfill.currentTarget??0)===0?'수집 대상 없음':'현재 대상 처리 완료')
    : current.status === 'WAITING' ? (asRecord(current).collectionState === 'DAILY_LIMIT' ? '호출 한도 대기' : '실행 대기') : (statusStyle[current.status]?.label ?? '실행 전');

  const dartCurrentStage = <FailedData.Provider value={summary.isError || detail.isError}><PendingData.Provider value={!summary.data || !detail.data}><DartCurrentStageCard temporaryHistory={Boolean(asRecord(current).temporaryHistory)} collectionState={asRecord(current).collectionState} phase={current.phase ?? 'BACKFILL'} status={current.status} priorityCheckedWithinDay={dartCurrent.priorityCheckedWithinDay == null ? null : Number(dartCurrent.priorityCheckedWithinDay)} universeOver90Days={dartCurrent.universeOver90Days == null ? null : Number(dartCurrent.universeOver90Days)} priorityPending={current.priorityPending == null ? null : Number(current.priorityPending)} universePending={current.universePending == null ? null : Number(current.universePending)} dailyApiCalls={current.dailyApiCalls == null ? null : Number(current.dailyApiCalls)} dailyApiLimit={current.dailyApiLimit == null ? null : Number(current.dailyApiLimit)} companyChecks={current.companyChecks == null ? null : Number(current.companyChecks)} /></PendingData.Provider></FailedData.Provider>;

  return <FailedData.Provider value={summary.isError}><PendingData.Provider value={!summary.data}><Box data-testid="collection-feature-overview" sx={{ px: 0, pt: 0, pb: '80px' }}>
    <QueryNotice error={summary.isError || detail.isError} retry={refreshStats} />
    {isDart ? <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', columnGap: '8px', rowGap: '8px', alignItems: 'stretch' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'block' }}><CurrentStatusCard feature={current} refreshing={summary.isFetching || detail.isFetching} onRefresh={refreshStats} /></Box>
        {stageOneComplete && dartCurrentStage}
        <Box data-testid="monitor-dart-backfill" sx={{ ...cardSx, p: { xs: '4px 8px', sm: '8px 10px' }, minHeight: { xs: 39, sm: 85 } }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1 }}>{stageOneComplete?'1단계 · 과거 자료 수집 결과':'1단계 · 과거 자료 최초 수집'}</Typography>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: stageOneBadge.background, color: stageOneBadge.foreground, minWidth: 78, height: 19, borderRadius: '999px', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}><DataValue width={60}>{stageOneLabel}</DataValue></Box>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}><ManualRefresh refreshing={summary.isFetching || detail.isFetching} onClick={refreshStats} /></Box>
          </Stack>
          <Typography sx={{ color: '#34D399', fontSize: 10, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: 0, sm: 0.5 } }}><FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><DataValue>{numberText(completed)} / {numberText(backfill.currentTarget)}</DataValue></PendingData.Provider></FailedData.Provider>개 현재 대상 처리 완료</Typography>
          <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><CollectionProgress planned={planned} counts={byStatus} supplementPending={Number(backfill.supplementPending??0)} label="전체 과거 자료 진행률" review={Number(dart.reviewRequired??0)}/></PendingData.Provider></FailedData.Provider>
          <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><CollectionProgress planned={dart.priority?.planned??null} counts={asRecord(dart.priority?.byStatus)} supplementPending={Number(dart.priority?.supplementPending??0)} label="우선종목 진행률" review={Number(dart.priority?.reviewRequired??0)} securities={dart.priority?.securities}/></PendingData.Provider></FailedData.Provider>
          <Typography sx={{...mutedText,fontSize:10,mt:'8px'}}>오늘 호출 <DataValue>{numberText(current.dailyApiCalls)} / {numberText(current.dailyApiLimit)}회</DataValue> · <DataValue>{asRecord(current).collectionState==='DAILY_LIMIT'?'일일 한도 도달':'호출 예산 사용 중'}</DataValue></Typography>
        </Box>
        <Typography sx={{...mutedText,fontSize:10,height:28}}>{dart.holidayCalendar && dart.holidayCalendar !== 'AVAILABLE' ? '공휴일 자동 확인 불가 · 주말·야간 및 설정된 휴일 일정 적용' : ''}</Typography>
        {!stageOneComplete && dartCurrentStage}
        <Box sx={{ display: 'block' }}><CountStrip feature={current.id} runId={current.resultScope?.runId} scopeLabel={current.resultScope?.label} target={current.recent.target} success={current.recent.success} failed={current.recent.failed} skipped={current.recent.skipped} /></Box>
        <DartTaskList/>
        <SummaryRecords feature={feature} stream="runs"/>
      </Stack>
      <SummaryRecords feature={feature} stream="items"/>
    </Box> : <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', columnGap: '8px', rowGap: '8px', alignItems: 'stretch' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <CurrentStatusCard feature={current} refreshing={summary.isFetching || detail.isFetching} onRefresh={refreshStats} />
        <CountStrip feature={current.id} runId={current.resultScope?.runId} scopeLabel={current.resultScope?.label} target={current.recent.target} success={current.recent.success} failed={current.recent.failed} skipped={current.recent.skipped} />
        {feature==='investor-trends'&&<InvestorDiagnostics feature={current}/>}
        <Box data-testid="monitor-realtime-diagnostics" sx={{ display: isRealtime ? 'block' : 'none', ...cardSx, p: '8px 9px', minHeight: 94 }}>
          <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '14px' }}>워커 <DataValue>{dateText(current.realtime?.heartbeatAt)}</DataValue> · <DataValue>{current.realtime?.session ?? '세션 기록 없음'}</DataValue></Typography>
          <Typography sx={{ color: '#3D8CF5', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>수신 <DataValue>{dateText(current.realtime?.lastPriceReceivedAt)}</DataValue> · 원천 <DataValue>{dateText(current.realtime?.lastSourcePriceAt)}</DataValue></Typography>
          <Typography sx={{ color: '#3D8CF5', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>SSE <DataValue>{dateText(current.realtime?.lastSsePublishedAt)}</DataValue> · DB <DataValue>{dateText(current.realtime?.lastDbSavedAt)}</DataValue></Typography>
          {[[current.realtime?.sourceError, '원천 가격'], [current.realtime?.publishError, 'SSE 전달'], [current.realtime?.saveError, 'DB 저장']].filter(([message]) => message).map(([message, label]) => <Typography key={label} sx={{ color: '#F26A6F', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}><DataValue width={230}>{label} 오류: {message}</DataValue></Typography>)}
        </Box>
        <SummaryRecords feature={feature} stream="runs"/>
      </Stack>
      <SummaryRecords feature={feature} stream="items"/>
    </Box>}
    </Box></PendingData.Provider></FailedData.Provider>;
}

function CollectionProgress({planned,counts,label,review=0,securities,supplementPending=0}:{planned:number|null;counts:DataRecord;label:string;review?:number;securities?:number;supplementPending?:number}) {
  const pendingData=useContext(PendingData), queryFailed=useContext(FailedData);
  const plan=Math.max(0,planned??0),notDue=Number(counts.NOT_DUE??0),total=plan-notDue;
  const success=Number(counts.SUCCESS??0),noFiling=Number(counts.NO_FILING??0),unavailable=Number(counts.DATA_UNAVAILABLE??0),held=Number(counts.REVIEW_REQUIRED??review),failed=Number(counts.FAILED??0),processing=Number(counts.PROCESSING??0),pending=Number(counts.PENDING??0);
  const done=success+noFiling+unavailable-supplementPending,percent=total?Math.min(100,done*100/total):0;
  const segments=[{name:'수집 성공',count:success,color:'#34D399'},{name:'미공시 확인',count:noFiling,color:'#7A8CA8'},{name:'자료 미제공 (확인 완료)',count:unavailable-supplementPending,color:'#3D8CF5'},{name:'자료 미제공 (보완 필요)',count:supplementPending,color:colors.warning},{name:'실패',count:failed,color:'#F26A6F'},{name:'처리 중',count:processing,color:'#FAB83B'},{name:'검토 보류',count:held,color:colors.warning}];
  const rate=planned==null?'—':!plan?'수집 대상 없음':!total?'전부 미도래':percent.toFixed(1)+'%';
  return <Box sx={{mt:'8px'}}><Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:11,fontWeight:700,mb:'4px'}}><span>{label}{securities != null && !pendingData ? ` (${numberText(securities)}개)` : ''}</span><span><DataValue width={35}>{rate}</DataValue></span></Box>
    <Box role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pendingData||!total?undefined:Number(percent.toFixed(1))} aria-valuetext={pendingData?(queryFailed?'조회 실패':'조회 중'):`현재 대상 ${done} / ${total}개 처리 완료`} sx={{display:'flex',height:8,bgcolor:'#26334A',borderRadius:'8px',overflow:'hidden'}}>{segments.map(item=><Box key={item.name} sx={{width:total?`${item.count/total*100}%`:0,bgcolor:item.color}}/>)}</Box>
    <Typography sx={{fontSize:10,color:'#7A8CA8',mt:'4px'}}>정책 제외를 뺀 전체 계획 {plan.toLocaleString()} · 미도래 {notDue.toLocaleString()}개</Typography>
    <Typography sx={{fontSize:10,color:'#7A8CA8',mt:'4px'}}>현재 처리 대상 기준 {done.toLocaleString()} / {total.toLocaleString()}개 · 대기 {pending.toLocaleString()}개</Typography>
    <Typography sx={{fontSize:10,color:'#34D399',mt:'4px'}}>실제 자료 수집 성공률 {total?(success/total*100).toFixed(1)+'%':'—'}</Typography>
    <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'4px 10px',mt:'4px'}}>{segments.map(item=><Typography key={item.name} sx={{fontSize:10,color:item.color,whiteSpace:'nowrap'}}>{item.name} <DataValue width={20}>{item.count.toLocaleString()}</DataValue></Typography>)}</Box>
    {held>0&&<Typography sx={{fontSize:10,color:colors.warning,mt:'4px',overflowWrap:'anywhere'}}>검토 보류 {held.toLocaleString()}건 · 미해결 유지</Typography>}
  </Box>;
}

export function CollectionMonitoringPage() {
  const tablet=useMediaQuery('(min-width:600px)');
  const {feature,stream}=useParams();
  const navigate=useNavigate();
  if(feature && (stream==='runs'||stream==='items')) return <Box className="rox-home" data-testid={tablet?'T2000-detail':'C2000-detail'}><MonitorListDetail key={`${feature}:${stream}`} feature={feature} stream={stream}/></Box>;
  if(!tablet) return <Box className="rox-home" data-testid="C2000"><MonitoringContent key={feature??'summary'} feature={feature}/></Box>;
  const selected=feature??'security-master';
  return <Box className="rox-home" data-testid="T2000" sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',alignItems:'start'}}>
    <Box sx={{minWidth:0}}><MonitoringContent selected={selected} onOpen={id=>navigate(`/detail/collection-monitoring/${id}`)}/></Box>
    <Box sx={{minWidth:0}}><MonitoringContent key={selected} feature={selected}/></Box>
  </Box>;
}
