import { ArrowBackRounded, RefreshRounded, SyncRounded } from '@mui/icons-material';
import { Alert, Box, Button, Chip, CircularProgress, FormControl, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCollectionMonitorDetail, getCollectionMonitorSummary } from '../../data/roxstockApi';

const stateLabels: Record<string, string> = { OK: '정상', RUNNING: '수집 중', PARTIAL: '일부 실패', FAILED: '실패', DELAYED: '지연', WAITING: '대기', NOT_CONFIGURED: '미설정', NOT_IMPLEMENTED: '미배포', NO_DATA: '데이터 없음' };
const stateColor: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info'> = { OK: 'success', RUNNING: 'info', PARTIAL: 'warning', FAILED: 'error', DELAYED: 'error', WAITING: 'default', NOT_CONFIGURED: 'warning', NOT_IMPLEMENTED: 'default', NO_DATA: 'default' };
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '기록 없음';
const numberText = (value?: number) => (value ?? 0).toLocaleString('ko-KR');
const asRecord = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
const panelSx = { p: { xs: '12px', sm: '14px' }, border: '1px solid #25344D', borderRadius: '10px', bgcolor: '#111825', minWidth: 0 };

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
  const summary = useQuery({ queryKey: ['collection-monitoring-summary'], queryFn: getCollectionMonitorSummary, refetchInterval: 60_000 });
  const detailQueryParams = useMemo(() => ({ ...(resultFilter && { result: resultFilter }), ...(phaseFilter && { phase: phaseFilter }), ...(symbolFilter && { symbol: symbolFilter }), ...(marketFilter && { market: marketFilter }), ...(accountFilter && { accountId: accountFilter }), ...(from && { from }), ...(to && { to }) }), [resultFilter, phaseFilter, symbolFilter, marketFilter, accountFilter, from, to]);
  const detail = useQuery({ queryKey: ['collection-monitoring-detail', feature, detailQueryParams], queryFn: () => getCollectionMonitorDetail(feature ?? '', detailQueryParams), enabled: Boolean(feature), placeholderData: (previous) => previous, refetchInterval: feature ? 60_000 : false });
  const current = summary.data?.features.find((item) => item.id === feature);
  const statusCounts = useMemo(() => (summary.data?.features ?? []).reduce<Record<string, number>>((counts, item) => { counts[item.status] = (counts[item.status] ?? 0) + 1; return counts; }, {}), [summary.data?.features]);
  const body = asRecord(detail.data);
  const runs = Array.isArray(body.runs) ? body.runs as Record<string, any>[] : [];
  const items = Array.isArray(body.items) ? body.items as Record<string, any>[] : [];
  const dart = asRecord(body.dart);
  const realtime = asRecord(body.realtime);

  if (feature) return <Stack spacing={1.25} sx={{ pb: '8px' }}>
    <Stack spacing={1} sx={{ flexDirection: 'row', alignItems: 'center' }}>
      <Button onClick={() => navigate('/detail/collection-monitoring')} startIcon={<ArrowBackRounded />} sx={{ minWidth: 0, color: '#CBD5E1', px: 0.5 }}>전체</Button>
      <Typography sx={{ fontWeight: 700, fontSize: 17, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{current?.name ?? '수집 상세'}</Typography>
      <Button aria-label="통계 새로고침" onClick={() => { void summary.refetch(); void detail.refetch(); }} disabled={summary.isFetching || detail.isFetching} sx={{ minWidth: 38, px: 0.5, color: '#CBD5E1' }}><RefreshRounded /></Button>
    </Stack>
    {detail.isError && !detail.data && <Alert severity="error">수집 통계를 불러오지 못했습니다.</Alert>}
    {feature === 'dart-financial-statements' && <>
      <Box sx={panelSx}>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>1단계 · 과거 자료 최초 구축</Typography>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>계획 {numberText(dart.backfill?.planned)} · 완료 {numberText(dart.backfill?.success + dart.backfill?.noFiling + dart.backfill?.notApplicable)} · 대기 {numberText(dart.backfill?.byStatus?.PENDING + dart.backfill?.byStatus?.PROCESSING)} · 실패 {numberText(dart.backfill?.byStatus?.FAILED)}</Typography>
        <Box sx={{ height: 6, bgcolor: '#263348', borderRadius: 4, mt: 1, overflow: 'hidden' }}><Box sx={{ width: `${dart.backfill?.planned ? Math.min(100, (100 * (dart.backfill.success + dart.backfill.noFiling + dart.backfill.notApplicable) / dart.backfill.planned)) : 0}%`, height: '100%', bgcolor: '#34D399' }} /></Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, overflowWrap: 'anywhere' }}>미공시 {numberText(dart.backfill?.byStatus?.NO_FILING)} · 대상 아님 {numberText(dart.backfill?.byStatus?.NOT_APPLICABLE)} · 단계: {dart.phase ?? '확인 중'}</Typography>
      </Box>
      <Box sx={panelSx}>
        <Typography sx={{ fontWeight: 700, mb: 0.75 }}>2단계 · 현재 공시 확인</Typography>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>우선종목: 하루 1회 · 전체종목 야간 순환: 하루 약 35종목</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}>우선종목 확인 대기 {numberText(dart.current?.priorityCheckedWithinDay)} · 전체종목 90일 초과/미확인 {numberText(dart.current?.universeOver90Days)}</Typography>
      </Box>
      <Box sx={panelSx}><Typography sx={{ fontWeight: 700 }}>일일 DART 사용량</Typography><Typography variant="body2" sx={{ mt: 0.5 }}>API 호출 {numberText(current?.dailyApiCalls)} / {numberText(current?.dailyApiLimit)} · 종목 확인 {numberText(current?.recent?.processed)}</Typography></Box>
    </>}
    {feature === 'realtime-prices' && <Box sx={panelSx}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>실시간 워커 · {stateLabels[current?.status ?? 'WAITING'] ?? current?.status}</Typography>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>워커 하트비트 {dateText(current?.realtime?.heartbeatAt)} · 세션 {current?.realtime?.session ?? '기록 없음'}</Typography>
      <Stack spacing={0.4} sx={{ mt: 1 }}>
        <Typography variant="caption">가격 수신 {dateText(current?.realtime?.lastPriceReceivedAt)} · 원천 가격 기준 {dateText(current?.realtime?.lastSourcePriceAt)}</Typography>
        <Typography variant="caption">SSE 발행 {dateText(current?.realtime?.lastSsePublishedAt)} · DB 저장 {dateText(current?.realtime?.lastDbSavedAt)}</Typography>
        {[[current?.realtime?.sourceError, '원천 오류'], [current?.realtime?.publishError, 'API 발행 오류'], [current?.realtime?.saveError, 'DB 저장 오류']].filter(([message]) => message).map(([message, label]) => <Typography key={label} variant="caption" color="error.main" sx={{ overflowWrap: 'anywhere' }}>{label}: {message}</Typography>)}
      </Stack>
    </Box>}
    <Box sx={panelSx}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>실행 이력</Typography>
      <Stack spacing={0.75} sx={{ mb: 1, flexDirection: 'row', flexWrap: 'wrap', gap: '6px' }}>
        <FormControl size="small" sx={{ minWidth: 112 }}><Select value={resultFilter} displayEmpty onChange={(event) => setResultFilter(event.target.value)} aria-label="결과 필터"><MenuItem value="">전체 결과</MenuItem>{['SUCCESS','PARTIAL','FAILED','SKIPPED'].map((value) => <MenuItem key={value} value={value}>{stateLabels[value] ?? value}</MenuItem>)}</Select></FormControl>
        {feature === 'dart-financial-statements' && <FormControl size="small" sx={{ minWidth: 112 }}><Select value={phaseFilter} displayEmpty onChange={(event) => setPhaseFilter(event.target.value)} aria-label="수집 단계 필터"><MenuItem value="">전체 단계</MenuItem><MenuItem value="BACKFILL">1단계 과거 구축</MenuItem><MenuItem value="CURRENT">2단계 상시</MenuItem></Select></FormControl>}
        <Box component="input" aria-label="종목 필터" placeholder="종목코드" value={symbolFilter} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSymbolFilter(event.target.value)} sx={{ width: 100, height: 38, bgcolor: '#0B1220', color: '#E8EDF7', border: '1px solid #334155', borderRadius: 1, px: 1 }} />
        {feature !== 'account-snapshots' && <FormControl size="small" sx={{ minWidth: 100 }}><Select value={marketFilter} displayEmpty onChange={(event) => setMarketFilter(event.target.value)} aria-label="시장 필터"><MenuItem value="">전체 시장</MenuItem>{['KOSPI','KOSDAQ','KONEX','OTHER'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>}
        {feature === 'account-snapshots' && <Box component="input" aria-label="계좌 필터" placeholder="계좌 ID" value={accountFilter} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAccountFilter(event.target.value)} sx={{ width: 100, height: 38, bgcolor: '#0B1220', color: '#E8EDF7', border: '1px solid #334155', borderRadius: 1, px: 1 }} />}
        <Box component="input" aria-label="시작일" type="date" value={from} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setFrom(event.target.value)} sx={{ width: 132, bgcolor: '#0B1220', color: '#E8EDF7', border: '1px solid #334155', borderRadius: 1, px: 1 }} />
        <Box component="input" aria-label="종료일" type="date" value={to} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTo(event.target.value)} sx={{ width: 132, bgcolor: '#0B1220', color: '#E8EDF7', border: '1px solid #334155', borderRadius: 1, px: 1 }} />
      </Stack>
      {detail.isLoading && <CircularProgress size={22} />}
      <Stack spacing={0.75}>{runs.map((run) => <Box key={run.id} sx={{ p: 1, borderRadius: 1, bgcolor: '#0B1220', minWidth: 0 }}>
        <Stack spacing={0.75} sx={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}><Chip size="small" label={stateLabels[run.status] ?? run.status} color={stateColor[run.status] ?? 'default'} /><Typography variant="caption">{dateText(run.startedAt)}</Typography><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>대상 {numberText(run.target)} · 성공 {numberText(run.success)} · 실패 {numberText(run.failed)} · 건너뜀 {numberText(run.skipped)}</Typography></Stack>
        {run.failureReason && <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{run.failureReason}</Typography>}
      </Box>)}</Stack>
      {items.length > 0 && <><Typography sx={{ fontWeight: 700, mt: 1.5, mb: 0.75 }}>대상별 결과 및 오류</Typography><Stack spacing={0.5}>{items.map((item, index) => <Box key={`${item.symbol}-${index}`} sx={{ p: 1, borderRadius: 1, bgcolor: '#0B1220', minWidth: 0 }}><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{item.security?.name ?? item.symbol} · {item.status}</Typography>{item.reason && <Typography variant="caption" color="error.main" sx={{ display: 'block', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{item.reason}</Typography>}</Box>)}</Stack></>}
      {feature === 'realtime-prices' && Array.isArray(realtime.issues) && <><Typography sx={{ fontWeight: 700, mt: 1.5, mb: 0.75 }}>실시간 오류 이력</Typography>{realtime.issues.map((issue: Record<string, any>, index: number) => <Typography key={index} variant="caption" color="error.main" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{dateText(issue.at)} · {issue.stage}: {issue.reason}</Typography>)}</>}
      {detail.isFetching && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>통계 갱신 중…</Typography>}
    </Box>
  </Stack>;

  return <Stack spacing={1.25} sx={{ pb: '8px' }}>
    <Stack spacing={1} sx={{ flexDirection: 'row', alignItems: 'center' }}><SyncRounded sx={{ color: '#60A5FA' }} /><Typography sx={{ fontWeight: 700, fontSize: 18, flex: 1 }}>수집 모니터링</Typography><Button aria-label="통계 새로고침" onClick={() => { void summary.refetch(); }} disabled={summary.isFetching} sx={{ minWidth: 40, color: '#CBD5E1' }}><RefreshRounded /></Button></Stack>
    {summary.isError && !summary.data && <Alert severity="error">수집 통계를 불러오지 못했습니다.</Alert>}
    {summary.isLoading && <CircularProgress size={24} />}
    {summary.data && <Box sx={{ ...panelSx, py: 1 }}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>정상 주기 {numberText(statusCounts.OK)} · 실행 중 {numberText(statusCounts.RUNNING)} · 확인 필요 {numberText((statusCounts.PARTIAL ?? 0) + (statusCounts.FAILED ?? 0) + (statusCounts.DELAYED ?? 0))} · 미설정/미배포 {numberText((statusCounts.NOT_CONFIGURED ?? 0) + (statusCounts.NOT_IMPLEMENTED ?? 0))}</Typography><Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{summary.data.features.filter((item) => ['PARTIAL', 'FAILED', 'DELAYED', 'NOT_CONFIGURED', 'NOT_IMPLEMENTED'].includes(item.status)).map((item) => `${item.name}: ${stateLabels[item.status] ?? item.status}`).join(' · ') || '확인이 필요한 수집 기능이 없습니다.'}</Typography></Box>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' }, gap: 1 }}>
      {(summary.data?.features ?? []).map((item) => <Box key={item.id} role="button" tabIndex={0} onClick={() => navigate(`/detail/collection-monitoring/${item.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/detail/collection-monitoring/${item.id}`); }} sx={{ ...panelSx, cursor: 'pointer', '&:hover': { borderColor: '#456186' } }}>
        <Stack spacing={1} sx={{ flexDirection: 'row', alignItems: 'center' }}><Typography sx={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{item.name}</Typography><Chip size="small" color={stateColor[item.status] ?? 'default'} label={stateLabels[item.status] ?? item.status} sx={{ flexShrink: 0 }} /></Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, overflowWrap: 'anywhere' }}>{item.schedule}</Typography>
        <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>최근: 대상 {numberText(item.recent.target)} · 성공 {numberText(item.recent.success)} · 실패 {numberText(item.recent.failed)} · 건너뜀 {numberText(item.recent.skipped)}</Typography>
        {item.phase && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, overflowWrap: 'anywhere' }}>{item.phase === 'BACKFILL' ? '1단계 과거 구축' : '2단계 현재 공시'} · 잔여 {numberText(item.backfill?.pending)} · 미공시 {numberText(item.backfill?.noFiling)} · API {numberText(item.dailyApiCalls)}/{numberText(item.dailyApiLimit)}</Typography>}
        {item.realtime && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, overflowWrap: 'anywhere' }}>워커 {dateText(item.realtime.heartbeatAt)} · 수신 {dateText(item.realtime.lastPriceReceivedAt)} · 발행 {dateText(item.realtime.lastSsePublishedAt)} · 저장 {dateText(item.realtime.lastDbSavedAt)}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, overflowWrap: 'anywhere' }}>데이터 기준 {dateText(item.lastDataAt)} · 통계 갱신 {dateText(item.statsGeneratedAt)}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>마지막 성공 {dateText(item.lastSuccessAt)} · 다음 예정 {dateText(item.nextAt)}</Typography>
      </Box>)}
    </Box>
    {summary.isFetching && <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>통계 갱신 중…</Typography>}
  </Stack>;
}
