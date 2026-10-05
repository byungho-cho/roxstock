import { useTargetArrivals } from '../../hooks/useTargetArrivals';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DateField, FormTextField, NumberField } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { deleteTrade, getTradeDetail, updateTrade } from '../../data/roxstockApi';
import { formatWon } from '../../utils/format';
import { useActiveAccount } from '../../hooks/useActiveAccount';

const kstDate = (value: string) => new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const dateTime = (date: string) => new Date(`${date}T12:00:00+09:00`).toISOString();

export function LiveTradeEditPage() {
  const { accountId } = useActiveAccount();
  const [params] = useSearchParams();
  const type = params.get('type') === 'sell' ? 'sell' : 'buy';
  const tradeId = params.get('edit') ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['tradeDetail', type, tradeId], queryFn: () => getTradeDetail(type, tradeId), enabled: !!tradeId });
  const [form, setForm] = useState<{ key: string; date: string; quantity: string; price: string; memo: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const targets = useTargetArrivals();
  const representative = targets.data?.data.find(lot => lot.lotId === tradeId)?.representativeCondition;
  const trade = detail.data;
  const mismatch = !!trade && (trade.type !== type.toUpperCase() || (!!accountId && trade.account.id !== accountId));

  useEffect(() => {
    if (!trade) return;
    setForm({
      key: `${type}:${tradeId}`,
      date: kstDate((type === 'buy' ? trade.boughtAt : trade.soldAt) ?? ''),
      quantity: trade.quantity, price: trade.unitPrice, memo: trade.memo ?? '',
    });
  }, [trade, type]);

  const returnPath = params.get('return') === 'targets' ? '/detail/target-arrivals' : params.get('return') === 'home' ? '/' : params.get('return') === 'journal'
    ? `/journal?date=${encodeURIComponent(params.get('fromDate') ?? form?.date ?? '')}`
    : `/stocks/${encodeURIComponent(trade?.security.id ?? params.get('stock') ?? '')}?tab=trades`;
  const refresh = async () => {
    await Promise.all(['targetArrivals', 'recentBuys', 'tradeDetail', 'stockTrades', 'journalTrades', 'buyLots', 'stocks', 'dashboard', 'cashOverview', 'cashTransactions'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })));
  };
  const save = async () => {
    if (!form || !trade || busy) return;
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price <= 0) {
      setError('날짜, 수량, 단가를 확인해 주세요.'); return;
    }
    if (type === 'buy' && quantity < Number(trade.soldQuantity ?? 0)) {
      setError(`연결된 매도 수량 ${trade.soldQuantity}주보다 매수 수량을 줄일 수 없습니다.`); return;
    }
    setBusy(true); setError('');
    try {
      const originalDateTime = (type === 'buy' ? trade.boughtAt : trade.soldAt)!;
      await updateTrade(type, tradeId, {
        quantity: form.quantity, unitPrice: form.price, memo: form.memo || null,
        [type === 'buy' ? 'boughtAt' : 'soldAt']: form.date === kstDate(originalDateTime) ? originalDateTime : dateTime(form.date),
      });
      await refresh();
      navigate(returnPath, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '거래 수정에 실패했습니다.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!trade || busy) return;
    setBusy(true); setError('');
    try {
      await deleteTrade(type, tradeId, type === 'buy' && !!trade.sellTrades?.length);
      await refresh();
      navigate(returnPath, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '거래 삭제에 실패했습니다.'); setConfirmOpen(false); }
    finally { setBusy(false); }
  };

  return <Stack spacing={1.5} sx={{ p: 2, pb: 10, maxWidth: 680, mx: 'auto' }}>
    <PageHeader embedded compact showAdd={false} title={type === 'buy' ? '매수 거래 상세' : '매도 거래 상세'} />
    {detail.isPending || !accountId && !!trade ? <Box role="status" aria-label="거래 정보를 불러오는 중"><Skeleton variant="rounded" height={55} /><Skeleton variant="rounded" height={55} sx={{ mt: 1 }} /><Skeleton variant="rounded" height={55} sx={{ mt: 1 }} /></Box>
      : detail.isError ? <Alert severity="error">거래 정보를 불러오지 못했습니다. <Button onClick={() => void detail.refetch()}>다시 시도</Button></Alert>
      : !trade || mismatch ? <Alert severity="error">현재 계좌의 거래가 아닙니다.</Alert>
      : form?.key === `${type}:${tradeId}` && <>
        <Typography sx={{ fontWeight: 700 }}>{trade.security.name} ({trade.security.symbol}) · {trade.account.name}</Typography>
        {type === 'buy' && representative && <Typography sx={{ fontSize: 12 }}>대표 충족 조건: {representative.days}일 이내 · {representative.rate}% 이상</Typography>}
        {type === 'sell' && <Typography>연결 매수 Lot #{trade.buyTradeId}</Typography>}
        <DateField label="거래일자" value={form.date} onChange={(date) => setForm({ ...form, date })} />
        <NumberField label="수량" value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} suffix="주" min={1} />
        <NumberField label="단가" value={form.price} onChange={(price) => setForm({ ...form, price })} suffix="원" min={1} />
        <FormTextField label="메모" value={form.memo} onChange={(memo) => setForm({ ...form, memo })} />
        <Alert severity="info">등록 당시 거래비용 {formatWon(Number(trade.cashTransaction?.feeTaxAmount ?? 0))} · 수정과 삭제는 현재 예수금 및 과거 내역을 자동 보정하지 않습니다. 필요한 예수금 변경은 직접 처리해 주세요.</Alert>
        {type === 'buy' && !!trade.sellTrades?.length && <Alert severity="warning">이 매수에는 매도 {trade.sellTrades.length}건이 연결되어 있습니다. 삭제 시 연결된 매도도 함께 삭제됩니다.</Alert>}
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={() => navigate(returnPath)} disabled={busy}>취소</Button>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>{busy ? <CircularProgress size={20} /> : '수정'}</Button>
          <Button color="error" onClick={() => setConfirmOpen(true)} disabled={busy}>삭제</Button>
        </Box>
        <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)}>
          <DialogTitle>거래 삭제</DialogTitle>
          <DialogContent><Typography>이 거래를 삭제할까요? {type === 'buy' && !!trade.sellTrades?.length ? `연결된 매도 ${trade.sellTrades.length}건도 함께 삭제됩니다.` : ''} 예수금과 과거 스냅샷은 자동 변경되지 않습니다.</Typography></DialogContent>
          <DialogActions><Button onClick={() => setConfirmOpen(false)} disabled={busy}>취소</Button><Button color="error" onClick={() => void remove()} disabled={busy}>삭제</Button></DialogActions>
        </Dialog>
      </>}
  </Stack>;
}

