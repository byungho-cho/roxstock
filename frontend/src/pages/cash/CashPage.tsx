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
const currentMonth = initialDate.slice(0, 7);
const currentYear = Number(initialDate.slice(0, 4));

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
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [oldestVisibleMonth, setOldestVisibleMonth] = useState(currentMonth);
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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const firstAmountRef = useRef<HTMLInputElement>(null);
  const taxRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveCash(balance, entries); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); }, [balance, entries, queryClient]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const balancesById = useMemo(() => {
    const result = new Map<string, number>();
    let remaining = balance;
    for (const entry of sorted) {
      result.set(entry.id, remaining);
      remaining -= entry.amount;
    }
    return result;
  }, [balance, sorted]);
  const visible = oldestVisibleMonth === currentMonth ? sorted.slice(0, 10) : sorted.filter((entry) => entry.date.slice(0, 7) >= oldestVisibleMonth);
  const periodEntries = entries.filter((entry) => mode === 'month' ? entry.date.startsWith(month) : entry.date.startsWith(String(year)));
  const total = (target: CashEntryType) => periodEntries.filter((entry) => entry.type === target).reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
  const deposits = total('deposit'); const withdrawals = total('withdrawal'); const dividends = total('dividend');
  const net = deposits - withdrawals + dividends;
  const monthChange = entries
    .filter((entry) => entry.date.startsWith(initialDate.slice(0, 7)) && ['deposit', 'withdrawal', 'dividend'].includes(entry.type))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const displayPeriod = mode === 'month' ? `${month.slice(0, 4)}.${month.slice(5)}` : `${year}년`;
  const earliestMonth = sorted.at(-1)?.date.slice(0, 7) ?? currentMonth;
  const earliestYear = Number(earliestMonth.slice(0, 4));
  const latestMonth = sorted[0]?.date.slice(0, 7) ?? currentMonth;
  const lastMonth = latestMonth > currentMonth ? latestMonth : currentMonth;
  const lastYear = Number(lastMonth.slice(0, 4));

  const changePeriod = (delta: number) => {
    if (mode === 'month') setMonth((previous) => { const next = moveMonth(previous, delta); return next > lastMonth || next < earliestMonth ? previous : next; });
    else setYear((previous) => Math.max(earliestYear, Math.min(lastYear, previous + delta)));
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
  const handleSwipe = (endX: number, endY: number) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const horizontal = endX - start.x;
    if (Math.abs(horizontal) > 55 && Math.abs(horizontal) > Math.abs(endY - start.y)) changePeriod(horizontal < 0 ? -1 : 1);
  };

  return <Box>
    <PageHeader title="예수금" subtitle="실제 증권계좌에서 사용할 수 있는 현금 잔액입니다" backPath="/" addLabel="예수금 등록" onAdd={() => openEditor('new')} embedded />

    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: `${pageMetrics.gap}px`, sm: '16px' }} onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={(event) => { const touch = event.changedTouches[0]; if (touch) handleSwipe(touch.clientX, touch.clientY); }} onTouchCancel={() => { touchStart.current = null; }} sx={{ alignItems: 'flex-start', touchAction: 'pan-y' }}>
      <Stack spacing={`${pageMetrics.gap}px`} sx={{ width: { xs: '100%', sm: 'calc((100% - 16px) / 2)' }, minWidth: 0 }}>
        <AppCard sx={{ minHeight: { xs: 112, sm: 126 }, p: { xs: `11px ${pageMetrics.cardInset}px`, sm: '16px 17px' }, borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: { xs: 'space-between', sm: 'flex-start' } }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>현재 예수금</Typography><Button onClick={() => openEditor('balance')} sx={{ display: { sm: 'none' }, minWidth: 54, minHeight: 23, height: 23, p: 0, borderRadius: 3, bgcolor: colors.raised, color: colors.focus, fontSize: 10 }}>수정</Button></Stack>
          <Typography onClick={() => openEditor('balance')} title="예수금 수정" sx={{ color: colors.warning, fontSize: { xs: 28, sm: 30 }, fontWeight: 700, textAlign: { xs: 'right', sm: 'left' }, lineHeight: { xs: '36px', sm: '42px' }, mt: { sm: '8px' }, whiteSpace: 'nowrap', cursor: 'pointer' }}>{amountText(balance)}</Typography>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'end', gap: 1 }}><Typography sx={{ display: { xs: 'none', sm: 'block' }, color: tone(monthChange), fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>이번 달 {amountText(Math.abs(monthChange))} {monthChange >= 0 ? '증가' : '감소'}</Typography><Typography sx={{ flex: 1, textAlign: 'right', color: colors.textMuted, fontSize: 10, lineHeight: '14px', whiteSpace: 'nowrap' }}>09.20 05:30</Typography></Stack>
        </AppCard>

        <AppCard sx={{ minHeight: { xs: 116, sm: 314 }, p: { xs: `12px ${pageMetrics.cardInset}px`, sm: '12px 17px 16px' }, borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: { xs: '7px', sm: 0 } }}>
            <Stack direction="row" sx={{ alignItems: 'center', flex: 1 }}>
              <IconButton aria-label="이전 기간" size="small" onClick={() => changePeriod(-1)} sx={{ display: { sm: 'none' } }}><ChevronLeftRounded sx={{ fontSize: 18 }} /></IconButton>
              <Typography sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' }, fontSize: 16, fontWeight: 700 }}>{mode === 'month' ? <><Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{displayPeriod}</Box><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{month.slice(0, 4)}년 {Number(month.slice(5))}월</Box></> : displayPeriod}</Typography>
              <IconButton aria-label="다음 기간" size="small" onClick={() => changePeriod(1)} sx={{ display: { sm: 'none' } }}><ChevronRightRounded sx={{ fontSize: 18 }} /></IconButton>
            </Stack>
            <Button aria-label="월간 연간 전환" onClick={() => { setMode((previous) => previous === 'month' ? 'year' : 'month'); setYear(Number(month.slice(0, 4))); }} sx={{ ml: 1.5, minWidth: { xs: 54, sm: 76 }, minHeight: 28, height: 28, p: 0, borderRadius: 4, bgcolor: colors.raised, color: colors.focus, fontSize: 11 }}>{mode === 'month' ? '월간' : '연간'}</Button>
          </Stack>
          <Stack direction="row" sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'space-between', alignItems: 'center', height: 28, mb: '4px' }}>
            <Button aria-label="이전 기간" onClick={() => changePeriod(-1)} sx={{ minWidth: 0, p: 0, fontSize: 10, color: colors.textMuted }}>{mode === 'month' ? `‹  ${Number(moveMonth(month, -1).slice(5))}월` : `‹  ${year - 1}년`}</Button>
            <Button aria-label="다음 기간" onClick={() => changePeriod(1)} sx={{ minWidth: 0, p: 0, fontSize: 10, color: colors.textMuted }}>{mode === 'month' ? `${Number(moveMonth(month, 1).slice(5))}월  ›` : `${year + 1}년  ›`}</Button>
          </Stack>
          <Box sx={{ borderTop: `1px solid ${colors.borderStrong}`, pt: '3px' }}>
            <Box sx={{ display: { xs: 'grid', sm: 'none' }, gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>{[['출금', withdrawals, colors.marketFall], ['입금', deposits, colors.marketRise], ['배당', dividends, colors.textPrimary]].map(([label, amount, color]) => <Box key={label as string}><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>{label}</Typography><Typography sx={{ mt: '4px', textAlign: 'right', color: color as string, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label === '출금' ? '−' : label === '입금' ? '+' : ''}{amountText(amount as number)}</Typography></Box>)}</Box>
            <Stack sx={{ display: { xs: 'none', sm: 'flex' } }}>{[['입금', deposits, colors.marketRise], ['출금', withdrawals, colors.marketFall], ['배당', dividends, colors.textPrimary], ['순변동', net, tone(net)]].map(([label, amount, color]) => <Stack key={label as string} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', height: label === '순변동' ? 43 : 40, borderBottom: label === '순변동' ? 'none' : `1px solid ${colors.border}` }}><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>{label}</Typography><Typography sx={{ color: color as string, fontSize: 16, fontWeight: label === '순변동' ? 700 : 600, textAlign: 'right' }}>{amountText(amount as number)}</Typography></Stack>)}</Stack>
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' }, mt: 'auto', color: colors.textMuted, opacity: 0.8, fontSize: 10, lineHeight: '15px' }}>좌우로 스와이프하면 이전·다음 기간을 확인할 수 있습니다<br />월간 ↔ 연간 아이콘을 선택해 표시 단위를 전환합니다</Box>
        </AppCard>
      </Stack>

      <AppCard sx={{ width: { xs: '100%', sm: 'calc((100% - 16px) / 2)' }, minWidth: 0, minHeight: { xs: 434, sm: 452 }, height: { sm: 452 }, p: { xs: `12px ${pageMetrics.cardInset}px`, sm: '15px 17px 16px' }, borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 15, fontWeight: 600 }}>최근 변경</Typography><Typography sx={{ color: colors.textMuted, fontSize: 11 }}>최근 10개</Typography></Stack>
        <Box sx={{ display: { xs: 'grid', sm: 'none' }, gridTemplateColumns: '100px 72px minmax(0, 1fr)', columnGap: '8px', mt: '14px', height: 38, flexShrink: 0, alignItems: 'center', borderTop: `1px solid ${colors.borderStrong}`, color: colors.textMuted, fontSize: 10 }}><span>구분</span><span>날짜</span><span style={{ textAlign: 'right' }}>금액</span></Box>
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: '74px 50px 104px minmax(0, 1fr)', mt: '14px', height: 38, flexShrink: 0, alignItems: 'center', borderTop: `1px solid ${colors.borderStrong}`, color: colors.textMuted, fontSize: 10 }}><span>날짜</span><span style={{ textAlign: 'center' }}>구분</span><span style={{ textAlign: 'right' }}>금액</span><span style={{ textAlign: 'right' }}>잔액</span></Box>
        <Stack spacing={0} sx={{ minHeight: 0, flex: { sm: '1 1 auto' }, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'thin', scrollbarColor: `${colors.textMuted} transparent`, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: colors.textMuted, borderRadius: 4 } }}>{visible.map((entry) => <Box key={entry.id} component="button" onClick={() => openEditor(entry)} sx={{ display: 'grid', width: '100%', gridTemplateColumns: { xs: '100px 72px minmax(0, 1fr)', sm: '74px 50px 104px minmax(0, 1fr)' }, columnGap: { xs: '8px', sm: 0 }, minHeight: { xs: 32, sm: 39 }, flexShrink: 0, alignItems: 'center', border: 0, borderBottom: `1px solid ${colors.border}`, p: 0, bgcolor: 'transparent', color: colors.textPrimary, cursor: 'pointer', textAlign: 'left' }}>
          <Typography sx={{ order: { xs: 2, sm: 1 }, color: colors.textMuted, fontSize: { xs: 10, sm: 10.5 } }}>{entry.date.slice(5).replace('-', '.')}</Typography><Typography sx={{ order: { xs: 1, sm: 2 }, textAlign: { sm: 'center' }, fontSize: 10.5, fontWeight: 600, color: tone(entry.amount) }}>{labels[entry.type]}</Typography><Typography noWrap sx={{ order: 3, color: tone(entry.amount), fontSize: { xs: 10, sm: 10.5 }, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><Box component="span" sx={{ display: { sm: 'none' } }}>{signedText(entry.amount)}</Box><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{entry.amount < 0 ? '-' : ''}{Math.abs(entry.amount).toLocaleString('ko-KR')}</Box></Typography><Typography noWrap sx={{ display: { xs: 'none', sm: 'block' }, order: 4, color: colors.textPrimary, textAlign: 'right', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>{(balancesById.get(entry.id) ?? balance).toLocaleString('ko-KR')}</Typography>
        </Box>)}</Stack>
        {oldestVisibleMonth > earliestMonth && <Button fullWidth onClick={() => setOldestVisibleMonth((previous) => moveMonth(previous, -1))} sx={{ mt: { xs: '16px', sm: '8px' }, minHeight: { xs: 34, sm: 30 }, height: { xs: 34, sm: 30 }, flexShrink: 0, border: `1px solid ${colors.borderStrong}`, borderRadius: 2, color: colors.focus, bgcolor: colors.raised, fontSize: 11 }}>이전 1개월 더보기</Button>}
      </AppCard>
    </Stack>

    {editing !== null && <Dialog open onClose={() => setEditing(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { bgcolor: colors.canvas, border: `1px solid ${colors.borderStrong}`, borderRadius: 2, m: 2, maxWidth: { xs: 368, sm: 320 } } } }}>
      <DialogTitle sx={{ textAlign: 'center', fontWeight: 700, fontSize: 20 }}>{editing === 'balance' ? '예수금 수정' : editing === 'new' ? '예수금 등록' : '예수금 내역 수정'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1, pt: '8px !important' }}>
        {editing !== 'balance' && <><Stack direction="row" spacing="6px">{(['buy', 'sell', 'deposit', 'withdrawal', 'dividend'] as CashEntryType[]).map((item) => <Button key={item} disabled={editing === 'new' && (item === 'buy' || item === 'sell')} onClick={() => { if (item === 'buy' || item === 'sell') { setEditing(null); navigateToForm(navigate, '/trade'); } else setType(item); }} sx={{ flex: 1, minWidth: 0, height: 32, p: 0, fontSize: 12, borderRadius: 2, bgcolor: item === type ? colors.buttonPrimary : colors.surface, color: item === type ? '#fff' : colors.textMuted, '&.Mui-disabled': { color: colors.disabled, bgcolor: colors.surface, opacity: 0.55 } }}>{labels[item]}</Button>)}</Stack><DateField label="거래일자" value={date} onChange={setDate} enterKeyHint="next" onEnter={() => firstAmountRef.current?.focus()} /></>}
        {type === 'dividend' && editing !== 'balance' && <><FormSelect label="종목" value={stockId} onChange={setStockId} options={stockItems.filter((item) => item.listType === 'holding').map((item) => ({ label: item.name, value: item.id }))} /><NumberField label="세전 배당" value={gross} onChange={setGross} suffix="원" autoFocus inputRef={firstAmountRef} enterKeyHint="next" onEnter={() => taxRef.current?.focus()} /><NumberField label="세금" value={tax} onChange={setTax} suffix="원" enterKeyHint="next" inputRef={taxRef} onEnter={() => amountRef.current?.focus()} /></>}
        <NumberField label={editing === 'balance' ? '현재 예수금' : type === 'dividend' ? '세후 배당' : '금액'} value={value} onChange={setValue} suffix="원" autoFocus={editing === 'balance' || type !== 'dividend'} inputRef={editing === 'balance' || type !== 'dividend' ? firstAmountRef : amountRef} selectOnFocus={editing === 'balance'} enterKeyHint={editing === 'balance' ? 'done' : 'next'} onEnter={editing === 'balance' ? save : () => memoRef.current?.focus()} />
        {editing !== 'balance' && <FormTextField label="메모" value={memo} onChange={setMemo} enterKeyHint="done" inputRef={memoRef} onEnter={save} />}
        {error && <Typography sx={{ color: colors.error, fontSize: 11 }}>{error}</Typography>}
        <Typography sx={{ color: colors.textMuted, fontSize: 11, mt: 1 }}>{editing === 'new' ? '등록할 때만 현재 예수금에 한 번 반영됩니다.' : editing === 'balance' ? '실제 증권 계좌의 예수금에 맞춰 직접 수정합니다.' : '수정·삭제해도 현재 예수금은 자동으로 변경되지 않습니다.'}</Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>{editing !== 'new' && editing !== 'balance' && editing !== null && <Button onClick={() => setDeleting(editing)} sx={{ color: colors.marketRise, mr: 'auto' }}>삭제</Button>}<Button onClick={() => setEditing(null)} sx={{ color: colors.textMuted }}>취소</Button><Button onClick={save} disabled={editing === 'balance' && !value.trim()} variant="contained" sx={{ bgcolor: colors.buttonPrimary, minWidth: 96 }}>{editing === 'new' ? '등록' : '변경'}</Button></DialogActions>
    </Dialog>}

    {deleting !== null && <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { bgcolor: colors.surface, borderRadius: 2, p: 1 } } }}><DialogTitle sx={{ fontSize: 18, fontWeight: 700 }}>{`${labels[deleting.type]} 내역을 삭제할까요?`}</DialogTitle><DialogContent><Typography sx={{ fontSize: 13 }}>{deleting.stockId && stockItems.find((stock) => stock.id === deleting.stockId)?.name}</Typography><Typography sx={{ color: colors.textMuted, fontSize: 12 }}>{deleting.date}　{signedText(deleting.amount)}</Typography><Typography sx={{ mt: 2, color: colors.textSecondary, fontSize: 11 }}>삭제해도 현재 예수금은 자동으로 변경되지 않습니다.</Typography></DialogContent><DialogActions sx={{ p: 2 }}><Button autoFocus onClick={() => setDeleting(null)} sx={{ flex: 1, color: colors.textSecondary }}>취소</Button><Button onClick={confirmDelete} sx={{ flex: 1, bgcolor: colors.marketRise, color: '#fff' }}>삭제</Button></DialogActions></Dialog>}
  </Box>;
}
