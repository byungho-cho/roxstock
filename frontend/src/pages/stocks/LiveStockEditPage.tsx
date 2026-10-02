import { useActiveAccount } from '../../hooks/useActiveAccount';
import { Button, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { getSecurityAnalysis, updateSecurityAnalysis, type AnalysisWriteInput } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';

const fields: Array<[keyof AnalysisWriteInput, string, string]> = [
  ['operatingProfit', '영업이익', '원'], ['controllingProfit', '지배순이익', '원'],
  ['issuedShares', '발행주식수', '주'], ['treasuryShares', '자기주식수', '주'],
  ['assets', '자산', '원'], ['liabilities', '부채', '원'],
  ['equity', '지배주주자본', '원'], ['previousEquity', '전기 지배주주자본', '원'],
  ['dividend', '주당배당금', '원'],
];

export function LiveStockEditPage() {
  const {accountId}=useActiveAccount(); const {stockId}=useParams();
  return <AccountStockEdit key={`${accountId}:${stockId}`}/>;
}
function AccountStockEdit() {
  const {accountId}=useActiveAccount();
  const { stockId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['securityAnalysis', stockId, accountId], enabled: !!accountId, queryFn: () => getSecurityAnalysis(stockId,undefined,accountId) });
  const [values, setValues] = useState<AnalysisWriteInput>({});
  const [valuesFor, setValuesFor] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(() => {
    if (!data) return;
    const annual = data.statements.find((item) => item.periodType === 'ANNUAL');
    setValues({
      operatingProfit: annual?.operatingProfit ?? '', controllingProfit: data.fundamentals?.controllingProfit ?? '',
      issuedShares: data.fundamentals?.issuedShares ?? '', treasuryShares: data.fundamentals?.treasuryShares ?? '',
      assets: annual?.totalAssets ?? '', liabilities: annual?.totalLiabilities ?? '',
      equity: annual?.totalEquity ?? '', previousEquity: data.fundamentals?.previousEquity ?? '',
      dividend: data.valuation?.dividendPerShare ?? '', memo: data.security.memo ?? '',
    });
    setValuesFor(stockId);
  }, [data, stockId]);
  const save = async () => {
    if(!accountId||lock.current)return;lock.current=true;
    setSaving(true); setError('');
    try {
      await updateSecurityAnalysis(stockId, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || null])), accountId);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['securityAnalysis', stockId, accountId] }), queryClient.invalidateQueries({ queryKey: ['stocks'] })]);
      if(alive.current)navigate(`/stocks/${stockId}`);
    } catch (cause) { if(alive.current)setError(cause instanceof Error ? cause.message : '저장에 실패했습니다.'); }
    finally { lock.current=false;if(alive.current)setSaving(false); }
  };
  return <Stack spacing={1.5} sx={{ pb: 2 }}>
    <PageHeader embedded showAdd={false} title="종목 정보 수정" subtitle={data?.security.name} onBack={() => navigate(-1)} />
    {isError && !data ? <Button onClick={() => void refetch()}>조회 실패 · 다시 시도</Button> : isPending || valuesFor !== stockId ? <Stack role="status" aria-label="종목 정보를 불러오는 중"><Skeleton variant="rounded" height={52} /><Skeleton variant="rounded" height={52} /><Skeleton variant="rounded" height={52} /></Stack> : <>
      <Typography sx={{ fontSize: 11, color: colors.textMuted }}>직접 입력한 값은 최근 연간 재무 정보와 계산 기초 데이터로 저장됩니다. 데이터가 없으면 빈칸으로 표시됩니다.</Typography>
      {fields.map(([key, label, unit]) => <TextField key={key} size="small" label={label} value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value.replace(/[^0-9]/g, '') }))} slotProps={{ htmlInput: { inputMode: 'numeric' } }} helperText={unit} />)}
      {data?.security.watchlistItemId && <TextField label="메모" value={values.memo ?? ''} onChange={(event) => setValues((current) => ({ ...current, memo: event.target.value.slice(0, 500) }))} multiline minRows={3} />}
      {error && <Typography role="alert" color="error">{error}</Typography>}
      <Button variant="contained" disabled={saving} onClick={() => void save()}>저장</Button>
    </>}
  </Stack>;
}

