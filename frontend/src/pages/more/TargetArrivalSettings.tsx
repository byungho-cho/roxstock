import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../data/apiClient';
import { getTargetSettings, saveTargetSettings, type TargetCondition } from '../../data/targetArrivalApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { AppCard } from '../../components/common/Common';
import { NumberField } from '../../components/forms/Fields';
import { colors } from '../../styles/tokens';

export function TargetArrivalSettings() {
  const { accountId, accounts } = useActiveAccount();
  if (!accountId) return <Alert severity={accounts.isError ? 'error' : 'info'}>{accounts.isError ? '계좌 조회에 실패했습니다.' : '계좌를 선택해 주세요.'}{accounts.isError && <Button onClick={() => void accounts.refetch()}>다시 시도</Button>}</Alert>;
  return <AccountTargetSettings key={accountId} accountId={accountId} />;
}

function AccountTargetSettings({ accountId }: { accountId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['targetSettings', accountId], queryFn: () => getTargetSettings(accountId) });
  const [draft, setDraft] = useState<{ conditions: TargetCondition[]; version: number } | null>(null);
  const [editor, setEditor] = useState<{ index: number | null; days: string; rate: string } | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const rateInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (query.data && !draft) setDraft({ conditions: query.data.conditions, version: query.data.version }); }, [query.data, draft]);
  const editorValid = !!editor && /^[1-9]\d*$/.test(editor.days) && Number.isSafeInteger(Number(editor.days)) && Number(editor.days) <= 2_147_483_647
    && /^\d{1,5}(?:\.\d{1,4})?$/.test(editor.rate) && Number(editor.rate) > 0
    && !draft?.conditions.some((c, i) => i !== editor.index && c.days === Number(editor.days));
  const confirmEditor = () => {
    if (!editorValid || !editor || !draft) { setFormError('기간·수익률과 중복 기간을 확인해 주세요.'); return; }
    const next = [...draft.conditions];
    const row = { days: Number(editor.days), rate: editor.rate };
    if (editor.index === null) { if (next.length >= 5) return; next.push(row); }
    else next[editor.index] = row;
    setDraft({ ...draft, conditions: next.sort((a, b) => a.days - b.days) }); setEditor(null); setSaved(false);
  };
  const save = async () => {
    if (!draft || busy || conflict) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const next = await saveTargetSettings(accountId, draft);
      setDraft({ conditions: next.conditions, version: next.version });
      client.setQueryData(['targetSettings', accountId], next);
      await client.invalidateQueries({ queryKey: ['targetArrivals', accountId] });
      setSaved(true);
    } catch (cause) {
      setConflict(cause instanceof ApiError && cause.status === 409);
      setError(cause instanceof Error ? cause.message : '저장에 실패했습니다.');
    } finally { setBusy(false); }
  };
  const loadVersion = async () => {
    try {
      const latest = await getTargetSettings(accountId);
      setDraft(current => current && { ...current, version: latest.version });
      setConflict(false); setError('최신 설정 버전을 확인했습니다. 입력 내용을 검토하고 다시 저장해 주세요.');
    } catch { setError('최신 설정 조회에 실패했습니다. 입력 내용은 유지됩니다.'); }
  };
  if (!draft) return query.isError ? <Alert severity="error">설정 조회에 실패했습니다.<Button onClick={() => void query.refetch()}>다시 시도</Button></Alert> : <Skeleton variant="rounded" height={220} />;
  return <Box>
    {editor ? <AppCard sx={{ p: '14px', borderRadius: '8px' }}>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 600 }}>{editor?.index === null ? '조건 추가' : '조건 수정'}</Typography>
      <Box><Stack spacing={1} sx={{ pt: 1 }}>
        <NumberField clearIconSrc="/settings-v03/clear.svg" label="보유기간 상한" required autoFocus value={editor?.days ?? ''} onChange={days => setEditor(current => current && { ...current, days })} suffix="일" enterKeyHint="next" onEnter={() => rateInput.current?.focus()} />
        <NumberField clearIconSrc="/settings-v03/clear.svg" label="목표수익률" required inputRef={rateInput} value={editor?.rate ?? ''} onChange={rate => setEditor(current => current && { ...current, rate })} suffix="%" enterKeyHint="done" onEnter={confirmEditor} />
        <Typography sx={{ fontSize: 11, color: colors.textMuted }}>기간은 1 이상의 정수, 목표수익률은 0 초과(소수 4자리, 최대 99,999.9999%). 같은 기간을 중복 등록할 수 없습니다.</Typography>
        {formError && <Alert severity="error">{formError}</Alert>}
      </Stack></Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 2 }}><Button onClick={() => setEditor(null)}>취소</Button><Button disabled={!editorValid} onClick={confirmEditor}>{editor?.index === null ? '등록' : '수정'}</Button></Stack>
    </AppCard> : <>
    <AppCard sx={{ p: '14px', borderRadius: '8px', bgcolor: '#111827' }}>
      <Typography sx={{ fontSize: 12 }}>선택 계좌에 저장됩니다.</Typography>
      <Typography sx={{ fontSize: 11, color: colors.textMuted, my: 1 }}>최대 5개 등록됨 · 조건을 삭제하면 추가할 수 있습니다.</Typography>
      <Button fullWidth variant="outlined" disabled={busy || draft.conditions.length >= 5} onClick={() => { setEditor({ index: null, days: '', rate: '' }); setFormError(''); }}>조건 추가</Button>
    </AppCard>
    <Stack spacing="8px" sx={{ mt: '8px' }}>
      {draft.conditions.map((c, i) => <AppCard key={c.days} sx={{ p: '14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button disabled={busy} onClick={() => { setEditor({ index: i, days: String(c.days), rate: c.rate }); setFormError(''); }} sx={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left', p: 0, color: colors.textPrimary }}><Typography sx={{ fontSize: 14 }}>{c.days.toLocaleString('ko-KR')}일 이내</Typography><Typography sx={{ fontSize: 12, color: colors.textMuted, mt: '4px' }}>수익률 {c.rate}% 이상일 경우</Typography></Button>
        <Button variant="contained" color="error" size="small" disabled={busy} onClick={() => setDeleteIndex(i)}>삭제</Button>
      </AppCard>)}
    </Stack>
    {draft.conditions.length === 0 && <Alert severity="info" sx={{ my: 1 }}>조건이 없어 기능이 비활성화되었습니다.</Alert>}
    {error && <Alert severity="error" sx={{ my: 1 }}>{error}{conflict ? <Button onClick={() => void loadVersion()}>최신 버전 확인</Button> : <Button disabled={busy} onClick={() => void save()}>다시 시도</Button>}</Alert>}
    {saved && <Alert severity="success" sx={{ my: 1 }}>저장했습니다. 홈 목록을 갱신했습니다.</Alert>}
    <Button fullWidth variant="contained" disabled={busy || conflict} onClick={() => void save()} sx={{ mt: 2 }}>{busy ? '저장 중' : '저장'}</Button>
    </>}
    <Dialog open={deleteIndex !== null} onClose={() => setDeleteIndex(null)} slotProps={{ paper: { sx: { borderRadius: '8px' } } }}><DialogTitle>조건 삭제</DialogTitle><DialogContent>선택한 조건을 삭제할까요? 목록의 저장 버튼을 누르면 적용됩니다.</DialogContent><DialogActions><Button onClick={() => setDeleteIndex(null)}>취소</Button><Button color="error" onClick={() => { setDraft({ ...draft, conditions: draft.conditions.filter((_, i) => i !== deleteIndex) }); setDeleteIndex(null); setSaved(false); }}>삭제</Button></DialogActions></Dialog>
  </Box>;
}
