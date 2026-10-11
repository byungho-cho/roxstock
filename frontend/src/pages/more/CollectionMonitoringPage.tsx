import '../dashboard/home-font.css';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { ArrowDropDownRounded, FilterListRounded, RefreshRounded } from '@mui/icons-material';
import { Box, Button, CircularProgress, Collapse, FormControl, MenuItem, Select, Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCollectionMonitorDetail, getCollectionMonitorSummary, type CollectionMonitorSummary } from '../../data/roxstockApi';

import { DelayedSkeleton, useDelayedIndicator } from '../../components/common/DelayedSkeleton';

type ApiFeature = CollectionMonitorSummary['features'][number];
type Feature = Pick<ApiFeature, 'id' | 'status'> & Partial<Omit<ApiFeature, 'id' | 'status' | 'recent'>> & { recent: Partial<ApiFeature['recent']> };
type DataRecord = Record<string, any>;

const statusStyle: Record<string, { label: string; background: string; foreground: string }> = {
  OK: { label: '완료', background: '#3D8CF5', foreground: '#050A12' },
  RUNNING: { label: '진행 중', background: '#34D399', foreground: '#050A12' },
  PARTIAL: { label: '일부 실패', background: '#F26A6F', foreground: '#050A12' },
  FAILED: { label: '오류', background: '#F26A6F', foreground: '#050A12' },
  DELAYED: { label: '지연', background: '#FAB83B', foreground: '#050A12' },
  WAITING: { label: '실행 전', background: '#111825', foreground: '#F2F7FC' },
  NOT_CONFIGURED: { label: '설정 누락', background: '#7A8CA8', foreground: '#050A12' },
  NOT_IMPLEMENTED: { label: '미구현', background: '#7A8CA8', foreground: '#050A12' },
  NO_DATA: { label: '데이터 없음', background: '#7A8CA8', foreground: '#050A12' },
  NO_FILING: { label: '미공시', background: '#3D8CF5', foreground: '#050A12' },
  NOT_APPLICABLE: { label: '대상 아님', background: '#7A8CA8', foreground: '#050A12' },
  SUCCESS: { label: '완료', background: '#3D8CF5', foreground: '#050A12' },
  SKIPPED: { label: '건너뜀', background: '#7A8CA8', foreground: '#050A12' },
};
const featureNames: Record<string, string> = {
  'security-master': '종목 마스터',
  'realtime-prices': '실시간 주가',
  'market-prices': '전체 종목 주가',
  'account-snapshots': '일별 계좌 스냅샷',
  'dart-financial-statements': 'DART 재무제표',
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
function Updating() {
  const visible = useDelayedIndicator();
  return <CircularProgress aria-label="갱신 중" size={13} color="inherit" sx={{ visibility: visible ? 'visible' : 'hidden' }} />;
}
function QueryNotice({ error, retry }: { error: boolean; retry: () => void }) {
  return <Box sx={{ height: 24, display: 'flex', alignItems: 'center', gap: 1 }}>
    {error && <><Typography role="alert" sx={{ fontSize: 10, color: '#F26A6F' }}>조회 실패 · 수집기 상태와 별개입니다.</Typography><Button onClick={retry} sx={{ minWidth: 0, p: 0, fontSize: 10 }}>다시 시도</Button></>}
  </Box>;
}
// These descriptors supply fixed titles/layout only. Every data field is hidden by PendingData.
const featureShell = (id: string): Feature => ({ id, name: featureNames[id], status: '', recent: {} });

function StatusPill({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const pending = useContext(PendingData);
  const base = statusStyle[feature.status] ?? unknownStatus;
  const outOfSession = feature.id === 'realtime-prices' && feature.realtime?.session === 'OUT_OF_SESSION' && ['OK', 'WAITING', 'RUNNING'].includes(feature.status);
  const phaseOne = feature.id === 'dart-financial-statements' && feature.phase === 'BACKFILL' && feature.status === 'RUNNING';
  const label = outOfSession ? '장 외 대기' : phaseOne ? '1단계 진행' : base.label;
  const style = outOfSession ? statusStyle.WAITING : base;
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, minWidth: compact ? 75 : 82, height: 19, px: 1, borderRadius: '999px', bgcolor: pending ? 'transparent' : style.background, color: style.foreground, fontSize: 10, lineHeight: 1, fontWeight: 600, whiteSpace: 'nowrap' }}><DataValue width={60}>{label}</DataValue></Box>;
}

function ManualRefresh({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
  return <Button aria-label="통계 새로고침" onClick={onClick} disabled={refreshing} sx={{ minWidth: 20, minHeight: 20, width: 20, height: 20, p: 0, color: '#7A8CA8', flexShrink: 0 }}>
    {refreshing ? <Updating /> : <RefreshRounded sx={{ fontSize: 16 }} />}
  </Button>;
}

function SummaryStatus({ features, generatedAt, refreshing, onRefresh }: { features: Feature[]; generatedAt: string; refreshing: boolean; onRefresh: () => void }) {
  const pending = useContext(PendingData);
  const failed = features.filter((item) => item.status === 'FAILED' || item.status === 'PARTIAL').length;
  const delayed = features.filter((item) => item.status === 'DELAYED').length;
  const unavailable = features.filter((item) => !['OK', 'SUCCESS', 'RUNNING', 'FAILED', 'PARTIAL', 'DELAYED'].includes(item.status)).length;
  const needsAttention = failed + delayed + unavailable;
  const badge = needsAttention ? {
    label: `확인 필요 ${needsAttention}`, background: '#FAB83B', foreground: '#050A12',
  } : { label: '정상', background: '#3D8CF5', foreground: '#050A12' };
  return <Box data-testid="monitor-summary" sx={{ ...cardSx, mx: 0, mt: 0, mb: '7px', px: '12px', py: '12px', minHeight: 74, position: 'relative', boxSizing: 'border-box', borderRadius: '8px', '& > p:first-of-type': { mt: '3px' }, '& > p:last-of-type': { mt: '2px' } }}>
    <Stack direction="row" spacing={0.5} sx={{ minHeight: 20, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1 }}>전체 상태</Typography>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', px: 1.5, width: 82, height: 19, borderRadius: '999px', bgcolor: pending ? 'transparent' : badge.background, color: badge.foreground, fontSize: 10, fontWeight: 600 }}><DataValue width={60}>{badge.label}</DataValue></Box>

    </Stack>
    <Typography sx={{ color: needsAttention ? '#FAB83B' : '#7A8CA8', fontSize: 10, lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      오류 <DataValue width={15}>{failed}</DataValue> · 지연 <DataValue width={15}>{delayed}</DataValue><DataValue>{unavailable > 0 ? ` · 미설정/미구현/미수집 ${unavailable}` : ''}</DataValue>
    </Typography>
    <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
      통계 갱신 <DataValue width={130}>{dateText(generatedAt)}</DataValue>
      <Box component="span" sx={{position:'absolute',right:10,bottom:0}}><ManualRefresh refreshing={refreshing} onClick={onRefresh}/></Box>
    </Typography>
  </Box>;
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
    <Stack direction="row" spacing={0.5} sx={{ height: 19, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, lineHeight: 1.1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Typography>
      <StatusPill feature={item} compact />
    </Stack>
    <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '14px', mt: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {realtime ? '수신' : '시도'} <DataValue width={35}>{clockText(realtime ? item.realtime?.lastPriceReceivedAt : item.lastAttemptAt)}</DataValue> · {realtime ? '저장' : '성공'} <DataValue width={35}>{clockText(realtime ? item.realtime?.lastDbSavedAt : item.lastSuccessAt)}</DataValue>
    </Typography>
    <Typography sx={{ color: '#F2F7FC', fontSize: 10, lineHeight: '12px', mt: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {dart ? <>1단계 <DataValue width={65}>{numberText((item.backfill?.success ?? 0) + (item.backfill?.noFiling ?? 0) + (item.backfill?.notApplicable ?? 0))}/{numberText(item.backfill?.planned)}</DataValue> · 2단계 <DataValue width={35}>{item.phase === 'CURRENT' ? '확인 중' : '대기'}</DataValue></>
        : realtime ? <>수신 <DataValue width={40}>{numberText(item.recent.processed)}</DataValue>건 · 다음 장중</>
        : <><DataValue width={65}>{numberText(item.recent.success)}/{numberText(item.recent.target)}</DataValue>건 성공 · 다음 <DataValue width={35}>{clockText(item.nextAt)}</DataValue></>}
    </Typography>
  </Box>;
}

function CountStrip({ target, success, failed, skipped }: { target?: number; success?: number; failed?: number; skipped?: number }) {
  const values = [
    ['대상', target, '#F2F7FC'],
    ['성공', success, '#F2F7FC'],
    ['실패', failed, failed ? '#F26A6F' : '#F2F7FC'],
    ['건너뜀', skipped, '#F2F7FC'],
  ] as const;
  return <Box sx={{ ...cardSx, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', minHeight: 44, bgcolor: '#0E131F', borderRadius: '8px', px: '4px', py: '3px' }}>
    {values.map(([label, value, color]) => <Stack key={label} spacing={0.15} sx={{ minWidth: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '11px' }}>{label}</Typography>
      <Typography sx={{ color, fontSize: 11, lineHeight: '15px', fontWeight: 600 }}><DataValue width={30}>{numberText(value)}</DataValue></Typography>
    </Stack>)}
  </Box>;
}

function CurrentStatusCard({ feature, onRefresh, refreshing }: { feature: Feature; onRefresh: () => void; refreshing: boolean }) {
  return <Box data-testid="monitor-current" sx={{ ...cardSx, px: '12px', py: '12px', minHeight: feature.id === 'realtime-prices' ? 70 : 55, position: 'relative' }}>
    <Stack direction="row" spacing={0.5} sx={{ height: 20, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1 }}>현재 상태</Typography>
      <StatusPill feature={feature} />

    </Stack>
    {feature.id === 'realtime-prices' ? <><Box sx={{ position: 'absolute', right: 10, bottom: 0 }}><ManualRefresh refreshing={refreshing} onClick={onRefresh} /></Box>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>워커 <DataValue>{dateText(feature.realtime?.heartbeatAt)}</DataValue> · <DataValue>{feature.realtime?.session ?? '세션 기록 없음'}</DataValue></Typography>
      <Typography sx={{ color: '#3D8CF5', fontSize: 10, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>수신 <DataValue width={30}>{clockText(feature.realtime?.lastPriceReceivedAt)}</DataValue> · 발행 <DataValue width={30}>{clockText(feature.realtime?.lastSsePublishedAt)}</DataValue> · 저장 <DataValue width={30}>{clockText(feature.realtime?.lastDbSavedAt)}</DataValue></Typography>
    </> : <>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>시도 <DataValue>{dateText(feature.lastAttemptAt)}</DataValue> · 성공 <DataValue>{dateText(feature.lastSuccessAt)}</DataValue></Typography>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '15px' }}>다음 예정 <DataValue width={40}>{clockText(feature.nextAt)}</DataValue><Box component="span" sx={{position:'absolute',right:10,bottom:0}}><ManualRefresh refreshing={refreshing} onClick={onRefresh}/></Box></Typography>
    </>}
  </Box>;
}

function RunHistory({ runs, loading, feature, filtersOpen, onToggleFilters, showAllRuns, onToggleRuns, filterControls }: {
  runs: DataRecord[]; loading: boolean; feature: string; filtersOpen: boolean; onToggleFilters: () => void; showAllRuns: boolean; onToggleRuns: () => void; filterControls: ReactNode;
}) {
  const pending = useContext(PendingData);
  const visibleRuns = showAllRuns ? runs : runs.slice(0, 2);
  return <Box sx={{ ...cardSx, bgcolor: 'transparent', border: 0, p: '0 12px' }}>
    <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1 }}>실행 이력</Typography>{loading && !pending && <Updating />}
      <Button onClick={onToggleFilters} startIcon={<FilterListRounded sx={{ fontSize: '13px !important' }} />} endIcon={<ArrowDropDownRounded sx={{ fontSize: '15px !important' }} />} sx={{ minWidth: 0, minHeight: 20, height: 20, p: 0, color: '#7A8CA8', fontSize: 10, lineHeight: 1 }}>
        필터
      </Button>
      {runs.length > 2 && <Button onClick={onToggleRuns} sx={{ minWidth: 0, minHeight: 20, height: 20, p: 0, color: '#7A8CA8', fontSize: 10 }}>{showAllRuns ? '최근 실행' : '전체 기록'}</Button>}
    </Stack>
    <Collapse in={filtersOpen} unmountOnExit>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', sm: '1fr' }, gap: 0.5, mb: 1 }}>{filterControls}</Box>
    </Collapse>
    <Box data-testid="monitor-history-data" sx={{ height: 96, overflowY: 'auto' }}>
    {pending ? <Stack spacing={1}><DataValue width={200} /><DataValue width={240} /></Stack> : visibleRuns.length ? <Stack spacing={0.35}>{visibleRuns.map((run) => {
      const status = statusStyle[String(run.status)] ?? unknownStatus;
      const metadata = asRecord(run.metadata);
      return <Box key={run.id} sx={{ minWidth: 0, py: 0.25 }}>
        <Typography sx={{ color: '#7A8CA8', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>
          {dateText(run.startedAt)} · {feature === 'dart-financial-statements' ? (metadata.phase === 'BACKFILL' ? '1단계 과거 수집' : '2단계 현행 수집') : status.label}
        </Typography>
        <Typography sx={{ color: '#7A8CA8', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>
          대상 {numberText(run.target)} · 성공 {numberText(run.success)} · 실패 {numberText(run.failed)} · 건너뜀 {numberText(run.skipped)}
        </Typography>
        {run.failureReason && <Typography sx={{ color: '#F26A6F', fontSize: 10, lineHeight: '14px', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{run.failureReason}</Typography>}
      </Box>;
    })}</Stack> : <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '18px' }}>실행 이력이 없습니다.</Typography>}
    </Box>
  </Box>;
}

function TargetResults({ items, runs }: { items: DataRecord[]; runs: DataRecord[] }) {
  const pending = useContext(PendingData);
  const fallbacks: DataRecord[] = runs.filter((run) => run.failureReason).slice(0, 3).map((run) => ({ symbol: '실행 오류', status: run.status, reason: run.failureReason, occurredAt: run.startedAt }));
  const entries = items.length ? items.slice(0, 100) : fallbacks;
  return <Box sx={{ ...cardSx, bgcolor: 'transparent', border: 0, display: 'flex', flexDirection: 'column', p: '0 12px', minHeight: 116 }}>
    <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center', borderBottom: '1px solid #26334A', pb: '3px' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1 }}>대상별 상태</Typography>
      <Typography sx={{ ...mutedText, fontSize: 10 }}>확인 <DataValue width={24}>{numberText(entries.length)}</DataValue></Typography>
    </Stack>
    <Box data-testid="monitor-results-data" sx={{ height: 120, overflowY: 'auto' }}>
    {pending ? <Stack spacing={1}><DataValue width={180} /><DataValue width={220} /></Stack> : entries.length ? <Stack spacing={0} sx={{ minWidth: 0, flex: 1 }}>
      {entries.map((item, index) => {
        const resultStyle = statusStyle[String(item.status)] ?? unknownStatus;
        const title = item.security?.name ?? item.symbol ?? '대상';
        const outcome = item.reason ?? resultStyle.label;
        return <Box key={`${item.symbol ?? 'result'}-${index}`} sx={{ py: '3px', minWidth: 0, borderBottom: index === entries.length - 1 ? 0 : '1px solid #26334A' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline' }}>
            <Typography sx={{ color: resultStyle.background, fontSize: 10, fontWeight: 500, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</Typography>
            <Typography sx={{ color: resultStyle.background, fontSize: 10, flexShrink: 0 }}>{resultStyle.label}</Typography>
          </Stack>
          <Box sx={{pl:'8px',position:'relative',minHeight:20}}><Typography sx={{color:'#7A8CA8',fontSize:10,lineHeight:'20px'}}>실행시간 : {dateText(item.occurredAt)}</Typography>{item.reason&&item.reason!==resultStyle.label&&<Box component="details" sx={{mt:'-20px',fontSize:10,color:'#7A8CA8'}}><Box component="summary" sx={{cursor:'pointer',textAlign:'right',listStyle:'none',height:20,lineHeight:'20px'}}>상세내용 ›</Box><Typography sx={{fontSize:10,py:'4px',overflowWrap:'anywhere'}}>{outcome}</Typography></Box>}</Box>
        </Box>;
      })}
    </Stack> : <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><Typography sx={{ ...mutedText, fontSize: 10 }}>확인할 대상 결과가 없습니다.</Typography></Box>}
    </Box>
    <Box sx={{ bgcolor: '#111825', borderRadius: '6px', px: '8px', py: '3px', mt: 1 }}>
      <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '12px' }}>갱신 중에도 마지막 완료 결과를 유지합니다.</Typography>
    </Box>
  </Box>;
}

function DartCurrentStageCard({ phase, status, priorityCheckedWithinDay, universeOver90Days, priorityPending, universePending, dailyApiCalls, dailyApiLimit, companyChecks }: {
  phase: string; status: string; priorityCheckedWithinDay: number | null; universeOver90Days: number | null; priorityPending: number | null; universePending: number | null; dailyApiCalls: number | null; dailyApiLimit: number | null; companyChecks: number | null;
}) {
  const disabled = phase !== 'CURRENT';
  const statusInfo = statusStyle[status] ?? unknownStatus;
  const label = !['OK','SUCCESS','RUNNING','WAITING'].includes(status)
    ? statusInfo.label
    : disabled ? '1단계 후 대기' : status === 'RUNNING' ? '진행 중' : '상시 수집';
  const badge = !['OK','SUCCESS','RUNNING','WAITING'].includes(status)
    ? statusInfo : disabled ? statusStyle.WAITING : status === 'RUNNING' ? statusStyle.RUNNING : statusStyle.OK;
  return <Box sx={{ ...cardSx, p: '12px', minHeight: 55, opacity: disabled ? 0.86 : 1 }}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>2단계 · 현재 사업연도 상시 수집</Typography>
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: badge.background, color: badge.foreground, borderRadius: '999px', minWidth: 76, px: 1, height: 19, justifyContent: 'center', alignItems: 'center', fontSize: 12, fontWeight: 600 }}><DataValue width={65}>{label}</DataValue></Box>
    </Stack>
    <Typography sx={{ color: disabled ? '#7A8CA8' : '#3D8CF5', fontSize: 10, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: 0, sm: 0.5 } }}><DataValue width={240}>
      {disabled ? status === 'NOT_CONFIGURED' ? '설정 후 1단계 완료 시 시작' : status === 'NOT_IMPLEMENTED' ? '수집기 배포 후 1단계 완료 시 시작' : '1단계 완료 후 자동 시작' : '우선종목 하루 1회 · 전체종목 약 3개월 순환'}
    </DataValue></Typography>
    <Typography sx={{ display: { xs: 'none', sm: 'block' }, ...mutedText, fontSize: 10, lineHeight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><DataValue width={240}>
      {disabled ? '현행 공시 확인은 과거 자료 구축 완료 후 시작합니다.' : `우선 확인 ${numberText(priorityCheckedWithinDay)} · 전체 지연 ${numberText(universeOver90Days)}`}
    </DataValue></Typography>
    <Typography sx={{ display: { xs: 'none', sm: 'block' }, ...mutedText, fontSize: 10, lineHeight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>API <DataValue width={42}>{numberText(dailyApiCalls)}/{numberText(dailyApiLimit)}</DataValue> · 종목 확인 <DataValue width={20}>{numberText(companyChecks)}</DataValue> · 우선 대기 <DataValue width={20}>{numberText(priorityPending)}</DataValue> · 전체 대기 <DataValue width={20}>{numberText(universePending)}</DataValue></Typography>
  </Box>;
}

function CollectionFilters({ feature, resultFilter, setResultFilter, phaseFilter, setPhaseFilter, symbolFilter, setSymbolFilter, marketFilter, setMarketFilter, accountFilter, setAccountFilter, from, setFrom, to, setTo }: {
  feature: string; resultFilter: string; setResultFilter: (value: string) => void; phaseFilter: string; setPhaseFilter: (value: string) => void;
  symbolFilter: string; setSymbolFilter: (value: string) => void; marketFilter: string; setMarketFilter: (value: string) => void;
  accountFilter: string; setAccountFilter: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void;
}) {
  const selectSx = { height: 30, color: '#CBD5E1', fontSize: 10, bgcolor: '#0B1220', borderRadius: '6px', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#26334A' }, '& .MuiSelect-select': { py: '5px', pl: '8px' }, minWidth: 0 };
  const inputSx = { width: '100%', minWidth: 0, height: 30, boxSizing: 'border-box', bgcolor: '#0B1220', color: '#E8EDF7', border: '1px solid #26334A', borderRadius: '6px', px: '7px', fontSize: 10, outline: 'none', colorScheme: 'dark' };
  return <>
    <FormControl size="small"><Select<string> value={resultFilter} displayEmpty onChange={(event) => setResultFilter(event.target.value)} aria-label="결과 필터" sx={selectSx}><MenuItem value="">전체 결과</MenuItem>{['SUCCESS','PARTIAL','FAILED','SKIPPED'].map((value) => <MenuItem key={value} value={value}>{statusStyle[value]?.label ?? value}</MenuItem>)}</Select></FormControl>
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
  const [resultFilter, setResultFilter] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [marketFilter, setMarketFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const summary = useQuery({ queryKey: ['collection-monitoring-summary'], queryFn: getCollectionMonitorSummary, refetchInterval: 60_000 });
  const detailQueryParams = useMemo(() => ({
    ...(resultFilter && { result: resultFilter }), ...(phaseFilter && { phase: phaseFilter }),
    ...(symbolFilter && { symbol: symbolFilter }), ...(marketFilter && { market: marketFilter }),
    ...(accountFilter && { accountId: accountFilter }), ...(from && { from }), ...(to && { to }),
  }), [resultFilter, phaseFilter, symbolFilter, marketFilter, accountFilter, from, to]);
  const detail = useQuery({
    queryKey: ['collection-monitoring-detail', feature, detailQueryParams],
    queryFn: () => getCollectionMonitorDetail(feature ?? '', detailQueryParams),
    enabled: Boolean(feature),
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === feature ? previous : undefined,
    refetchInterval: feature ? 60_000 : false,
  });
  const current = summary.data?.features.find((item) => item.id === feature) ?? featureShell(feature ?? '');

  const body = asRecord(detail.data);
  const runs = Array.isArray(body.runs) ? body.runs as DataRecord[] : [];
  const items = Array.isArray(body.items) ? body.items as DataRecord[] : [];
  const dart = asRecord(body.dart);
  const refreshStats = () => {
    void summary.refetch();
    if (feature) void detail.refetch();
  };
  const filterControls = <CollectionFilters
    feature={feature ?? ''} resultFilter={resultFilter} setResultFilter={setResultFilter}
    phaseFilter={phaseFilter} setPhaseFilter={setPhaseFilter} symbolFilter={symbolFilter} setSymbolFilter={setSymbolFilter}
    marketFilter={marketFilter} setMarketFilter={setMarketFilter} accountFilter={accountFilter} setAccountFilter={setAccountFilter}
    from={from} setFrom={setFrom} to={to} setTo={setTo}
  />;

  if (!feature) {
    const features = summary.data?.features ?? Object.keys(featureNames).map(featureShell);
    const generatedAt = summary.data?.generatedAt ?? '';
    
    return <FailedData.Provider value={summary.isError}><PendingData.Provider value={!summary.data}><Box sx={{ pb: '80px' }}>
      <QueryNotice error={summary.isError} retry={() => { void summary.refetch(); }} />
      <SummaryStatus features={features} generatedAt={generatedAt} refreshing={summary.isFetching} onRefresh={() => { void summary.refetch(); }} />
      <Box sx={{ display: 'grid', gap: '4px' }}>
        {features.map(item => <FeatureSummaryCard key={item.id} item={item} selected={selected === item.id} onOpen={() => onOpen ? onOpen(item.id) : navigate('/detail/collection-monitoring/' + item.id)} />)}
      </Box>
    </Box></PendingData.Provider></FailedData.Provider>;
  }

  const backfill = asRecord(dart.backfill);
  const dartCurrent = asRecord(dart.current);
  const byStatus = asRecord(backfill.byStatus);
  const planned = backfill.planned == null ? null : Number(backfill.planned);
  const hasBackfill = backfill.planned != null;
  const success = hasBackfill ? Number(byStatus.SUCCESS ?? 0) : null;
  const noFiling = hasBackfill ? Number(byStatus.NO_FILING ?? 0) : null;
  const notApplicable = hasBackfill ? Number(byStatus.NOT_APPLICABLE ?? 0) : null;
  const failed = hasBackfill ? Number(byStatus.FAILED ?? 0) : null;
  const pending = hasBackfill ? Number(byStatus.PENDING ?? 0) + Number(byStatus.PROCESSING ?? 0) : null;
  const completed = hasBackfill ? (success ?? 0) + (noFiling ?? 0) + (notApplicable ?? 0) : null;
  const isDart = feature === 'dart-financial-statements';
  const isRealtime = feature === 'realtime-prices';
  const stageOneComplete = Boolean(current.backfillCompletedAt) && current.phase === 'CURRENT';
  const stageOneBadge = stageOneComplete ? statusStyle.OK : statusStyle[current.status] ?? unknownStatus;
  const stageOneLabel = stageOneComplete ? '완료'
    : current.status === 'WAITING' ? (asRecord(current).collectionState === 'DAILY_LIMIT' ? '호출 한도 대기' : '실행 대기') : (statusStyle[current.status]?.label ?? '실행 전');

  return <FailedData.Provider value={summary.isError}><PendingData.Provider value={!summary.data}><Box sx={{ px: 0, pt: 0, pb: '80px' }}>
    <QueryNotice error={summary.isError || detail.isError} retry={refreshStats} />
    {isDart ? <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', columnGap: '8px', rowGap: '8px', alignItems: 'stretch' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'block' }}><CurrentStatusCard feature={current} refreshing={summary.isFetching || detail.isFetching} onRefresh={refreshStats} /></Box>
        <Box sx={{ ...cardSx, p: { xs: '4px 8px', sm: '8px 10px' }, minHeight: { xs: 39, sm: 85 } }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography sx={{ color: '#F2F7FC', fontSize: 12, fontWeight: 600, flex: 1 }}>1단계 · 과거 자료 최초 수집</Typography>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: stageOneBadge.background, color: stageOneBadge.foreground, minWidth: 78, height: 19, borderRadius: '999px', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}><DataValue width={60}>{stageOneLabel}</DataValue></Box>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}><ManualRefresh refreshing={summary.isFetching || detail.isFetching} onClick={refreshStats} /></Box>
          </Stack>
          <Typography sx={{ color: '#34D399', fontSize: 10, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: 0, sm: 0.5 } }}><FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><DataValue>{numberText(completed)} / {numberText(planned)}</DataValue></PendingData.Provider></FailedData.Provider>개 작업 완료</Typography>
          <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><CollectionProgress planned={planned} counts={byStatus} label="전체 과거 자료 진행률" review={Number(dart.reviewRequired??0)}/></PendingData.Provider></FailedData.Provider>
          <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><CollectionProgress planned={dart.priority?.planned??null} counts={asRecord(dart.priority?.byStatus)} label="우선종목 진행률" securities={dart.priority?.securities}/></PendingData.Provider></FailedData.Provider>
          <Typography sx={{...mutedText,fontSize:10,mt:'8px'}}>오늘 호출 <DataValue>{numberText(current.dailyApiCalls)} / {numberText(current.dailyApiLimit)}회</DataValue> · <DataValue>{asRecord(current).collectionState==='DAILY_LIMIT'?'일일 한도 도달':'호출 예산 사용 중'}</DataValue></Typography>
        </Box>
        <Typography sx={{...mutedText,fontSize:10,height:28}}>{dart.holidayCalendar && dart.holidayCalendar !== 'AVAILABLE' ? '공휴일 자동 확인 불가 · 주말·야간 및 설정된 휴일 일정 적용' : ''}</Typography>
        <FailedData.Provider value={summary.isError || detail.isError}><PendingData.Provider value={!summary.data || !detail.data}><DartCurrentStageCard phase={current.phase ?? 'BACKFILL'} status={current.status} priorityCheckedWithinDay={dartCurrent.priorityCheckedWithinDay == null ? null : Number(dartCurrent.priorityCheckedWithinDay)} universeOver90Days={dartCurrent.universeOver90Days == null ? null : Number(dartCurrent.universeOver90Days)} priorityPending={current.priorityPending == null ? null : Number(current.priorityPending)} universePending={current.universePending == null ? null : Number(current.universePending)} dailyApiCalls={current.dailyApiCalls == null ? null : Number(current.dailyApiCalls)} dailyApiLimit={current.dailyApiLimit == null ? null : Number(current.dailyApiLimit)} companyChecks={current.companyChecks == null ? null : Number(current.companyChecks)} /></PendingData.Provider></FailedData.Provider>
        <Box sx={{ display: 'block' }}><CountStrip target={current.recent.target} success={current.recent.success} failed={current.recent.failed} skipped={current.recent.skipped} /></Box>
        <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><RunHistory runs={runs} loading={detail.isFetching} feature={feature} filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((value) => !value)} showAllRuns={showAllRuns} onToggleRuns={() => setShowAllRuns((value) => !value)} filterControls={filterControls} /></PendingData.Provider></FailedData.Provider>
      </Stack>
      <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><TargetResults items={items} runs={runs} /></PendingData.Provider></FailedData.Provider>
    </Box> : <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', columnGap: '8px', rowGap: '8px', alignItems: 'stretch' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <CurrentStatusCard feature={current} refreshing={summary.isFetching || detail.isFetching} onRefresh={refreshStats} />
        <CountStrip target={current.recent.target} success={current.recent.success} failed={current.recent.failed} skipped={current.recent.skipped} />
        <Box sx={{ display: isRealtime ? 'block' : 'none', ...cardSx, p: '8px 9px', height: 94, overflowY: 'auto' }}>
          <Typography sx={{ ...mutedText, fontSize: 10, lineHeight: '14px' }}>워커 <DataValue>{dateText(current.realtime?.heartbeatAt)}</DataValue> · <DataValue>{current.realtime?.session ?? '세션 기록 없음'}</DataValue></Typography>
          <Typography sx={{ color: '#3D8CF5', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>수신 <DataValue>{dateText(current.realtime?.lastPriceReceivedAt)}</DataValue> · 원천 <DataValue>{dateText(current.realtime?.lastSourcePriceAt)}</DataValue></Typography>
          <Typography sx={{ color: '#3D8CF5', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}>SSE <DataValue>{dateText(current.realtime?.lastSsePublishedAt)}</DataValue> · DB <DataValue>{dateText(current.realtime?.lastDbSavedAt)}</DataValue></Typography>
          {[[current.realtime?.sourceError, '원천 가격'], [current.realtime?.publishError, 'SSE 전달'], [current.realtime?.saveError, 'DB 저장']].filter(([message]) => message).map(([message, label]) => <Typography key={label} sx={{ color: '#F26A6F', fontSize: 10, lineHeight: '14px', overflowWrap: 'anywhere' }}><DataValue width={230}>{label} 오류: {message}</DataValue></Typography>)}
        </Box>
        <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><RunHistory runs={runs} loading={detail.isFetching} feature={feature} filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((value) => !value)} showAllRuns={showAllRuns} onToggleRuns={() => setShowAllRuns((value) => !value)} filterControls={filterControls} /></PendingData.Provider></FailedData.Provider>
      </Stack>
      <FailedData.Provider value={detail.isError}><PendingData.Provider value={!detail.data}><TargetResults items={items} runs={runs} /></PendingData.Provider></FailedData.Provider>
    </Box>}
    </Box></PendingData.Provider></FailedData.Provider>;
}

function CollectionProgress({planned,counts,label,review=0,securities}:{planned:number|null;counts:DataRecord;label:string;review?:number;securities?:number}) {
  const pendingData=useContext(PendingData);
  const total=Math.max(0,planned??0),success=Number(counts.SUCCESS??0),missing=Number(counts.NO_FILING??0)+Number(counts.NOT_APPLICABLE??0),failed=Number(counts.FAILED??0),processing=Number(counts.PROCESSING??0),pending=Number(counts.PENDING??0);
  const done=success+missing,percent=total?Math.min(100,done*100/total):0;
  const segments=[{name:'성공',count:success,color:'#34D399'},{name:'미공시·대상 아님',count:missing,color:'#7A8CA8'},{name:'실패',count:failed,color:'#F26A6F'},{name:'처리 중',count:processing,color:'#FAB83B'}];
  return <Box sx={{mt:'8px'}}><Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:11,fontWeight:700,mb:'4px'}}><span>{label}{securities != null && !pendingData ? ` (${numberText(securities)}개)` : ''}</span><span><DataValue width={35}>{planned==null?'—':percent.toFixed(1)+'%'}</DataValue></span></Box>
    <Box role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pendingData || planned==null ? undefined : Number(percent.toFixed(1))} aria-valuetext={pendingData ? '조회 중' : `${done.toLocaleString()} / ${total.toLocaleString()}개 완료`} sx={{display:'flex',height:8,bgcolor:'#26334A',borderRadius:'8px',overflow:'hidden'}}>{segments.map(item=><Box key={item.name} sx={{width:total?`${item.count/total*100}%`:0,bgcolor:item.color,transition:'width 250ms ease'}}/>)}</Box>
    <Typography sx={{fontSize:10,color:'#7A8CA8',mt:'4px'}}>완료 <DataValue width={70}>{done.toLocaleString()} / {planned==null?'—':total.toLocaleString()}</DataValue>개 · 대기 <DataValue width={25}>{pending.toLocaleString()}</DataValue></Typography>
    <Box sx={{display:'flex',flexWrap:'wrap',gap:'4px 10px',mt:'4px'}}>{segments.map(item=><Typography key={item.name} sx={{fontSize:10,color:item.color}}>{item.name} <DataValue width={20}>{item.count.toLocaleString()}</DataValue></Typography>)}</Box>
    <Typography sx={{fontSize:10,color:'#F26A6F',mt:'4px',height:28,overflowY:'auto'}}>{!pendingData && review>0 ? `검토 필요 ${review.toLocaleString()}건 · 자동 재시도 중단, 완료에 포함하지 않음` : ''}</Typography>
  </Box>;
}

export function CollectionMonitoringPage() {
  const tablet = useMediaQuery('(min-width:600px)');
  const { feature } = useParams();
  const [selected, setSelected] = useState(feature ?? 'security-master');
  const leftRef = useRef<HTMLDivElement>(null), rightRef = useRef<HTMLDivElement>(null);
  const choose = (id: string) => { setSelected(id); rightRef.current?.scrollTo({ top: 0 }); };
  if (!tablet) return <Box className="rox-home" data-testid="C2000"><MonitoringContent key={feature ?? 'summary'} feature={feature} /></Box>;
  return <Box className="rox-home" data-testid="T2000" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px', height: '100%', minHeight: 0 }}>
    <Box ref={leftRef} data-scroll-region="monitoring-list" sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}><MonitoringContent selected={selected} onOpen={choose} /></Box>
    <Box ref={rightRef} data-scroll-region="monitoring-detail" sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}><MonitoringContent key={selected} feature={selected} /></Box>
    <OverlayRegionScrollbar scrollRef={leftRef} label="수집 목록 스크롤" offset={0} />
    <OverlayRegionScrollbar scrollRef={rightRef} label="수집 상세 스크롤" offset={0} />
  </Box>;
}

