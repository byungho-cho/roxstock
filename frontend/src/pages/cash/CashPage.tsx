import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { DateField, FormSelect, FormTextField, NumberField } from '../../components/forms/Fields';
import { stockItems } from '../../data/mockData';
import { loadCash, saveCash } from '../../data/mockCash';
import { colors, pageMetrics } from '../../styles/tokens';
import { navigateToForm } from '../../utils/focusForm';
import type { CashEntry, CashEntryType } from '../../types/models';

const amountText = (value: number) => `${Math.abs(value).toLocaleString('ko-KR')}원`;
const signedText = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${amountText(value)}`;
const tone = (value: number) => value > 0 ? colors.marketRise : value < 0 ? colors.marketFall : colors.marketFlat;
const labels: Record<CashEntryType, string> = { buy: '매수', sell: '매도', deposit: '입금', withdrawal: '출금', dividend: '배당' };
const initialDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

function moveMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

export function CashPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [initialCash] = useState(loadCash);
  const [balance, setBalance] = useState(initialCash.balance);
  const [entries, setEntries] = useState<CashEntry[]>(initialCash.entries);
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState('2026-09');
  const [year, setYear] = useState(2026);
  const [oldestVisibleMonth, setOldestVisibleMonth] = useState('2026-09');
  const [editing, setEditing] = useState<CashEntry | 'new' | 'balance' | null>(null);
  const [deleting, setDeleting] = useState<CashEntry | null>(null);
  const [type, setType] = useState<CashEntryType>('deposit');
  const [date, setDate] = useState(initialDate);
  const [value, setValue] = useState('');
  const [gross, setGross] = useState('');
  const [tax, setTax] = useState('');
  const [memo, setMemo] = useState('');
  const [stockId, setStockId] = useState('hyundai');
  const [error, setError] = useState('');
  const touchStart = useRef<number | null>(null);
  const firstAmountRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveCash(balance, entries); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); }, [balance, entries, queryClient]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const visible = oldestVisibleMonth === '2026-09' ? sorted.slice(0, 10) : sorted.filter((entry) => entry.date.slice(0, 7) >= oldestVisibleMonth);
  const periodEntries = entries.filter((entry) => mode === 'month' ? entry.date.startsWith(month) : entry.date.startsWith(String(year)));
  const total = (target: CashEntryType) => periodEntries.filter((entry) => entry.type === target).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const deposits = total('deposit'); const withdrawals = total('withdrawal'); const dividends = total('dividend');
  const net = deposits - withdrawals + dividends;
  const displayPeriod = mode === 'month' ? `${month.slice(0, 4)}.${month.slice(5)}` : `${year}년`;
  const earliestYear = Math.min(...entries.map((entry) => Number(entry.date.slice(0, 4))));
  const earliestMonth = sorted.at(-1)?.date.slice(0, 7) ?? '2026-09';

  const changePeriod = (delta: number) => {
    if (mode === 'month') setMonth((previous) => { const next = moveMonth(previous, delta); return next > '2026-09' || next < `${earliestYear}-01` ? previous : next; });
    else setYear((previous) => Math.max(earliestYear, Math.min(2026, previous + delta)));
  };
  const openEditor = (item: CashEntry | 'new' | 'balance') => {
    flushSync(() => {
      setEditing(item); setError('');
      if (item === 'balance') { setValue(String(balance)); return; }
      setType(item === 'new' ? 'deposit' : item.type);
      setDate(item === 'new' ? initialDate : item.date);
      setValue(item === 'new' ? '' : String(Math.abs(item.amount)));
      setGross(item === 'new' ? '' : String(item.grossAmount ?? ''));
      setTax(''); setMemo(item === 'new' ? '' : item.memo ?? ''); setStockId(item === 'new' ? 'hyundai' : item.stockId ?? 'hyundai');
    });
    firstAmountRef.current?.focus({ preventScroll: true });
  };
  const save = () => {
    if (editing === 'balance' && !value.trim()) { setError('예수금 금액을 입력해 주세요.'); return; }
    const amount = Number(type === 'dividend' && editing !== 'balance' && !value && gross ? Number(gross) - Number(tax) : value);
    if (!Number.isFinite(amount) || amount < 0 || (!amount && editing !== 'balance') || (editing !== 'balance' && !date)) { setError('날짜와 올바른 금액을 입력해 주세요.'); return; }
    if (editing === 'balance') { setBalance(amount); setEditing(null); return; }
    if (type === 'dividend' && gross && Number(gross) < amount) { setError('세전 배당금은 세후 배당금보다 작을 수 없습니다.'); return; }
    if (type === 'buy' || type === 'sell') { setEditing(null); navigateToForm(navigate, '/trade'); return; }
    const signed = type === 'withdrawal' ? -amount : amount;
    if (editing === 'new') {
      setEntries((previous) => [{ id: `cash-${Date.now()}`, date, type, amount: signed, grossAmount: type === 'dividend' ? Number(gross) || amount + Number(tax) : undefined, stockId: type === 'dividend' ? stockId : undefined, memo }, ...previous]);
      setBalance((previous) => previous + signed);
    } else if (editing) {
      setEntries((previous) => previous.map((item) => item.id === editing.id ? { ...item, date, type, amount: signed, grossAmount: type === 'dividend' ? Number(gross) || amount + Number(tax) : undefined, stockId: type === 'dividend' ? stockId : undefined, memo } : item));
    }
    setEditing(null);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    setEntries((previous) => previous.filter((entry) => entry.id !== deleting.id));
    setDeleting(null); setEditing(null);
  };
  const handleSwipe = (endX: number) => { if (touchStart.current !== null && Math.abs(endX - touchStart.current) > 55) changePeriod(endX < touchStart.current ? -1 : 1); touchStart.current = null; };

  return <Box>
    <PageHeader title="예수금" subtitle="실제 증권계좌에서 사용할 수 있는 현금 잔액입니다" backPath="/" addLabel="예수금 등록" onAdd={() => openEditor('new')} embedded />

    <Stack spacing={`${pageMetrics.gap}px`} sx={{ mt: `${pageMetrics.gap}px` }}>
      <Stack spacing={`${pageMetrics.gap}px`}>
        <AppCard sx={{ minHeight: 112, p: `11px ${pageMetrics.cardInset}px`, borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>현재 예수금</Typography><Button onClick={() => openEditor('balance')} sx={{ minWidth: 54, minHeight: 23, height: 23, p: 0, borderRadius: 3, bgcolor: colors.raised, color: colors.focus, fontSize: 10 }}>수정</Button></Stack>
          <Typography sx={{ color: colors.warning, fontSize: { xs: 28, sm: 29 }, fontWeight: 700, textAlign: 'right', lineHeight: { xs: '36px', sm: '42px' }, whiteSpace: 'nowrap' }}>{amountText(balance)}</Typography>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ display: { xs: 'none', sm: 'block' }, color: tone(net), fontSize: 11 }}>이번 달 {amountText(Math.abs(net))} {net >= 0 ? '증가' : '감소'}</Typography><Typography sx={{ flex: 1, textAlign: 'right', color: colors.textMuted, fontSize: 10, lineHeight: '14px', whiteSpace: 'nowrap' }}>계좌 기준 · 09.20 05:30 갱신</Typography></Stack>
        </AppCard>

        <AppCard sx={{ minHeight: 116, p: `12px ${pageMetrics.cardInset}px`, borderRadius: '16px', touchAction: 'pan-y' }} onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={(event) => handleSwipe(event.changedTouches[0].clientX)}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: '7px' }}>
            <Stack direction="row" sx={{ alignItems: 'center', flex: 1 }}><IconButton aria-label="이전 기간" size="small" onClick={() => changePeriod(-1)}><ChevronLeftRounded sx={{ fontSize: 18 }} /></IconButton><Typography sx={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{displayPeriod}{mode === 'year' ? '' : <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>월</Box>}</Typography><IconButton aria-label="다음 기간" size="small" onClick={() => changePeriod(1)}><ChevronRightRounded sx={{ fontSize: 18 }} /></IconButton></Stack>
            <Button aria-label="월간 연간 전환" onClick={() => { setMode((previous) => previous === 'month' ? 'year' : 'month'); setYear(Number(month.slice(0, 4))); }} sx={{ ml: 1.5, minWidth: 54, minHeight: 24, height: 24, p: 0, borderRadius: 3, bgcolor: colors.raised, color: colors.focus, fontSize: 10 }}>{mode === 'month' ? '월간' : '연간'}</Button>
          </Stack>
          <Box sx={{ borderTop: `1px solid ${colors.borderStrong}`, pt: '7px' }}>
            <Box sx={{ display: { xs: 'grid', sm: 'none' }, gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>{[['출금', withdrawals, colors.marketFall], ['입금', deposits, colors.marketRise], ['배당', dividends, colors.textPrimary]].map(([label, amount, color]) => <Box key={label as string}><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>{label}</Typography><Typography sx={{ mt: '4px', textAlign: 'right', color: color as string, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label === '출금' ? '−' : label === '입금' ? '+' : ''}{amountText(amount as number)}</Typography></Box>)}</Box>
            <Stack sx={{ display: { xs: 'none', sm: 'flex' } }}>{[['입금', deposits, colors.marketRise], ['출금', withdrawals, colors.marketFall], ['배당', dividends, colors.textPrimary], ['순변동', net, tone(net)]].map(([label, amount, color]) => <Stack key={label as string} direction="row" sx={{ justifyContent: 'space-between', py: '9px', borderBottom: `1px solid ${colors.border}` }}><Typography sx={{ color: colors.textMuted, fontSize: 13 }}>{label}</Typography><Typography sx={{ color: color as string, fontSize: 16, fontWeight: 600, textAlign: 'right' }}>{amountText(amount as number)}</Typography></Stack>)}</Stack>
          </Box>
          <Typography sx={{ display: { xs: 'none', sm: 'block' }, mt: '12px', color: colors.textSecondary, fontSize: 12, lineHeight: '18px' }}>좌우로 스와이프해 기간을 이동하고 월간·연간 버튼으로 표시 단위를 전환하세요.</Typography>
        </AppCard>
      </Stack>

      <AppCard sx={{ minHeight: 434, p: `12px ${pageMetrics.cardInset}px`, borderRadius: '16px' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>최근 변경</Typography><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>최근 {visible.length}개</Typography></Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '48px 38px minmax(0, 1fr) minmax(0, 1fr)', sm: '70px 70px minmax(0, 1fr) minmax(0, 1fr)' }, gap: { xs: '4px', sm: '8px' }, mt: '12px', py: '9px', borderTop: `1px solid ${colors.borderStrong}`, color: colors.textMuted, fontSize: { xs: 10, sm: 12 } }}><span>날짜</span><span>구분</span><span style={{ textAlign: 'right' }}>금액</span><span style={{ textAlign: 'right' }}>잔액</span></Box>
        <Stack spacing={0}>{visible.map((entry, index) => <Box key={entry.id} component="button" onClick={() => openEditor(entry)} sx={{ display: 'grid', width: '100%', gridTemplateColumns: { xs: '48px 38px minmax(0, 1fr) minmax(0, 1fr)', sm: '70px 70px minmax(0, 1fr) minmax(0, 1fr)' }, gap: { xs: '4px', sm: '8px' }, minHeight: { xs: 32, sm: 39 }, alignItems: 'center', border: 0, borderBottom: `1px solid ${colors.border}`, p: 0, bgcolor: 'transparent', color: colors.textPrimary, cursor: 'pointer', textAlign: 'left' }}>
          <Typography sx={{ color: colors.textMuted, fontSize: { xs: 10, sm: 11 } }}>{entry.date.slice(5).replace('-', '.')}</Typography><Typography sx={{ fontSize: 11, color: entry.type === 'deposit' ? colors.marketRise : entry.type === 'buy' ? colors.marketFall : colors.textPrimary }}>{labels[entry.type]}</Typography><Typography noWrap sx={{ color: tone(entry.amount), fontSize: { xs: 10, sm: 11 }, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{signedText(entry.amount)}</Typography><Typography noWrap sx={{ color: colors.textSecondary, textAlign: 'right', fontSize: { xs: 10, sm: 11 }, fontVariantNumeric: 'tabular-nums' }}>{amountText(balance - sorted.slice(0, index).reduce((sum, item) => sum + item.amount, 0))}</Typography>
        </Box>)}</Stack>
        {oldestVisibleMonth > earliestMonth && <Button fullWidth onClick={() => setOldestVisibleMonth((previous) => moveMonth(previous, -1))} sx={{ mt: '16px', minHeight: 34, height: 34, border: `1px solid ${colors.borderStrong}`, borderRadius: 2, color: colors.focus, bgcolor: colors.raised, fontSize: 11 }}>이전 1개월 더보기</Button>}
      </AppCard>
    </Stack>

    {editing !== null && <Dialog open onClose={() => setEditing(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { bgcolor: colors.canvas, border: `1px solid ${colors.borderStrong}`, borderRadius: 2, m: 2, maxWidth: { xs: 368, sm: 320 } } } }}>
      <DialogTitle sx={{ textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{editing === 'balance' ? '예수금 수정' : editing === 'new' ? '예수금 등록' : '예수금 내역 수정'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, pt: '8px !important' }}>
        {editing !== 'balance' && <><Stack direction="row" spacing="6px">{(['buy', 'sell', 'deposit', 'withdrawal', 'dividend'] as CashEntryType[]).map((item) => <Button key={item} disabled={editing === 'new' && (item === 'buy' || item === 'sell')} onClick={() => { if (item === 'buy' || item === 'sell') { setEditing(null); navigateToForm(navigate, '/trade'); } else setType(item); }} sx={{ flex: 1, minWidth: 0, height: 32, p: 0, fontSize: 12, borderRadius: 2, bgcolor: item === type ? colors.buttonPrimary : colors.surface, color: item === type ? '#fff' : colors.textMuted, '&.Mui-disabled': { color: colors.disabled, bgcolor: colors.surface, opacity: 0.55 } }}>{labels[item]}</Button>)}</Stack><DateField label="거래일자" value={date} onChange={setDate} /></>}
        {type === 'dividend' && editing !== 'balance' && <><FormSelect label="종목" value={stockId} onChange={setStockId} options={stockItems.filter((item) => item.listType === 'holding').map((item) => ({ label: item.name, value: item.id }))} /><NumberField label="세전 배당" value={gross} onChange={setGross} suffix="원" autoFocus inputRef={firstAmountRef} enterKeyHint="next" /><NumberField label="세금" value={tax} onChange={setTax} suffix="원" enterKeyHint="next" /></>}
        <NumberField label={editing === 'balance' ? '현재 예수금' : type === 'dividend' ? '세후 배당' : '금액'} value={value} onChange={setValue} suffix="원" autoFocus={editing === 'balance' || type !== 'dividend'} inputRef={editing === 'balance' || type !== 'dividend' ? firstAmountRef : undefined} enterKeyHint={editing === 'balance' ? 'done' : 'next'} onEnter={editing === 'balance' ? save : undefined} />
        {editing !== 'balance' && <FormTextField label="메모" value={memo} onChange={setMemo} enterKeyHint="done" onEnter={save} />}
        {error && <Typography sx={{ color: colors.error, fontSize: 11 }}>{error}</Typography>}
        <Typography sx={{ color: colors.textMuted, fontSize: 11, mt: 1 }}>{editing === 'new' ? '등록할 때만 현재 예수금에 한 번 반영됩니다.' : editing === 'balance' ? '실제 증권 계좌의 예수금에 맞춰 직접 수정합니다.' : '수정·삭제해도 현재 예수금은 자동으로 변경되지 않습니다.'}</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>{editing !== 'new' && editing !== 'balance' && editing !== null && <Button onClick={() => setDeleting(editing)} sx={{ color: colors.marketRise, mr: 'auto' }}>삭제</Button>}<Button onClick={() => setEditing(null)} sx={{ color: colors.textMuted }}>취소</Button><Button onClick={save} disabled={editing === 'balance' && !value.trim()} variant="contained" sx={{ bgcolor: colors.buttonPrimary, minWidth: 96 }}>{editing === 'new' ? '등록' : '변경'}</Button></DialogActions>
    </Dialog>}

    {deleting !== null && <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { bgcolor: colors.surface, borderRadius: 2, p: 1 } } }}><DialogTitle sx={{ fontSize: 18, fontWeight: 700 }}>{`${labels[deleting.type]} 내역을 삭제할까요?`}</DialogTitle><DialogContent><Typography sx={{ fontSize: 13 }}>{deleting.stockId && stockItems.find((stock) => stock.id === deleting.stockId)?.name}</Typography><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>{deleting.date}　{signedText(deleting.amount)}</Typography><Typography sx={{ mt: 2, color: colors.textSecondary, fontSize: 11 }}>삭제해도 현재 예수금은 자동으로 변경되지 않습니다.</Typography></DialogContent><DialogActions sx={{ p: 2 }}><Button autoFocus onClick={() => setDeleting(null)} sx={{ flex: 1, color: colors.textSecondary }}>취소</Button><Button onClick={confirmDelete} sx={{ flex: 1, bgcolor: colors.marketRise, color: '#fff' }}>삭제</Button></DialogActions></Dialog>}
  </Box>;
}
