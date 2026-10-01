import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../../data/apiClient';

type Period = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL' | 'ALL';
type Result = { period: Period; status: 'SUCCESS' | 'NO_DATA' | 'FAILED'; code?: string };
type RefreshStatus = { state: 'QUEUED' | 'PROCESSING' | 'FINISHED'; status: string; finishedAt: string | null; fiscalYear: number; period: Period; results: Result[] };
const labels: Record<Period, string> = { Q1: '1분기', Q2: '반기', Q3: '3분기', ANNUAL: '사업보고서', ALL: '연도 전체' };
const errorText = (code?: string) => {
  if (['010', '011', '012', 'API_KEY_MISSING', 'DART_NOT_CONFIGURED'].includes(code ?? '')) return '인증·접근 설정을 확인해 주세요.';
  if (['020', 'DAILY_CALL_LIMIT'].includes(code ?? '')) return '일일 API 호출 한도에 도달했습니다.';
  if (code === 'DART_CORP_CODE_NOT_MAPPED') return 'DART 기업코드가 연결되지 않았습니다.';
  return '업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.';
};
export function FinancialRefreshControls({ stockId, collectedAt, onSelection }: { stockId: string; collectedAt: string | null; onSelection: (year: number, period: Period) => void }) {
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
  const [year, setYear] = useState(currentYear - 1);
  const [period, setPeriod] = useState<Period>('ANNUAL');
  const [requestId, setRequestId] = useState<string | null>(() => sessionStorage.getItem(`financialRefresh:${stockId}`));
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => apiRequest<{ requestId: string }>(`/securities/${encodeURIComponent(stockId)}/financial-refresh`, { method: 'POST', body: JSON.stringify({ fiscalYear: year, period }) }),
    onSuccess: (data) => { sessionStorage.setItem(`financialRefresh:${stockId}`, data.requestId); setRequestId(data.requestId); } });
  const status = useQuery({ queryKey: ['financialRefresh', stockId, requestId], queryFn: () => apiRequest<RefreshStatus>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/${requestId}`), enabled: Boolean(requestId),
    refetchInterval: (query) => query.state.data?.state === 'FINISHED' ? false : 2000, retry: 1 });
  useEffect(() => {
    if (status.data && status.data.state !== 'FINISHED') {
      setYear(status.data.fiscalYear); setPeriod(status.data.period);
    }
  }, [status.data?.fiscalYear, status.data?.period, status.data?.state]);
  useEffect(() => {
    if (status.data?.state === 'FINISHED') {
      sessionStorage.removeItem(`financialRefresh:${stockId}`);
      void queryClient.invalidateQueries({ queryKey: ['securityAnalysis', stockId] });
    }
  }, [status.data?.state, stockId, queryClient]);
  const busy = mutation.isPending || Boolean(requestId && status.data?.state !== 'FINISHED');
  const finished = status.data?.state === 'FINISHED' ? status.data : null;
  return <Stack spacing={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px', p: 1.5 }}>
    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>DART 재무제표 업데이트</Typography>
    <Stack direction="row" spacing={1}>
      <TextField select label="사업연도" value={year} disabled={busy} size="small" onChange={(e) => { setYear(Number(e.target.value)); onSelection(Number(e.target.value), period); }} sx={{ flex: 1 }}>{Array.from({ length: currentYear - 2015 + 1 }, (_, i) => currentYear - i).map((y) => <MenuItem key={y} value={y}>{y}년</MenuItem>)}</TextField>
      <TextField select label="갱신 범위" value={period} disabled={busy} size="small" onChange={(e) => { setPeriod(e.target.value as Period); onSelection(year, e.target.value as Period); }} sx={{ flex: 1.4 }}>{Object.entries(labels).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>
    </Stack>
    <Button variant="outlined" startIcon={<RefreshIcon />} disabled={busy} onClick={() => { onSelection(year, period); mutation.mutate(); }}>{busy ? status.data?.state === 'PROCESSING' ? '업데이트 중' : '요청 처리 대기 중' : `${year}년 ${labels[period]} 업데이트`}</Button>
    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>버튼을 누를 때만 수집합니다. {period === 'ALL' ? '선택 연도의 보고서 4개를 조회합니다.' : '선택한 보고서만 조회합니다.'}</Typography>
    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>저장 데이터 수집 시각: {collectedAt ? new Date(collectedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미수집'}</Typography>
    {mutation.isError && <Alert severity="error">{mutation.error instanceof ApiError && ['DART_REFRESH_IN_PROGRESS', 'DART_REFRESH_BUSY', 'DART_REFRESH_QUEUE_FULL', 'DART_NOT_APPLICABLE'].includes(mutation.error.code) ? mutation.error.message : errorText(mutation.error instanceof ApiError ? mutation.error.code : undefined)}</Alert>}
    {status.isError && <Alert severity="warning">진행 상태를 확인할 수 없습니다. 기존 데이터는 유지됩니다.<Button onClick={() => void status.refetch()}>상태 다시 확인</Button></Alert>}
    {finished && <Alert severity={finished.status === 'FAILED' ? 'error' : finished.status === 'PARTIAL' || finished.status === 'SKIPPED' ? 'warning' : 'success'}>
      {finished.fiscalYear}년 {labels[finished.period]} · {finished.finishedAt ? new Date(finished.finishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''}
      {finished.results.map((r) => <Typography key={r.period} sx={{ fontSize: 12 }}>{labels[r.period]}: {r.status === 'SUCCESS' ? '최신 공시 확인 완료' : r.status === 'NO_DATA' ? '공시·재무제표 없음 · 기존 데이터 유지' : errorText(r.code)}</Typography>)}
    </Alert>}
  </Stack>;
}
