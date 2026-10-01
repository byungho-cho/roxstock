import { ArrowDropDownRounded, FilterListRounded, RefreshRounded } from '@mui/icons-material';
import { Box, Button, CircularProgress, Collapse, FormControl, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCollectionMonitorDetail, getCollectionMonitorSummary, type CollectionMonitorSummary } from '../../data/roxstockApi';

type Feature = CollectionMonitorSummary['features'][number];
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
  ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '기록 없음';
const clockText = (value?: string | null) => value
  ? new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
  : '미정';
const numberText = (value?: number | null) => value == null ? '—' : value.toLocaleString('ko-KR');
const asRecord = (value: unknown): DataRecord => value && typeof value === 'object' ? value as DataRecord : {};
const mutedText = { color: '#7A8CA8' };
const cardSx = { bgcolor: '#0E131F', border: '1px solid #26334A', borderRadius: '8px', minWidth: 0 };

function StatusPill({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const base = statusStyle[feature.status] ?? statusStyle.WAITING;
  const outOfSession = feature.id === 'realtime-prices' && feature.realtime?.session === 'OUT_OF_SESSION' && ['OK', 'WAITING', 'RUNNING'].includes(feature.status);
  const phaseOne = feature.id === 'dart-financial-statements' && feature.phase === 'BACKFILL' && feature.status === 'RUNNING';
  const label = outOfSession ? '장 외 대기' : phaseOne ? '1단계 진행' : base.label;
  const style = outOfSession ? statusStyle.WAITING : base;
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, minWidth: compact ? 75 : 82, height: compact ? 19 : 20, px: 1, borderRadius: '999px', bgcolor: style.background, color: style.foreground, fontSize: 9, lineHeight: 1, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</Box>;
}

function ManualRefresh({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
  return <Button aria-label="통계 새로고침" onClick={onClick} disabled={refreshing} sx={{ minWidth: 20, minHeight: 20, width: 20, height: 20, p: 0, color: '#7A8CA8', flexShrink: 0 }}>
    {refreshing ? <CircularProgress size={13} color="inherit" /> : <RefreshRounded sx={{ fontSize: 16 }} />}
  </Button>;
}

function SummaryStatus({ features, generatedAt, refreshing, onRefresh }: { features: Feature[]; generatedAt: string; refreshing: boolean; onRefresh: () => void }) {
  const failed = features.filter((item) => item.status === 'FAILED' || item.status === 'PARTIAL').length;
  const delayed = features.filter((item) => item.status === 'DELAYED').length;
  const unavailable = features.filter((item) => ['NOT_CONFIGURED', 'NOT_IMPLEMENTED', 'NO_DATA'].includes(item.status)).length;
  const needsAttention = failed + delayed + unavailable;
  const badge = needsAttention ? {
    label: `확인 필요 ${needsAttention}`, background: '#FAB83B', foreground: '#050A12',
  } : { label: '정상', background: '#3D8CF5', foreground: '#050A12' };
  return <Box sx={{ ...cardSx, mx: '16px', mt: '7px', mb: '8px', px: '10px', py: '5px', height: { xs: 58, sm: 48 }, borderRadius: '8px', '& > p:first-of-type': { mt: '3px' }, '& > p:last-of-type': { mt: '2px' } }}>
    <Stack direction="row" spacing={0.5} sx={{ minHeight: 20, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 11, fontWeight: 700, flex: 1 }}>전체 상태</Typography>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', px: 1.5, minWidth: 82, height: 19, borderRadius: '999px', bgcolor: badge.background, color: badge.foreground, fontSize: 9, fontWeight: 700 }}>{badge.label}</Box>
      <ManualRefresh refreshing={refreshing} onClick={onRefresh} />
    </Stack>
    <Typography sx={{ color: needsAttention ? '#FAB83B' : '#7A8CA8', fontSize: 9, lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      오류 {failed} · 지연 {delayed}{unavailable > 0 ? ` · 미설정/미구현/미수집 ${unavailable}` : ''}{refreshing ? '  ·  갱신 중' : ''}
    </Typography>
    <Typography sx={{ ...mutedText, fontSize: 9, lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: { xs: 'block', sm: 'none' } }}>
      {refreshing ? `${clockText(generatedAt)} 기준 완료 데이터 유지` : `통계 갱신 ${dateText(generatedAt)}`}
    </Typography>
  </Box>;
}

function FeatureSummaryCard({ item, onOpen }: { item: Feature; onOpen: () => void }) {
  const name = featureNames[item.id] ?? item.name;
  const dart = item.id === 'dart-financial-statements';
  const realtime = item.id === 'realtime-prices';
  const secondLine = dart
    ? `1단계 ${numberText((item.backfill?.success ?? 0) + (item.backfill?.noFiling ?? 0) + (item.backfill?.notApplicable ?? 0))}/${numberText(item.backfill?.planned)} · 2단계 ${item.phase === 'CURRENT' ? '확인 중' : '대기'}`
    : realtime
      ? `수신 ${numberText(item.recent.processed)}건 · 다음 장중`
      : `${numberText(item.recent.success)}/${numberText(item.recent.target)}건 성공 · 다음 ${clockText(item.nextAt)}`;
  const attemptLine = realtime
    ? `수신 ${clockText(item.realtime?.lastPriceReceivedAt)} · 저장 ${clockText(item.realtime?.lastDbSavedAt)}`
    : `시도 ${clockText(item.lastAttemptAt)} · 성공 ${clockText(item.lastSuccessAt)}`;
  return <Box
    role="link"
    tabIndex={0}
    aria-label={`${name} 상세 보기`}
    onClick={onOpen}
    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}
    sx={{ ...cardSx, display: 'block', textAlign: 'left', cursor: 'pointer', textDecoration: 'none', p: '4px 9px', height: { xs: 55, sm: dart ? 98 : 66 }, overflow: 'hidden', '&:hover': { borderColor: '#456186' }, '&:focus-visible': { outline: '2px solid #3D8CF5', outlineOffset: 1 } }}
  >
    <Stack direction="row" spacing={0.5} sx={{ height: 19, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 10, fontWeight: 700, lineHeight: 1.1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Typography>
      <StatusPill feature={item} compact />
    </Stack>
    <Typography sx={{ ...mutedText, fontSize: 9, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: '1px', sm: '3px' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attemptLine}</Typography>
    {dart && <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: '1fr 1fr', columnGap: 1, mt: 0.5 }}>
      <Typography sx={{ color: '#34D399', fontSize: 9, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>1단계 · {secondLine.split(' · ')[0]}</Typography>
      <Typography sx={{ color: '#3D8CF5', fontSize: 9, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>2단계 · {item.phase === 'CURRENT' ? '현행 공시 확인' : '1단계 완료 후 대기'}</Typography>
      <Typography sx={{ ...mutedText, fontSize: 8, lineHeight: '12px', gridColumn: '1 / -1' }}>대상 {numberText(item.recent.target)} · 성공 {numberText(item.recent.success)} · 실패 {numberText(item.recent.failed)} · API {numberText(item.dailyApiCalls)}/{numberText(item.dailyApiLimit)}</Typography>
    </Box>}
    <Typography sx={{ ...mutedText, color: '#F2F7FC', fontSize: 9, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: '1px', sm: '3px' }, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: { xs: 'block', sm: dart ? 'none' : 'block' } }}>{secondLine}</Typography>
  </Box>;
}

function CountStrip({ target, success, failed, skipped }: { target?: number; success?: number; failed?: number; skipped?: number }) {
  const values = [
    ['대상', target, '#F2F7FC'],
    ['성공', success, '#F2F7FC'],
    ['실패', failed, failed ? '#F26A6F' : '#F2F7FC'],
    ['건너뜀', skipped, '#F2F7FC'],
  ] as const;
  return <Box sx={{ ...cardSx, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', height: 42, bgcolor: '#0E131F', borderRadius: '8px', px: '4px', py: '3px' }}>
    {values.map(([label, value, color]) => <Stack key={label} spacing={0.15} sx={{ minWidth: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Typography sx={{ ...mutedText, fontSize: 8, lineHeight: '11px' }}>{label}</Typography>
      <Typography sx={{ color, fontSize: 11, lineHeight: '15px', fontWeight: 700 }}>{numberText(value)}</Typography>
    </Stack>)}
  </Box>;
}

function CurrentStatusCard({ feature, onRefresh, refreshing }: { feature: Feature; onRefresh: () => void; refreshing: boolean }) {
  return <Box sx={{ ...cardSx, px: '9px', py: '4px', minHeight: { xs: feature.id === 'realtime-prices' ? 70 : 55, sm: 62 } }}>
    <Stack direction="row" spacing={0.5} sx={{ height: 20, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 10, fontWeight: 700, flex: 1 }}>현재 상태</Typography>
      <StatusPill feature={feature} />
      <ManualRefresh refreshing={refreshing} onClick={onRefresh} />
    </Stack>
    {feature.id === 'realtime-prices' ? <>
      <Typography sx={{ ...mutedText, fontSize: 9, lineHeight: '18px', overflowWrap: 'anywhere' }}>워커 {dateText(feature.realtime?.heartbeatAt)} · {feature.realtime?.session ?? '세션 기록 없음'}</Typography>
      <Typography sx={{ color: '#3D8CF5', fontSize: 9, lineHeight: '18px', overflowWrap: 'anywhere' }}>수신 {clockText(feature.realtime?.lastPriceReceivedAt)} · 발행 {clockText(feature.realtime?.lastSsePublishedAt)} · 저장 {clockText(feature.realtime?.lastDbSavedAt)}</Typography>
    </> : <>
      <Typography sx={{ ...mutedText, fontSize: 9, lineHeight: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>시도 {dateText(feature.lastAttemptAt)} · 성공 {dateText(feature.lastSuccessAt)}</Typography>
      <Typography sx={{ ...mutedText, fontSize: 9, lineHeight: '15px' }}>다음 예정 {clockText(feature.nextAt)}</Typography>
    </>}
  </Box>;
}

function RunHistory({ runs, loading, feature, filtersOpen, onToggleFilters, showAllRuns, onToggleRuns, filterControls }: {
  runs: DataRecord[]; loading: boolean; feature: string; filtersOpen: boolean; onToggleFilters: () => void; showAllRuns: boolean; onToggleRuns: () => void; filterControls: ReactNode;
}) {
  const visibleRuns = showAllRuns ? runs : runs.slice(0, 2);
  return <Box sx={{ ...cardSx, bgcolor: { xs: 'transparent', sm: cardSx.bgcolor }, border: { xs: 0, sm: cardSx.border }, p: { xs: 0, sm: '8px' }, minHeight: { sm: 94 } }}>
    <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 10, fontWeight: 700, flex: 1 }}>실행 이력</Typography>
      <Button onClick={onToggleFilters} startIcon={<FilterListRounded sx={{ fontSize: '13px !important' }} />} endIcon={<ArrowDropDownRounded sx={{ fontSize: '15px !important' }} />} sx={{ minWidth: 0, minHeight: 20, height: 20, p: 0, color: '#7A8CA8', fontSize: 8, lineHeight: 1 }}>
        필터
      </Button>
      {runs.length > 2 && <Button onClick={onToggleRuns} sx={{ minWidth: 0, minHeight: 20, height: 20, p: 0, color: '#7A8CA8', fontSize: 8 }}>{showAllRuns ? '최근 실행' : '전체 기록'}</Button>}
    </Stack>
    <Collapse in={filtersOpen} unmountOnExit>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', sm: '1fr' }, gap: 0.5, mb: 1 }}>{filterControls}</Box>
    </Collapse>
    {loading && runs.length === 0 && <CircularProgress size={16} />}
    {visibleRuns.length ? <Stack spacing={0.35}>{visibleRuns.map((run) => {
      const status = statusStyle[String(run.status)] ?? statusStyle.WAITING;
      const metadata = asRecord(run.metadata);
      return <Box key={run.id} sx={{ minWidth: 0, py: 0.25 }}>
        <Typography sx={{ color: '#7A8CA8', fontSize: 8.5, lineHeight: '14px', overflowWrap: 'anywhere' }}>
          {dateText(run.startedAt)} · {feature === 'dart-financial-statements' ? (metadata.phase === 'BACKFILL' ? '1단계 과거 수집' : '2단계 현행 수집') : status.label}
        </Typography>
        <Typography sx={{ color: '#7A8CA8', fontSize: 8.5, lineHeight: '14px', overflowWrap: 'anywhere' }}>
          대상 {numberText(run.target)} · 성공 {numberText(run.success)} · 실패 {numberText(run.failed)} · 건너뜀 {numberText(run.skipped)}
        </Typography>
        {run.failureReason && <Typography sx={{ color: '#F26A6F', fontSize: 8.5, lineHeight: '14px', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{run.failureReason}</Typography>}
      </Box>;
    })}</Stack> : <Typography sx={{ ...mutedText, fontSize: 8.5, lineHeight: '18px' }}>실행 이력이 없습니다.</Typography>}
  </Box>;
}

function TargetResults({ items, runs }: { items: DataRecord[]; runs: DataRecord[] }) {
  const fallbacks: DataRecord[] = runs.filter((run) => run.failureReason).slice(0, 3).map((run) => ({ symbol: '실행 오류', status: run.status, reason: run.failureReason, occurredAt: run.startedAt }));
  const entries = items.length ? items.slice(0, 100) : fallbacks;
  return <Box sx={{ ...cardSx, bgcolor: { xs: 'transparent', sm: cardSx.bgcolor }, border: { xs: 0, sm: cardSx.border }, display: 'flex', flexDirection: 'column', p: { xs: 0, sm: '10px' }, minHeight: { xs: 116, sm: 280 }, height: { sm: '100%' } }}>
    <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center', borderBottom: { xs: '1px solid #26334A', sm: 0 }, pb: '3px' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 10, fontWeight: 700, flex: 1 }}>대상별 오류·상태</Typography>
      <Typography sx={{ ...mutedText, fontSize: 8 }}>확인 {numberText(entries.length)}</Typography>
    </Stack>
    {entries.length ? <Stack spacing={0} sx={{ minWidth: 0, flex: 1 }}>
      {entries.map((item, index) => {
        const resultStyle = statusStyle[String(item.status)] ?? statusStyle.WAITING;
        const title = item.security?.name ?? item.symbol ?? '대상';
        const outcome = item.reason ?? resultStyle.label;
        return <Box key={`${item.symbol ?? 'result'}-${index}`} sx={{ py: '7px', minWidth: 0, borderBottom: index === entries.length - 1 ? 0 : '1px solid #26334A' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'baseline' }}>
            <Typography sx={{ color: resultStyle.background, fontSize: 9, fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</Typography>
            <Typography sx={{ color: resultStyle.background, fontSize: 7.5, flexShrink: 0 }}>{resultStyle.label}</Typography>
          </Stack>
          <Typography sx={{ color: '#7A8CA8', fontSize: 8, lineHeight: '13px', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{outcome}</Typography>
          {item.occurredAt && <Typography sx={{ color: '#52627A', fontSize: 7.5, lineHeight: '11px' }}>{dateText(item.occurredAt)}</Typography>}
        </Box>;
      })}
    </Stack> : <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}><Typography sx={{ ...mutedText, fontSize: 8.5 }}>확인할 대상 결과가 없습니다.</Typography></Box>}
    <Box sx={{ bgcolor: '#111825', borderRadius: '6px', px: '8px', py: '7px', mt: 1 }}>
      <Typography sx={{ ...mutedText, fontSize: 8, lineHeight: '12px' }}>갱신 중에도 마지막 완료 결과를 유지합니다.</Typography>
    </Box>
  </Box>;
}

function DartCurrentStageCard({ phase, status, priorityCheckedWithinDay, universeOver90Days, priorityPending, universePending, dailyApiCalls, dailyApiLimit, companyChecks }: {
  phase: string; status: string; priorityCheckedWithinDay: number; universeOver90Days: number; priorityPending: number; universePending: number; dailyApiCalls: number; dailyApiLimit: number; companyChecks: number;
}) {
  const disabled = phase !== 'CURRENT';
  const statusInfo = statusStyle[status] ?? statusStyle.WAITING;
  const label = status === 'NOT_CONFIGURED' || status === 'NOT_IMPLEMENTED' || status === 'DELAYED' || status === 'FAILED' || status === 'PARTIAL'
    ? statusInfo.label
    : disabled ? '1단계 후 대기' : status === 'RUNNING' ? '진행 중' : '상시 수집';
  const badge = status === 'NOT_CONFIGURED' || status === 'NOT_IMPLEMENTED' || status === 'DELAYED' || status === 'FAILED' || status === 'PARTIAL'
    ? statusInfo : disabled ? statusStyle.WAITING : status === 'RUNNING' ? statusStyle.RUNNING : statusStyle.OK;
  return <Box sx={{ ...cardSx, p: { xs: '4px 8px', sm: '8px 10px' }, minHeight: { xs: 39, sm: 85 }, opacity: disabled ? 0.86 : 1 }}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography sx={{ color: '#F2F7FC', fontSize: 9, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>2단계 · 현재 사업연도 상시 수집</Typography>
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: badge.background, color: badge.foreground, borderRadius: '999px', minWidth: 76, px: 1, height: 19, justifyContent: 'center', alignItems: 'center', fontSize: 8, fontWeight: 700 }}>{label}</Box>
    </Stack>
    <Typography sx={{ color: disabled ? '#7A8CA8' : '#3D8CF5', fontSize: 8.5, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: 0, sm: 0.5 } }}>
      {disabled ? status === 'NOT_CONFIGURED' ? '설정 후 1단계 완료 시 시작' : status === 'NOT_IMPLEMENTED' ? '수집기 배포 후 1단계 완료 시 시작' : '1단계 완료 후 자동 시작' : '우선종목 하루 1회 · 전체종목 약 3개월 순환'}
    </Typography>
    <Typography sx={{ display: { xs: 'none', sm: 'block' }, ...mutedText, fontSize: 7.5, lineHeight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {disabled ? '현행 공시 확인은 과거 자료 구축 완료 후 시작합니다.' : `우선 확인 ${numberText(priorityCheckedWithinDay)} · 전체 지연 ${numberText(universeOver90Days)}`}
    </Typography>
    <Typography sx={{ display: { xs: 'none', sm: 'block' }, ...mutedText, fontSize: 7.5, lineHeight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      API {numberText(dailyApiCalls)}/{numberText(dailyApiLimit)} · 종목 확인 {numberText(companyChecks)} · 우선 대기 {numberText(priorityPending)} · 전체 대기 {numberText(universePending)}
    </Typography>
  </Box>;
}

function CollectionFilters({ feature, resultFilter, setResultFilter, phaseFilter, setPhaseFilter, symbolFilter, setSymbolFilter, marketFilter, setMarketFilter, accountFilter, setAccountFilter, from, setFrom, to, setTo }: {
  feature: string; resultFilter: string; setResultFilter: (value: string) => void; phaseFilter: string; setPhaseFilter: (value: string) => void;
  symbolFilter: string; setSymbolFilter: (value: string) => void; marketFilter: string; setMarketFilter: (value: string) => void;
  accountFilter: string; setAccountFilter: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void;
}) {
  const selectSx = { height: 30, color: '#CBD5E1', fontSize: 9, bgcolor: '#0B1220', borderRadius: '6px', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#26334A' }, '& .MuiSelect-select': { py: '5px', pl: '8px' }, minWidth: 0 };
  const inputSx = { width: '100%', minWidth: 0, height: 30, boxSizing: 'border-box', bgcolor: '#0B1220', color: '#E8EDF7', border: '1px solid #26334A', borderRadius: '6px', px: '7px', fontSize: 9, outline: 'none', colorScheme: 'dark' };
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

export function CollectionMonitoringPage() {
  const { feature } = useParams();
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
  const current = summary.data?.features.find((item) => item.id === feature);
  const statusCounts = useMemo(() => (summary.data?.features ?? []).reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {}), [summary.data?.features]);
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
    const features = summary.data?.features ?? [];
    const generatedAt = summary.data?.generatedAt ?? new Date().toISOString();
    const errors = (statusCounts.FAILED ?? 0) + (statusCounts.PARTIAL ?? 0);
    const delays = statusCounts.DELAYED ?? 0;
    return <Box sx={{ pb: '80px' }}>
      {summary.isError && !summary.data && <Typography role="alert" sx={{ mx: 2, mt: 1, color: '#F26A6F', fontSize: 10 }}>수집 통계를 불러오지 못했습니다.</Typography>}
      {summary.isLoading && !summary.data && <CircularProgress size={18} sx={{ mx: 2, mt: 1 }} />}
      {summary.data && <SummaryStatus features={features} generatedAt={generatedAt} refreshing={summary.isFetching} onRefresh={() => { void summary.refetch(); }} />}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' }, columnGap: '16px', rowGap: { xs: '4px', sm: '6px' }, px: '16px' }}>
        {features.map((item) => <Box key={item.id} sx={{ gridColumn: { xs: '1', sm: item.id === 'dart-financial-statements' ? '1 / -1' : 'auto' } }}>
          <FeatureSummaryCard item={item} onOpen={() => navigate(`/detail/collection-monitoring/${item.id}`)} />
        </Box>)}
        {summary.data && features.length > 0 && <Typography sx={{ ...mutedText, gridColumn: '1 / -1', fontSize: 7.5, textAlign: 'right', mt: '1px', display: { xs: 'none', sm: 'block' } }}>
          오류 {errors} · 지연 {delays} · 갱신 {dateText(generatedAt)}
        </Typography>}
      </Box>
      {summary.isError && summary.data && <Typography role="status" sx={{ ...mutedText, mx: 2, mt: 0.5, fontSize: 8 }}>갱신에 실패했습니다. 표시 중인 완료 데이터는 유지합니다.</Typography>}
    </Box>;
  }

  if (!current && summary.isLoading) return <CircularProgress size={18} sx={{ mx: 2, mt: 1 }} />;
  if (!current) return <Typography role="alert" sx={{ mx: 2, mt: 1, color: '#7A8CA8', fontSize: 10 }}>수집 기능 정보를 찾을 수 없습니다.</Typography>;

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
  const stageOneBadge = stageOneComplete ? statusStyle.OK : statusStyle[current.status] ?? statusStyle.WAITING;
  const stageOneLabel = stageOneComplete ? '완료'
    : current.status === 'WAITING' ? '야간 대기' : (statusStyle[current.status]?.label ?? '실행 전');

  return <Box sx={{ px: '16px', pt: '8px', pb: '80px' }}>
    {detail.isError && !detail.data && <Typography role="alert" sx={{ color: '#F26A6F', fontSize: 9, mb: 0.5 }}>수집 상세를 불러오지 못했습니다.</Typography>}
    {isDart ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' }, columnGap: '16px', rowGap: '8px', alignItems: 'stretch' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Box sx={{ display: { xs: 'block', sm: 'none' } }}><CurrentStatusCard feature={current} refreshing={summary.isFetching || detail.isFetching} onRefresh={refreshStats} /></Box>
        <Box sx={{ ...cardSx, p: { xs: '4px 8px', sm: '8px 10px' }, minHeight: { xs: 39, sm: 85 } }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Typography sx={{ color: '#F2F7FC', fontSize: 9, fontWeight: 700, flex: 1 }}>1단계 · 과거 자료 최초 수집</Typography>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, bgcolor: stageOneBadge.background, color: stageOneBadge.foreground, minWidth: 78, height: 19, borderRadius: '999px', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>{stageOneLabel}</Box>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}><ManualRefresh refreshing={summary.isFetching || detail.isFetching} onClick={refreshStats} /></Box>
          </Stack>
          <Typography sx={{ color: '#34D399', fontSize: 8.5, lineHeight: { xs: '12px', sm: '15px' }, mt: { xs: 0, sm: 0.5 } }}>{numberText(completed)} / {numberText(planned)}개 작업 완료</Typography>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Box sx={{ height: 3, bgcolor: '#26334A', borderRadius: 2, my: 0.5, overflow: 'hidden' }}><Box sx={{ height: '100%', width: planned && completed != null ? `${Math.min(100, completed * 100 / planned)}%` : 0, bgcolor: '#34D399' }} /></Box>
            <Typography sx={{ ...mutedText, fontSize: 7.5, lineHeight: '12px' }}>대상 {numberText(planned)} · 성공 {numberText(success)} · 미공시 {numberText(noFiling)} · 실패 {numberText(failed)} · 대기 {numberText(pending)}</Typography>
          </Box>
        </Box>
        <DartCurrentStageCard phase={current.phase ?? 'BACKFILL'} status={current.status} priorityCheckedWithinDay={Number(dartCurrent.priorityCheckedWithinDay ?? 0)} universeOver90Days={Number(dartCurrent.universeOver90Days ?? 0)} priorityPending={Number(current.priorityPending ?? 0)} universePending={Number(current.universePending ?? 0)} dailyApiCalls={Number(current.dailyApiCalls ?? 0)} dailyApiLimit={Number(current.dailyApiLimit ?? 0)} companyChecks={Number(current.companyChecks ?? 0)} />
        <Box sx={{ display: { xs: 'block', sm: 'none' } }}><CountStrip target={current.recent.target} success={current.recent.success} failed={current.recent.failed} skipped={current.recent.skipped} /></Box>
        <RunHistory runs={runs} loading={detail.isFetching} feature={feature} filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((value) => !value)} showAllRuns={showAllRuns} onToggleRuns={() => setShowAllRuns((value) => !value)} filterControls={filterControls} />
      </Stack>
      <TargetResults items={items} runs={runs} />
    </Box> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' }, columnGap: '16px', rowGap: '8px', alignItems: 'stretch' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <CurrentStatusCard feature={current} refreshing={summary.isFetching || detail.isFetching} onRefresh={refreshStats} />
        <CountStrip target={current.recent.target} success={current.recent.success} failed={current.recent.failed} skipped={current.recent.skipped} />
        <Box sx={{ display: { xs: isRealtime && [current.realtime?.sourceError, current.realtime?.publishError, current.realtime?.saveError].some(Boolean) ? 'block' : 'none', sm: isRealtime ? 'block' : 'none' }, ...cardSx, p: '8px 9px' }}>
          <Typography sx={{ ...mutedText, fontSize: 8, lineHeight: '14px' }}>워커 {dateText(current.realtime?.heartbeatAt)} · {current.realtime?.session ?? '세션 기록 없음'}</Typography>
          <Typography sx={{ color: '#3D8CF5', fontSize: 8, lineHeight: '14px', overflowWrap: 'anywhere' }}>수신 {dateText(current.realtime?.lastPriceReceivedAt)} · 원천 {dateText(current.realtime?.lastSourcePriceAt)}</Typography>
          <Typography sx={{ color: '#3D8CF5', fontSize: 8, lineHeight: '14px', overflowWrap: 'anywhere' }}>SSE {dateText(current.realtime?.lastSsePublishedAt)} · DB {dateText(current.realtime?.lastDbSavedAt)}</Typography>
          {[[current.realtime?.sourceError, '원천 가격'], [current.realtime?.publishError, 'SSE 전달'], [current.realtime?.saveError, 'DB 저장']].filter(([message]) => message).map(([message, label]) => <Typography key={label} sx={{ color: '#F26A6F', fontSize: 8, lineHeight: '14px', overflowWrap: 'anywhere' }}>{label} 오류: {message}</Typography>)}
        </Box>
        <RunHistory runs={runs} loading={detail.isFetching} feature={feature} filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((value) => !value)} showAllRuns={showAllRuns} onToggleRuns={() => setShowAllRuns((value) => !value)} filterControls={filterControls} />
      </Stack>
      <TargetResults items={items} runs={runs} />
    </Box>}
    {detail.isError && detail.data && <Typography role="status" sx={{ ...mutedText, fontSize: 8, mt: 0.5 }}>갱신 실패 · 마지막 완료 결과를 계속 표시합니다.</Typography>}
  </Box>;
}
