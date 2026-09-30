import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, CircularProgress, IconButton, Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppCard } from '../../components/common/Common';
import { DateField, FormSelect, FormTextField, NumberField } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { createCashTransaction, createDividend, deleteCashTransaction, getCashHistory, getCashOverview, updateCashTransaction, type CashTransactionDto } from '../../data/roxstockApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { useStocks } from '../../hooks/useMockData';
import { formatWon } from '../../utils/format';
import { colors } from '../../styles/tokens';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const initialMonth = today().slice(0, 7);
const labels: Record<CashTransactionDto['transactionType'], string> = { BUY: '매수', SELL: '매도', DEPOSIT: '입금', WITHDRAWAL: '출금', DIVIDEND: '배당' };
const monthShift = (month: string, delta: number) => {
  const [year, number] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, number - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
};
const shortDate = (date: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }).format(new Date(date)).replace(/\s/g, '').replace(/\.$/, '');
const amountColor = (amount: number) => amount > 0 ? colors.marketRise : amount < 0 ? colors.marketFall : colors.textPrimary;
const signed = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatWon(Math.abs(amount))}`;
const overviewQuery = (accountId: string, mode: 'month' | 'year', period: string | number) => ({
  queryKey: ['cashOverview', accountId, mode, period] as const,
  queryFn: () => getCashOverview(accountId, mode === 'month' ? Number(String(period).slice(0, 4)) : Number(period), mode === 'month' ? Number(String(period).slice(5)) : undefined),
  staleTime: 60_000,
});

export function LiveCashPage() {
  const queryClient = useQueryClient();
  const { accountId, accounts } = useActiveAccount();
  const holdingStocks = useStocks('holding');
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(Number(initialMonth.slice(0, 4)));
  const [olderMonths, setOlderMonths] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const balance = useQuery({ queryKey: ['cashBalance', accountId], queryFn: () => getCashOverview(accountId!), enabled: !!accountId });
  const overview = useQuery({ ...overviewQuery(accountId ?? '', mode, mode === 'month' ? month : year), enabled: !!accountId });
  useEffect(() => {
    if (!accountId || !overview.data || overview.isError) return;
    const adjacent = mode === 'month' ? [monthShift(month, -1), monthShift(month, 1)].filter((target) => target <= initialMonth) : [year - 1, year + 1].filter((target) => target <= Number(initialMonth.slice(0, 4)));
    for (const period of adjacent) void queryClient.prefetchQuery(overviewQuery(accountId, mode, period));
  }, [accountId, mode, month, year, overview.data, overview.isError, queryClient]);
  const history = useQuery({ queryKey: ['cashTransactions', accountId, olderMonths], queryFn: async () => {
    const first = await getCashHistory(accountId!, 10);
    const oldestDate = first.data.at(-1)?.transactionDate;
    if (!oldestDate || !olderMonths) return first;
    const oldestMonth = new Date(oldestDate).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7);
    const older = [];
    for (let index = 0; index < olderMonths; index++) {
      const month = monthShift(oldestMonth, -index);
      const [year, number] = month.split('-').map(Number);
      const to = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
      const range = { from: `${month}-01`, to };
      const page = await getCashHistory(accountId!, 100, 0, range);
      older.push(...page.data);
      for (let offset = 100; offset < page.meta.total; offset += 100) {
        older.push(...(await getCashHistory(accountId!, 100, offset, range)).data);
      }
    }
    return { data: [...new Map([...first.data, ...older].map((item) => [item.id, item])).values()].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || (BigInt(b.id) > BigInt(a.id) ? 1 : -1)), meta: first.meta };
  }, enabled: !!accountId, placeholderData: (previous, query) => query?.queryKey[1] === accountId ? previous : undefined });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CashTransactionDto | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND'>('DEPOSIT');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [gross, setGross] = useState('');
  const [tax, setTax] = useState('');
  const [securityId, setSecurityId] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const openCreate = () => { setEditing(null); setEditingAccountId(accountId ?? null); setType('DEPOSIT'); setDate(today()); setAmount(''); setGross(''); setTax(''); setSecurityId(''); setMemo(''); setError(''); setOpen(true); };
  const openEdit = (entry: CashTransactionDto) => {
    if (entry.transactionType === 'BUY' || entry.transactionType === 'SELL') return;
    setEditing(entry); setEditingAccountId(accountId ?? null); setType(entry.transactionType);
    setDate(new Date(entry.transactionDate).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }));
    setAmount(entry.amount); setGross(entry.dividend?.grossAmount ?? '');
    setTax(entry.dividend ? String(Number(entry.dividend.grossAmount) - Number(entry.dividend.netAmount)) : '');
    setSecurityId(entry.dividend?.securityId ?? ''); setMemo(entry.memo ?? ''); setError(''); setOpen(true);
  };
  const invalidateCash = async () => Promise.all(['accounts', 'dashboard', 'cashBalance', 'cashOverview', 'cashTransactions', 'assetHistory'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));

  const changePeriod = (delta: number) => {
    if (mode === 'month') setMonth((previous) => { const next = monthShift(previous, delta); return next > initialMonth ? previous : next; });
    else setYear((previous) => Math.min(Number(initialMonth.slice(0, 4)), previous + delta));
  };
  const handleTouchEnd = (x: number, y: number) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const horizontal = x - start.x;
    if (Math.abs(horizontal) > 55 && Math.abs(horizontal) > Math.abs(y - start.y)) changePeriod(horizontal < 0 ? 1 : -1);
  };
  const submit = async () => {
    if (!accountId || accountId !== editingAccountId) { setError('계좌가 변경됐습니다. 다시 열어 주세요.'); return; }
    if (!date || !Number.isFinite(Number(amount)) || Number(amount) <= 0) { setError('날짜와 0원보다 큰 금액을 입력해 주세요.'); return; }
    if (type === 'DIVIDEND' && (!securityId || !Number.isFinite(Number(gross)) || Number(gross) < Number(amount) || Number(tax) < 0)) { setError('종목과 올바른 세전·세후 배당금을 입력해 주세요.'); return; }
    setSaving(true); setError('');
    try {
      const transactionDate = new Date(`${date}T12:00:00+09:00`).toISOString();
      if (editing) await updateCashTransaction(editing.id, { transactionDate, amount, memo: memo || null, ...(type === 'DIVIDEND' ? { securityId, grossAmount: gross } : {}) });
      else if (type === 'DIVIDEND') await createDividend({ accountId, securityId, receivedDate: transactionDate, grossAmount: gross, netAmount: amount, memo: memo || null });
      else await createCashTransaction({ accountId, transactionType: type, transactionDate, amount, memo: memo || null });
      await invalidateCash();
      setOpen(false); setAmount(''); setMemo('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '예수금 등록에 실패했습니다.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!editing || !accountId || accountId !== editingAccountId) return;
    setSaving(true); setError('');
    try { await deleteCashTransaction(editing.id); await invalidateCash(); setConfirmDelete(false); setOpen(false); }
    catch (cause) { setConfirmDelete(false); setError(cause instanceof Error ? cause.message : '삭제에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  const period = mode === 'month' ? overview.data?.monthly : overview.data?.yearly;
  const deposit = Number(period?.deposit ?? 0);
  const withdrawal = Number(period?.withdrawal ?? 0);
  const dividend = Number(period?.dividend ?? 0);
  const net = Number(period?.netChange ?? 0);
  const entries = history.data?.data ?? [];
  return <Box>
    <Snackbar open={balance.isError && !!balance.data} message="최신 예수금 조회에 실패했습니다. 이전 값을 표시합니다." />
    <PageHeader title="예수금" backPath="/" addLabel="예수금 등록" onAdd={openCreate} embedded />
    {accounts.isError ? <Button role="alert" onClick={() => void accounts.refetch()}>계좌 조회 실패 · 다시 시도</Button> :
      !accounts.isPending && !accountId ? <Typography role="status">선택된 계좌가 없습니다.</Typography> :
      <Box onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={(event) => { const touch = event.changedTouches[0]; if (touch) handleTouchEnd(touch.clientX, touch.clientY); }} onTouchCancel={() => { touchStart.current = null; }} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: '8px', sm: '16px' }, minWidth: 0, height: { sm: '100%' }, alignItems: 'start', touchAction: 'pan-y' }}>
        <Stack spacing="8px" sx={{ minWidth: 0 }}>
          <AppCard sx={{ height: 96, borderRadius: '8px', p: { xs: '10px 16px', sm: '10px 17px' } }}>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography sx={{ color: colors.textSecondary, fontSize: 12 }}>현재 예수금</Typography></Stack>
            <Typography sx={{ color: colors.warning, fontSize: 28, fontWeight: 700, textAlign: 'right', lineHeight: '36px', whiteSpace: 'nowrap' }}>{balance.data ? formatWon(Number(balance.data.account.currentBalance)) : <Skeleton variant="text" width="70%" sx={{ ml: 'auto' }} />}</Typography>
            <Stack direction="row" sx={{ justifyContent: "space-between", mt: "2px" }}><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>{balance.data?.account.updatedAt ? shortDate(balance.data.account.updatedAt) + ' 갱신' : ''}</Typography><Typography sx={{ display: { xs: 'none', sm: 'block' }, color: amountColor(Number(balance.data?.monthly.netChange ?? 0)), fontSize: 11 }}>이번달 {balance.data ? signed(Number(balance.data.monthly.netChange)) : '—'}</Typography></Stack>
          </AppCard>
          <AppCard sx={{ minHeight: { xs: 102, sm: 223 }, borderRadius: '8px', px: { xs: '15px', sm: '17px' }, py: '10px' }}>
            <Stack direction="row" sx={{ alignItems: "center", borderBottom: `1px solid ${colors.border}`, pb: { xs: '7px', sm: '12px' } }}>
              <IconButton aria-label="이전 기간" size="small" onClick={() => changePeriod(-1)} sx={{ width: 24, height: 24, p: 0, flexShrink: 0 }}><ChevronLeftRounded sx={{ fontSize: 16 }} /></IconButton>
              <Typography sx={{ flex: 1, minWidth: 0, textAlign: 'center', fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap' }}>{mode === 'month' ? `${month.slice(0, 4)}년 ${Number(month.slice(5))}월` : `${year}년`}</Typography>
              <IconButton aria-label="다음 기간" size="small" onClick={() => changePeriod(1)} sx={{ width: 24, height: 24, p: 0, flexShrink: 0 }}><ChevronRightRounded sx={{ fontSize: 16 }} /></IconButton>
              <Button onClick={() => setMode((previous) => previous === 'month' ? 'year' : 'month')} aria-label="월간 연간 전환" sx={{ ml: 1, minWidth: 54, flexShrink: 0, height: 24, bgcolor: colors.raised, color: colors.focus, borderRadius: '12px', fontSize: 10 }}>{mode === 'month' ? '월간' : '연간'}</Button>
            </Stack>
            <Stack direction={{ xs: 'row', sm: 'column' }} sx={{ justifyContent: 'space-between', mt: { xs: '7px', sm: 0 } }}>
              {([['출금', withdrawal, colors.marketFall], ['입금', deposit, colors.marketRise], ['배당', dividend, colors.textPrimary], ['순변동', net, amountColor(net)]] as const).map(([label, value, color]) => <Stack key={label} direction={{ xs: 'column', sm: 'row' }} sx={{ display: { xs: label === '출금' || label === '입금' ? 'flex' : 'none', sm: 'flex' }, justifyContent: 'space-between', flex: 1, height: { sm: label === '순변동' ? 42 : 34 }, alignItems: { sm: 'center' }, borderBottom: { sm: label === '순변동' ? 'none' : `1px solid ${colors.border}` } }}><Typography sx={{ fontSize: { xs: 10, sm: 12 }, color: colors.textMuted }}>{label}</Typography><Typography sx={{ textAlign: 'right', fontSize: { xs: 12, sm: 16 }, fontWeight: 600, color }}>{overview.data ? label === '순변동' ? signed(value) : formatWon(value) : <Skeleton variant="text" width={54} />}</Typography></Stack>)}
            </Stack>
            {overview.isError && !overview.data && <Button size="small" role="alert" onClick={() => void overview.refetch()}>기간 조회 실패 · 다시 시도</Button>}
            {overview.isFetching && overview.data && <Typography role="status" sx={{ fontSize: 10, color: colors.textMuted }}>갱신 중</Typography>}
          </AppCard>
        </Stack>
        <AppCard sx={{ borderRadius: '8px', p: { xs: '12px 15px', sm: '10px 17px' }, minWidth: 0, height: { sm: '100%' }, minHeight: { sm: 327 }, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography sx={{ fontSize: 16, fontWeight: 700 }}>최근 변경</Typography><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>최근 {entries.length}개</Typography></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 64px 1.4fr', sm: '58px 44px 1fr 1fr' }, gap: 1, mt: 1, color: colors.textMuted, fontSize: 10 }}><Box sx={{ display: { xs: 'none', sm: 'block' } }}>날짜</Box><Box>구분</Box><Box sx={{ display: { xs: 'block', sm: 'none' } }}>날짜</Box><Box sx={{ textAlign: 'right' }}>금액</Box><Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>잔액</Box></Box>
          <Box sx={{ minHeight: 0, overflowY: { sm: 'auto' }, scrollbarWidth: 'thin', flex: 1 }}>
            {entries.map((entry) => <Box key={entry.id} component={entry.transactionType === 'BUY' || entry.transactionType === 'SELL' ? 'div' : 'button'} type={entry.transactionType === 'BUY' || entry.transactionType === 'SELL' ? undefined : 'button'} onClick={() => openEdit(entry)} aria-label={entry.transactionType === 'BUY' || entry.transactionType === 'SELL' ? undefined : `${labels[entry.transactionType]} 내역 수정`} sx={{ width: '100%', color: 'inherit', bgcolor: 'transparent', border: 0, p: 0, textAlign: 'left', cursor: entry.transactionType === 'BUY' || entry.transactionType === 'SELL' ? 'default' : 'pointer', display: 'grid', gridTemplateColumns: { xs: '1fr 64px 1.4fr', sm: '58px 44px 1fr 1fr' }, gap: 1, alignItems: 'center', height: { xs: 30, sm: 32 }, borderBottom: { sm: `1px solid ${colors.border}` } }}><Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11, color: colors.textMuted }}>{shortDate(entry.transactionDate)}</Typography><Typography sx={{ fontSize: 11, color: amountColor(Number(entry.signedAmount)) }}>{labels[entry.transactionType]}</Typography><Typography sx={{ display: { xs: 'block', sm: 'none' }, fontSize: 10, color: colors.textMuted }}>{shortDate(entry.transactionDate)}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap', color: amountColor(Number(entry.signedAmount)) }}>{signed(Number(entry.signedAmount))}</Typography><Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11, textAlign: 'right' }}>{formatWon(Number(entry.balanceAfter))}</Typography></Box>)}
            {history.isPending && <Stack spacing={1} role="status" aria-label="예수금 내역을 불러오는 중"><Skeleton variant="text" /><Skeleton variant="text" /><Skeleton variant="text" /></Stack>}
            {history.isError && !history.data && <Button role="alert" onClick={() => void history.refetch()}>내역 조회 실패 · 다시 시도</Button>}
            {!history.isPending && !history.isError && !entries.length && <Typography role="status" sx={{ mt: 2, color: colors.textMuted, fontSize: 12 }}>예수금 내역이 없습니다.</Typography>}
            {history.isFetching && history.data && <Stack direction="row" spacing={1} role="status" sx={{ my: 1, alignItems: "center", color: colors.textMuted }}><CircularProgress size={14} /><Typography sx={{ fontSize: 11 }}>내역 갱신 중</Typography></Stack>}
            {history.isError && !!history.data && <Button role="alert" onClick={() => void history.refetch()} sx={{ alignSelf: 'flex-start', fontSize: 11 }}>추가 내역 조회 실패 · 다시 시도</Button>}
            {!history.isFetching && (history.data?.meta.total ?? 0) > entries.length && <Button fullWidth onClick={() => setOlderMonths((count) => count + 1)} sx={{ mt: 1, color: colors.textSecondary, fontSize: 11 }}>이전 한 달 더보기</Button>}
          </Box>
        </AppCard>
      </Box>}
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>예수금 {editing ? '내역 수정' : '등록'}</DialogTitle>
      <DialogContent><Stack spacing={1.5} sx={{ pt: 1 }}>
        <Stack direction="row" spacing={1}>{(['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND'] as const).map((option) => <Button key={option} disabled={!!editing && type !== option} variant={type === option ? 'contained' : 'outlined'} onClick={() => setType(option)}>{labels[option]}</Button>)}</Stack>
        <DateField label="거래일자" value={date} onChange={setDate} />
        {type === 'DIVIDEND' && <><FormSelect label="배당 종목" value={securityId} onChange={setSecurityId} options={holdingStocks.data?.map((stock) => ({ value: stock.id, label: stock.name })) ?? []} /><NumberField label="세전 배당금" value={gross} onChange={(value) => { setGross(value); setAmount(String(Math.max(0, Number(value) - Number(tax)))); }} suffix="원" required /><NumberField label="원천징수 세금" value={tax} onChange={(value) => { setTax(value); setAmount(String(Math.max(0, Number(gross) - Number(value)))); }} suffix="원" /></>}
        <NumberField label={type === 'DIVIDEND' ? '세후 배당금' : '금액'} value={amount} onChange={setAmount} suffix="원" required autoFocus enterKeyHint="next" />
        <FormTextField label="메모" value={memo} onChange={setMemo} enterKeyHint="done" onEnter={submit} />
        {editing && <Typography sx={{ fontSize: 11, color: colors.textMuted }}>과거 내역을 수정해도 현재 예수금은 자동으로 변경되지 않습니다. 현재 잔액은 설정에서 직접 수정할 수 있습니다.</Typography>}
        {error && <Typography role="alert" color="error" sx={{ fontSize: 12 }}>{error}</Typography>}
      </Stack></DialogContent>
      <DialogActions>{editing && <Button color="error" onClick={() => setConfirmDelete(true)} disabled={saving} sx={{ mr: 'auto' }}>삭제</Button>}<Button onClick={() => setOpen(false)} disabled={saving}>취소</Button><Button variant="contained" onClick={submit} disabled={saving || !amount.trim()}>{saving ? '저장 중…' : editing ? '수정' : '등록'}</Button></DialogActions>
    </Dialog>
    <Dialog open={confirmDelete} onClose={() => !saving && setConfirmDelete(false)}><DialogTitle>예수금 내역 삭제</DialogTitle><DialogContent><Typography>이 내역을 삭제하시겠습니까? 과거 내역 삭제는 현재 계좌 잔액을 자동으로 변경하지 않습니다.</Typography></DialogContent><DialogActions><Button disabled={saving} onClick={() => setConfirmDelete(false)}>취소</Button><Button color="error" disabled={saving} onClick={() => void remove()}>삭제</Button></DialogActions></Dialog>
  </Box>;
}
