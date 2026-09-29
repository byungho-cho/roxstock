import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { AppCard } from '../../components/common/Common';
import { DateField, FormTextField, NumberField } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { chooseAccount, currentAccountId, createCashTransaction, getCashHistory, getCashOverview, listAccounts, type CashTransactionDto } from '../../data/roxstockApi';
import { useDashboard } from '../../hooks/useMockData';
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

export function LiveCashPage() {
  const { data, isPending, isError, refetch } = useDashboard();
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounts', 'api'], queryFn: listAccounts });
  const accountId = chooseAccount(accounts.data ?? [])?.id;
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(Number(initialMonth.slice(0, 4)));
  const [visibleCount, setVisibleCount] = useState(10);
  const touchStart = useRef<number | null>(null);
  const overview = useQuery({ queryKey: ['cashOverview', accountId, mode, year, month], queryFn: () => getCashOverview(accountId!, mode === 'month' ? Number(month.slice(0, 4)) : year, Number(month.slice(5))), enabled: !!accountId });
  const history = useQuery({ queryKey: ['cashTransactions', accountId, visibleCount], queryFn: async () => {
    const first = await getCashHistory(accountId!, Math.min(visibleCount, 100));
    const pages = [first];
    for (let offset = 100; offset < Math.min(visibleCount, first.meta.total); offset += 100) {
      pages.push(await getCashHistory(accountId!, Math.min(100, visibleCount - offset), offset));
    }
    return { data: pages.flatMap((page) => page.data), meta: first.meta };
  }, enabled: !!accountId });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const changePeriod = (delta: number) => {
    if (mode === 'month') setMonth((previous) => { const next = monthShift(previous, delta); return next > initialMonth ? previous : next; });
    else setYear((previous) => Math.min(Number(initialMonth.slice(0, 4)), previous + delta));
  };
  const submit = async () => {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) { setError('0원보다 큰 금액을 입력해 주세요.'); return; }
    setSaving(true); setError('');
    try {
      await createCashTransaction({ accountId: await currentAccountId(), transactionType: type, transactionDate: new Date(`${date}T12:00:00+09:00`).toISOString(), amount, memo: memo || null });
      await Promise.all(['dashboard', 'cashOverview', 'cashTransactions'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      setOpen(false); setAmount(''); setMemo('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '예수금 등록에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  const period = mode === 'month' ? overview.data?.monthly : overview.data?.yearly;
  const deposit = Number(period?.deposit ?? 0);
  const withdrawal = Number(period?.withdrawal ?? 0);
  const dividend = Number(period?.dividend ?? 0);
  const net = Number(period?.netChange ?? 0);
  const entries = history.data?.data ?? [];
  const loading = accounts.isPending || (!!accountId && (overview.isPending || history.isPending));
  const failed = accounts.isError || overview.isError || history.isError;
  return <Box>
    <Snackbar open={isError && !!data} message="최신 예수금 조회에 실패했습니다. 이전 값을 표시합니다." />
    <PageHeader title="예수금" backPath="/" addLabel="예수금 등록" onAdd={() => setOpen(true)} embedded />
    {isPending ? <Typography role="status">예수금을 불러오는 중입니다.</Typography> :
      isError && !data ? <Button role="alert" onClick={() => void refetch()}>예수금 조회 실패 · 다시 시도</Button> :
      loading ? <Typography role="status">예수금 내역을 불러오는 중입니다.</Typography> :
      failed ? <Button role="alert" onClick={() => { void accounts.refetch(); void overview.refetch(); void history.refetch(); }}>예수금 내역 조회 실패 · 다시 시도</Button> :
      !accountId ? <Typography role="status">선택된 계좌가 없습니다.</Typography> :
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: '8px', sm: '16px' }, minWidth: 0, height: { sm: '100%' }, alignItems: 'start' }}>
        <Stack spacing="8px" sx={{ minWidth: 0 }}>
          <AppCard sx={{ height: 96, borderRadius: '8px', p: { xs: '10px 16px', sm: '10px 17px' } }}>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography sx={{ color: colors.textSecondary, fontSize: 12 }}>현재 예수금</Typography></Stack>
            <Typography sx={{ color: colors.warning, fontSize: 28, fontWeight: 700, textAlign: 'right', lineHeight: '36px', whiteSpace: 'nowrap' }}>{formatWon(data?.summary.cashBalance ?? Number.NaN)}</Typography>
            <Stack direction="row" sx={{ justifyContent: "space-between", mt: "2px" }}><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>{overview.data?.account.updatedAt ? shortDate(overview.data.account.updatedAt) + ' 갱신' : ''}</Typography><Typography sx={{ display: { xs: 'none', sm: 'block' }, color: amountColor(Number(overview.data?.monthly.netChange ?? 0)), fontSize: 11 }}>이번달 {signed(Number(overview.data?.monthly.netChange ?? 0))}</Typography></Stack>
          </AppCard>
          <AppCard onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={(event) => { if (touchStart.current !== null && Math.abs(event.changedTouches[0].clientX - touchStart.current) > 55) changePeriod(event.changedTouches[0].clientX < touchStart.current ? 1 : -1); touchStart.current = null; }} sx={{ minHeight: { xs: 102, sm: 223 }, borderRadius: '8px', px: { xs: '15px', sm: '17px' }, py: '10px', touchAction: 'pan-y' }}>
            <Stack direction="row" sx={{ alignItems: "center", borderBottom: `1px solid ${colors.border}`, pb: { xs: '7px', sm: '12px' } }}>
              <IconButton aria-label="이전 기간" size="small" onClick={() => changePeriod(-1)} sx={{ width: 24, height: 24, p: 0, flexShrink: 0 }}><ChevronLeftRounded sx={{ fontSize: 16 }} /></IconButton>
              <Typography sx={{ flex: 1, minWidth: 0, textAlign: 'center', fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap' }}>{mode === 'month' ? `${month.slice(0, 4)}년 ${Number(month.slice(5))}월` : `${year}년`}</Typography>
              <IconButton aria-label="다음 기간" size="small" onClick={() => changePeriod(1)} sx={{ width: 24, height: 24, p: 0, flexShrink: 0 }}><ChevronRightRounded sx={{ fontSize: 16 }} /></IconButton>
              <Button onClick={() => setMode((previous) => previous === 'month' ? 'year' : 'month')} aria-label="월간 연간 전환" sx={{ ml: 1, minWidth: 54, flexShrink: 0, height: 24, bgcolor: colors.raised, color: colors.focus, borderRadius: '12px', fontSize: 10 }}>{mode === 'month' ? '월간' : '연간'}</Button>
            </Stack>
            <Stack direction={{ xs: 'row', sm: 'column' }} sx={{ justifyContent: 'space-between', mt: { xs: '7px', sm: 0 } }}>
              {([['출금', withdrawal, colors.marketFall], ['입금', deposit, colors.marketRise], ['배당', dividend, colors.textPrimary], ['순변동', net, amountColor(net)]] as const).map(([label, value, color]) => <Stack key={label} direction={{ xs: 'column', sm: 'row' }} sx={{ display: { xs: label === '출금' || label === '입금' ? 'flex' : 'none', sm: 'flex' }, justifyContent: 'space-between', flex: 1, height: { sm: label === '순변동' ? 42 : 34 }, alignItems: { sm: 'center' }, borderBottom: { sm: label === '순변동' ? 'none' : `1px solid ${colors.border}` } }}><Typography sx={{ fontSize: { xs: 10, sm: 12 }, color: colors.textMuted }}>{label}</Typography><Typography sx={{ textAlign: 'right', fontSize: { xs: 12, sm: 16 }, fontWeight: 600, color }}>{label === '순변동' ? signed(value) : formatWon(value)}</Typography></Stack>)}
            </Stack>
          </AppCard>
        </Stack>
        <AppCard sx={{ borderRadius: '8px', p: { xs: '12px 15px', sm: '10px 17px' }, minWidth: 0, height: { sm: '100%' }, minHeight: { sm: 327 }, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography sx={{ fontSize: 16, fontWeight: 700 }}>최근 변경</Typography><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>최근 {Math.min(history.data?.meta.total ?? 0, visibleCount)}개</Typography></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 64px 1.4fr', sm: '58px 44px 1fr 1fr' }, gap: 1, mt: 1, color: colors.textMuted, fontSize: 10 }}><Box sx={{ display: { xs: 'none', sm: 'block' } }}>날짜</Box><Box>구분</Box><Box sx={{ display: { xs: 'block', sm: 'none' } }}>날짜</Box><Box sx={{ textAlign: 'right' }}>금액</Box><Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right' }}>잔액</Box></Box>
          <Box sx={{ minHeight: 0, overflowY: { sm: 'auto' }, scrollbarWidth: 'thin', flex: 1 }}>
            {entries.map((entry) => <Box key={entry.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 64px 1.4fr', sm: '58px 44px 1fr 1fr' }, gap: 1, alignItems: 'center', height: { xs: 30, sm: 32 }, borderBottom: { sm: `1px solid ${colors.border}` } }}><Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11, color: colors.textMuted }}>{shortDate(entry.transactionDate)}</Typography><Typography sx={{ fontSize: 11, color: amountColor(Number(entry.signedAmount)) }}>{labels[entry.transactionType]}</Typography><Typography sx={{ display: { xs: 'block', sm: 'none' }, fontSize: 10, color: colors.textMuted }}>{shortDate(entry.transactionDate)}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap', color: amountColor(Number(entry.signedAmount)) }}>{signed(Number(entry.signedAmount))}</Typography><Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11, textAlign: 'right' }}>{formatWon(Number(entry.balanceAfter))}</Typography></Box>)}
            {!entries.length && <Typography role="status" sx={{ mt: 2, color: colors.textMuted, fontSize: 12 }}>예수금 내역이 없습니다.</Typography>}
            {(history.data?.meta.total ?? 0) > entries.length && <Button fullWidth onClick={() => setVisibleCount((count) => count + 30)} sx={{ mt: 1, color: colors.textSecondary, fontSize: 11 }}>이전 내역 더보기</Button>}
          </Box>
        </AppCard>
      </Box>}
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>예수금 등록</DialogTitle>
      <DialogContent><Stack spacing={1.5} sx={{ pt: 1 }}>
        <Stack direction="row" spacing={1}><Button variant={type === 'DEPOSIT' ? 'contained' : 'outlined'} onClick={() => setType('DEPOSIT')}>입금</Button><Button variant={type === 'WITHDRAWAL' ? 'contained' : 'outlined'} onClick={() => setType('WITHDRAWAL')}>출금</Button></Stack>
        <DateField label="거래일자" value={date} onChange={setDate} />
        <NumberField label="금액" value={amount} onChange={setAmount} suffix="원" required autoFocus enterKeyHint="next" />
        <FormTextField label="메모" value={memo} onChange={setMemo} enterKeyHint="done" onEnter={submit} />
        {error && <Typography role="alert" color="error" sx={{ fontSize: 12 }}>{error}</Typography>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setOpen(false)} disabled={saving}>취소</Button><Button variant="contained" onClick={submit} disabled={saving || !amount.trim()}>등록</Button></DialogActions>
    </Dialog>
  </Box>;
}
