import { Box, Button, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppCard } from '../../components/common/Common';
import { DateField, FormTextField, NumberField } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { currentAccountId, createCashTransaction } from '../../data/roxstockApi';
import { useDashboard } from '../../hooks/useMockData';
import { formatWon } from '../../utils/format';
import { colors } from '../../styles/tokens';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

/** Keep the existing shell while cash history/edit APIs are unavailable. */
export function LiveCashPage() {
  const { data, isPending, isError, refetch } = useDashboard();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) { setError('0원보다 큰 금액을 입력해 주세요.'); return; }
    setSaving(true); setError('');
    try {
      await createCashTransaction({
        accountId: await currentAccountId(), transactionType: type,
        transactionDate: new Date(`${date}T12:00:00+09:00`).toISOString(),
        amount, memo: memo || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false); setAmount(''); setMemo('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '예수금 등록에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  return <Box>
    <PageHeader title="예수금" subtitle="계좌 현금 잔액" backPath="/" addLabel="예수금 등록" onAdd={() => setOpen(true)} embedded />
    {isPending ? <Typography role="status">예수금을 불러오는 중입니다.</Typography> :
      isError ? <Button role="alert" onClick={() => void refetch()}>예수금 조회 실패 · 다시 시도</Button> :
      <AppCard><CardContent><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>현재 예수금</Typography><Typography sx={{ mt: 1, color: colors.warning, fontSize: 28, fontWeight: 700 }}>{formatWon(data?.summary.cashBalance ?? Number.NaN)}</Typography></CardContent></AppCard>}
    <Typography role="status" sx={{ mt: 2, color: colors.textMuted, fontSize: 12 }}>예수금 거래내역 조회 API가 준비되지 않아 내역과 월별 합계는 표시할 수 없습니다.</Typography>
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
