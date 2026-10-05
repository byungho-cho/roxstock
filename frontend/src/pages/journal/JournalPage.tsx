import { usePageMemory, useListNavigation } from '../../hooks/navigation/usePageMemory';
import { ArrowBackRounded, ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material';
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Skeleton, Stack, Typography, useMediaQuery } from '@mui/material';
import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { getBuyTrades } from '../../data/mockBuyTrades';
import { buyLots, stockItems } from '../../data/mockData';
import { getAvailableLots, getSellTrades } from '../../data/mockSellTrades';
import { liveApiEnabled } from '../../data/liveData';
import { getTrades, getBuyLots } from '../../data/roxstockApi';
import { PageHeader } from '../../components/navigation/Navigation';
import { colors } from '../../styles/tokens';
import { getKoreanHolidays } from './koreanHolidays';
import { useActiveAccount } from '../../hooks/useActiveAccount';

import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { journalTotals, finiteNumber, sellEvaluation, type JournalEntry as Entry } from './journalMath';
import { JournalTransactions, journalWon as won, journalSignedWon as signedWon, journalProfitColor as getProfitColor, journalRate } from './JournalTransactions';
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const getTodayDate = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const dateOf = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const monthOf = (date: string) => date.slice(0, 7);
function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value - 1 + offset, 1);
  return dateOf(next.getFullYear(), next.getMonth() + 1, 1).slice(0, 7);
}
const panel = { bgcolor: colors.surface, border: 0, borderRadius: '8px' } as const;
const calendarPanel = { ...panel, bgcolor: '#0E1420', border: '1px solid #1F2B42' } as const;
const journalQuery = (accountId: string, month: string) => ({
  queryKey: ['journalTrades', accountId, month] as const,
  staleTime: 60_000,
  queryFn: () => {
    const [year, value] = month.split('-').map(Number);
    const first = new Date(year, value - 1, 1);
    const last = new Date(year, value, 0);
    first.setDate(first.getDate() - first.getDay());
    last.setTime(first.getTime());
    last.setDate(first.getDate() + 41);
    return getTrades(accountId, {
      from: dateOf(first.getFullYear(), first.getMonth() + 1, first.getDate()),
      to: dateOf(last.getFullYear(), last.getMonth() + 1, last.getDate()),
    });
  },
});

export function JournalPage() {
  const { accountId } = useActiveAccount();
  const queryClient = useQueryClient();
  const navigate = useListNavigation();
  const tablet = useMediaQuery('(min-width:600px)');
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('date');
  const initialDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : getTodayDate();
  const [selectedDate, setSelectedDate] = usePageMemory('journalDate',initialDate);
  const [month, setMonth] = usePageMemory('journalMonth',monthOf(initialDate));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(initialDate.slice(0, 4)));
  const [detailMode, setDetailMode] = usePageMemory<'trades' | 'profit' | 'trade'>('journalMode','trades');
  const [selectedTradeId, setSelectedTradeId] = usePageMemory<string | null>('journalTrade',null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const { data: remoteReport, isPending: tradesPending, isError: tradesError, refetch: reloadTrades } = useQuery({
    ...journalQuery(accountId ?? '', month), enabled: liveApiEnabled && !!accountId,
  });
  const leftRef = useRef<HTMLDivElement>(null), rightRef = useRef<HTMLDivElement>(null);
  const lotsQuery = useQuery({ queryKey: ['buyLots', accountId, 'journal-all'], queryFn: () => getBuyLots(accountId!, undefined, false), enabled: liveApiEnabled && !!accountId, staleTime: 60_000 });
  const remoteLots = lotsQuery.data;
  useEffect(() => {
    if (!liveApiEnabled || !accountId || !remoteReport || tradesError) return;
    for (const offset of [-1, 1]) void queryClient.prefetchQuery(journalQuery(accountId, shiftMonth(month, offset)));
  }, [accountId, month, queryClient, remoteReport, tradesError]);

  const allEntries = useMemo(() => {
    if (liveApiEnabled) return (remoteReport?.data ?? []).map((trade): Entry => ({
      id: trade.id, type: trade.type === 'BUY' ? 'buy' : 'sell',
      date: new Date(trade.tradedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
      stockId: trade.security.id, stockName: trade.security.name, quantity: Number(trade.quantity),
      price: Number(trade.unitPrice), profit: finiteNumber(trade.realizedProfitLoss),
      lotId: trade.type === 'SELL' ? trade.buyTradeId : undefined,
      buyPrice: trade.type === 'SELL' ? finiteNumber(remoteLots?.find(lot => lot.id === trade.buyTradeId)?.unitPrice) : undefined,
    }));
    const lots = getAvailableLots();
    const buys: Entry[] = getBuyTrades().map((trade) => ({ id: trade.id, type: 'buy', date: trade.tradeDate, stockId: trade.stockId, stockName: stockItems.find((stock) => stock.id === trade.stockId)?.name ?? trade.stockId, quantity: trade.quantity, price: trade.price }));
    const samples: Entry[] = buyLots.map((lot) => ({ id: lot.id, type: 'buy', date: lot.tradeDate, stockId: lot.stockId, stockName: stockItems.find((stock) => stock.id === lot.stockId)?.name ?? lot.stockName, quantity: lot.quantity, price: lot.buyPrice, sample: true }));
    const sells: Entry[] = getSellTrades().map((trade) => {
      const lot = lots.find((candidate) => candidate.id === trade.lotId);
      return { id: trade.id, type: 'sell', date: trade.tradeDate, stockId: trade.stockId, stockName: stockItems.find((stock) => stock.id === trade.stockId)?.name ?? trade.stockId, quantity: trade.quantity, price: trade.price, lotId: trade.lotId, buyPrice: lot?.buyPrice, profit: lot ? trade.quantity * (trade.price - lot.buyPrice) : undefined };
    });
    return [...buys, ...samples, ...sells].sort((a, b) => b.date.localeCompare(a.date));
  }, [remoteReport, remoteLots]);
  const buyFilter = searchParams.get('filter') === 'buy';
  const entries = buyFilter ? allEntries.filter(entry => entry.type === 'buy') : allEntries;
  const goToMonth = (next: string) => {
    const day = Math.min(Number(selectedDate.slice(8, 10)), new Date(Number(next.slice(0, 4)), Number(next.slice(5, 7)), 0).getDate());
    setMonth(next);
    setSelectedDate(`${next}-${String(day).padStart(2, '0')}`);
    setDetailMode('trades');
    setSelectedTradeId(null);
  };
  const changeMonth = (offset: number) => goToMonth(shiftMonth(month, offset));
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) <= 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    suppressClickUntil.current = Date.now() + 350;
    changeMonth(deltaX < 0 ? 1 : -1);
  };
  const [year, value] = month.split('-').map(Number);
  const holidays = useMemo(() => new Map([...getKoreanHolidays(year - 1), ...getKoreanHolidays(year), ...getKoreanHolidays(year + 1)]), [year]);
  const firstWeekday = new Date(year, value - 1, 1).getDay();
    const calendar = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, value - 1, index - firstWeekday + 1);
    return { date: dateOf(date.getFullYear(), date.getMonth() + 1, date.getDate()), day: date.getDate(), adjacent: date.getMonth() !== value - 1 };
  });
  const counts = new Map<string, { buy: number; sell: number }>();
  for (const entry of entries) {
    const count = counts.get(entry.date) ?? { buy: 0, sell: 0 };
    count[entry.type] += 1;
    counts.set(entry.date, count);
  }
  const dayEntries = entries.filter((entry) => entry.date === selectedDate);
  const monthEntries = entries.filter((entry) => monthOf(entry.date) === month);
  const monthTotals = journalTotals(monthEntries), dayTotals = journalTotals(dayEntries);
  const unavailable = liveApiEnabled && !remoteReport;
  const monthProfit = unavailable ? undefined : monthTotals.profit;
  const monthBuy = monthTotals.buy;
  const dayProfit = unavailable ? undefined : dayTotals.profit;
  const dayBuy = dayTotals.buy, daySell = dayTotals.sell;
  const selectedTrade = dayEntries.find((entry) => entry.id === selectedTradeId);
  const dayWeekday = new Date(`${selectedDate}T12:00:00`).getDay();
  const selectDate = (date: string) => { setSelectedDate(date); setMonth(monthOf(date)); setDetailMode('trades'); setSelectedTradeId(null); };
  const openEntry = (entry: Entry) => {
    if (tablet) { setSelectedTradeId(entry.id); setDetailMode('trade'); return; }
    if (entry.sample) { navigate(`/stocks/${entry.stockId}?tab=trades`); return; }
    const params = new URLSearchParams({ type: entry.type, stock: entry.stockId, edit: entry.id, return: 'journal', fromDate: selectedDate });
    if (entry.lotId) params.set('lot', entry.lotId);
    navigate(`/trade?${params}`);
  };
  const editEntry = (entry: Entry) => {
    const params = new URLSearchParams({ type: entry.type, stock: entry.stockId, edit: entry.id, return: 'journal', fromDate: selectedDate });
    if (entry.lotId) params.set('lot', entry.lotId);
    navigate(entry.sample ? `/stocks/${entry.stockId}?tab=trades` : `/trade?${params}`);
  };
  const moveDay = (offset: number) => {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + offset);
    const date = dateOf(next.getFullYear(), next.getMonth() + 1, next.getDate());
    setSelectedDate(date); setMonth(monthOf(date)); setSelectedTradeId(null);
  };
  const dayTouch = useRef<{x: number; y: number} | null>(null);
  const dayClickUntil = useRef(0);
  const dayGesture = {
    onTouchStart: (event: TouchEvent) => {
      const target = event.target as HTMLElement;
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      dayTouch.current = touch && !target.closest('button, input, a, [role="button"]') ? {x: touch.clientX, y: touch.clientY} : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const start = dayTouch.current, touch = event.changedTouches[0]; dayTouch.current = null;
      if (!start || !touch) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      dayClickUntil.current = Date.now() + 350;
      moveDay(dx < 0 ? 1 : -1);
    },
    onTouchCancel: () => { dayTouch.current = null; },
    onClickCapture: (event: React.MouseEvent) => { if (Date.now() < dayClickUntil.current && !(event.target as HTMLElement).closest('button, input, a, [role="button"]')) { event.preventDefault(); event.stopPropagation(); dayClickUntil.current = 0; } },
  };
  const dayHeading = <Box data-testid="journal-day-heading" sx={{display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 28px', alignItems: 'center', mb: '8px'}}>
    <IconButton aria-label="거래내역 이전 날짜" onClick={() => moveDay(-1)} sx={{width:28,height:28}}><ChevronLeftRounded sx={{fontSize:18}}/></IconButton>
    <Typography sx={{textAlign:'center',fontSize:14,fontWeight:600}}>{selectedDate.replaceAll('-', '.')} · {weekdays[dayWeekday]}요일</Typography>
    <IconButton aria-label="거래내역 다음 날짜" onClick={() => moveDay(1)} sx={{width:28,height:28}}><ChevronRightRounded sx={{fontSize:18}}/></IconButton>
  </Box>;
  const monthControls = <Box sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 28px', width: tablet ? 250 : '100%', height: tablet ? 44 : 46, alignItems: 'center' }}>
    <IconButton aria-label="이전 달" onClick={() => changeMonth(-1)} sx={{ width: 28, height: 36, color: colors.textMuted }}><ChevronLeftRounded sx={{ fontSize: 18 }}/></IconButton>
    <Box sx={{ textAlign: 'center', minWidth: 0 }}>
      <ButtonBase aria-label={`${year}년 ${value}월, 월 선택`} onClick={() => { setPickerYear(year); setMonthPickerOpen(true); }} sx={{ display: 'block', mx: 'auto' }}><Typography sx={{ fontSize: 14, lineHeight: '22px', fontWeight: 600 }}>{year}년 {value}월</Typography></ButtonBase>
      <Box sx={{ fontSize: 10, lineHeight: '14px', color: getProfitColor(monthProfit), overflowWrap: 'anywhere' }}>월손익 {liveApiEnabled ? '—' : monthBuy && monthProfit !== undefined ? journalRate(monthProfit / monthBuy * 100) : '0.0%'} {signedWon(monthProfit)}</Box>
    </Box>
    <IconButton aria-label="다음 달" onClick={() => changeMonth(1)} sx={{ width: 28, height: 36, color: colors.textMuted }}><ChevronRightRounded sx={{ fontSize: 18 }}/></IconButton>
  </Box>;
  const status = liveApiEnabled && tradesPending ? <Stack role="status" aria-label="선택한 날짜의 거래를 불러오는 중" spacing={1}><Skeleton variant="rounded" height={28}/><Skeleton variant="rounded" height={28}/></Stack>
    : liveApiEnabled && tradesError && !remoteReport ? <Button role="alert" onClick={() => void reloadTrades()}>거래 조회 실패 · 다시 시도</Button> : null;
  const transactions = <>{status ?? <JournalTransactions entries={dayEntries} onOpen={openEntry}/>}</>;
  const titleRow = <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: '4px' }}>
    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>거래현황</Typography><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{unavailable ? '—' : `총 ${dayEntries.length}건`}</Typography>
  </Stack>;
  const summary = <Box data-testid="journal-day-summary" sx={{ bgcolor: colors.raised, borderRadius: '8px', p: '8px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px', textAlign: 'right' }}>
    {[['매수', unavailable ? undefined : dayBuy], ['매도', unavailable ? undefined : daySell], [journalRate(dayTotals.cost && dayProfit !== undefined ? dayProfit / dayTotals.cost * 100 : undefined), dayProfit]].map(([label, amount], index) =>
      <Box key={index}><Typography sx={{ fontSize: 10, lineHeight: '14px', color: index === 2 ? getProfitColor(dayProfit) : colors.textMuted }}>{label}</Typography><Typography sx={{ fontSize: 12, lineHeight: '18px', fontWeight: 600, overflowWrap: 'anywhere', color: index === 2 ? getProfitColor(dayProfit) : colors.textSecondary }}>{index === 2 ? signedWon(amount as number | undefined) : won(amount as number | undefined)}</Typography></Box>)}
  </Box>;
  const profitCards = <Stack spacing="8px">
    <Box sx={{ ...panel, p: '8px 16px' }}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12 }}>전체 손익</Typography><Typography sx={{ fontSize: 12, color: getProfitColor(dayProfit) }}>{unavailable ? '—' : `매도 ${dayTotals.sellCount}건`}</Typography></Stack><Typography data-testid="journal-total-profit" sx={{ textAlign: 'right', fontSize: 30, lineHeight: '41px', fontWeight: 700, color: getProfitColor(dayProfit) }}>{signedWon(dayProfit)}</Typography></Box>
    <Box sx={{ ...panel, p: '6px 16px' }}><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: '4px' }}><Typography sx={{ fontSize: 14, fontWeight: 700 }}>실현손익</Typography><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{unavailable ? '—' : `매수 ${dayTotals.buyCount}건 · 매도 ${dayTotals.sellCount}건`}</Typography></Stack>
      {[['매수', unavailable ? undefined : dayBuy], ['매도', unavailable ? undefined : daySell], ['손익', dayProfit]].map(([label, amount], index) => <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr)', gap: '4px', alignItems: 'start', py: '3px', borderTop: index ? `1px solid ${colors.border}` : 0, fontSize: 12, color: index === 2 ? getProfitColor(dayProfit) : index === 0 ? colors.marketFall : colors.marketRise }}><span>{label}</span><Box sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{index === 2 ? <>{journalRate(dayTotals.cost && dayProfit !== undefined ? dayProfit / dayTotals.cost * 100 : undefined)}　{signedWon(amount as number | undefined)}</> : won(amount as number | undefined)}</Box></Box>)}
    </Box>
    <Box sx={{ ...panel, p: '8px 16px' }}>{titleRow}{transactions}</Box>
  </Stack>;
  const dateSelector = <Box data-testid="journal-date-selector" sx={{ bgcolor: colors.canvas, pb: '8px', position: 'sticky', top: 0, zIndex: 2, flexShrink: 0 }}><Box data-testid="journal-date-card" sx={{ ...panel, height: 44, display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 36px', alignItems: 'center', px: '8px' }}>
    <IconButton aria-label="이전 날짜" onClick={() => moveDay(-1)} sx={{ width: 36, height: 36 }}><ChevronLeftRounded sx={{ fontSize: 20 }}/></IconButton>
    <Typography sx={{ textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{selectedDate.slice(0, 4)}년 {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8))}일 ({weekdays[dayWeekday]})</Typography>
    <IconButton aria-label="다음 날짜" onClick={() => moveDay(1)} sx={{ width: 36, height: 36 }}><ChevronRightRounded sx={{ fontSize: 20 }}/></IconButton>
  </Box></Box>;
  const detail = selectedTrade && <Stack spacing="8px">
    <Box sx={{ ...panel, p: '12px 16px' }}><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{selectedTrade.type === 'buy' ? '매수' : '매도'} · {selectedTrade.date}</Typography><Typography sx={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{selectedTrade.stockName}</Typography><Typography sx={{ textAlign: 'right', fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere', color: getProfitColor(selectedTrade.type === 'sell' ? sellEvaluation(selectedTrade).profit : undefined) }}>{selectedTrade.type === 'sell' ? signedWon(sellEvaluation(selectedTrade).profit) : won(selectedTrade.quantity * selectedTrade.price)}</Typography></Box>
    <Box sx={{ ...panel, p: '8px 16px' }}><Typography sx={{ fontSize: 14, fontWeight: 700, mb: '6px' }}>거래 정보</Typography>
      {selectedTrade.type === 'sell' && <Box sx={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) minmax(0, .8fr)', gap: '4px', fontSize: 10, color: colors.textMuted, mb: '6px', '& > *': { overflowWrap: 'anywhere' } }}><span>매수내역</span><Box sx={{ textAlign: 'right' }}>{selectedTrade.quantity.toLocaleString('ko-KR')} × {won(selectedTrade.buyPrice)}</Box><Box sx={{ textAlign: 'right' }}>{won(sellEvaluation(selectedTrade).cost)}</Box></Box>}
      <Box sx={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) minmax(0, .8fr)', gap: '4px', fontSize: 10, color: colors.textMuted, '& > *': { overflowWrap: 'anywhere' } }}><span>{selectedTrade.type === 'buy' ? '매수내역' : '매도내역'}</span><Box sx={{ textAlign: 'right' }}>{selectedTrade.quantity.toLocaleString('ko-KR')} × {won(selectedTrade.price)}</Box><Box sx={{ textAlign: 'right' }}>{won(selectedTrade.quantity * selectedTrade.price)}</Box></Box>
    </Box>
    <Button onClick={() => editEntry(selectedTrade)} sx={{ alignSelf: 'flex-end', fontSize: 12 }}>거래 수정·삭제 ›</Button>
  </Stack>;
  return <>
    <PageHeader embedded title={!tablet && detailMode === 'profit' ? '일별손익' : '매매일지'} variant="home" onBack={!tablet && detailMode === 'profit' ? () => setDetailMode('trades') : undefined} showAdd={false} maxWidth={1100} center={monthControls} action={<Button onClick={() => selectDate(getTodayDate())} aria-label="오늘 날짜로 이동" sx={{ minWidth: 40, minHeight: 32, height: 32, p: 0, border: `1px solid ${colors.borderStrong}`, borderRadius: '8px', color: colors.textPrimary, fontSize: 10 }}>오늘</Button>}/>
    <Box data-testid="journal-layout" data-list-condition={JSON.stringify([month, selectedDate, detailMode])} data-restoration-ready={!liveApiEnabled || !tradesPending || tradesError}
      sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px', height: { sm: '100%' }, minHeight: 0 }}>
      {(tablet || detailMode !== 'profit') && <Box ref={leftRef} data-scroll-region={tablet ? 'journal-calendar' : undefined} data-list-condition={JSON.stringify([month, selectedDate])}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null; }} onClickCapture={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); suppressClickUntil.current = 0; } }}
        sx={{ minWidth: 0, minHeight: 0, height: { sm: '100%' }, overflowY: { sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, touchAction: 'pan-y' }}>
        {!tablet && <Box sx={{ ...calendarPanel, px: '8px', height: 46, mb: '8px' }}>{monthControls}</Box>}
        <Box data-testid="journal-calendar-card" aria-label={`${year}년 ${value}월 거래 달력`} sx={{ ...calendarPanel, height: 302, p: '4px 7px 10px', boxSizing: 'border-box', userSelect: 'none', flexShrink: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', height: 22, alignItems: 'start' }}>{weekdays.map((day, index) => <Typography key={day} sx={{ textAlign: 'center', fontSize: 10, lineHeight: '14px', fontWeight: 600, color: index === 0 ? colors.marketRise : index === 6 ? colors.marketFall : colors.textMuted }}>{day}</Typography>)}</Box>
          <Box data-testid="journal-calendar-grid" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: 'repeat(6, 44px)' }}>{calendar.map(({ date, day, adjacent }, index) => {
            const count = counts.get(date), selected = selectedDate === date, holiday = holidays.get(date);
            return <ButtonBase key={date} aria-label={`${date}${holiday ? ` ${holiday}` : ''} 매수 ${count?.buy ?? 0}건 매도 ${count?.sell ?? 0}건`} aria-pressed={selected} onClick={() => selectDate(date)}
              sx={{ minWidth: 0, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', pt: 0, bgcolor: 'transparent', outline: selected ? '1.5px solid #EDBF40' : 'none', outlineOffset: '-1px', borderRadius: '4px', color: holiday || index % 7 === 0 ? colors.marketRise : adjacent ? colors.disabled : index % 7 === 6 ? colors.marketFall : colors.textPrimary, '&:focus-visible': { outline: `2px solid ${colors.warning}` } }}>
              <Typography component="span" sx={{ fontSize: 10, lineHeight: '14px', textAlign: 'center', fontWeight: selected ? 600 : 400 }}>{day}</Typography>
              {(['buy', 'sell'] as const).map(type => count?.[type] ? <Typography component="span" data-testid={`journal-chip-${type}`} key={type} sx={{ mx: '4px', px: '2px', mt: '1px', borderRadius: '2px', bgcolor: type === 'buy' ? 'rgba(64,134,87,0.7)' : 'rgba(207,74,83,0.7)', color: '#fff', border: 0, fontSize: 10, lineHeight: '12px', textAlign: 'center', whiteSpace: 'nowrap' }}>{type === 'buy' ? '매수' : '매도'} {count[type]}</Typography> : null)}
            </ButtonBase>;
          })}</Box>
        </Box>
        {tablet && <Box data-testid="journal-left-clearance" sx={{ height: 80 }}/>}
      </Box>}
      <Box ref={rightRef} data-scroll-region={tablet ? 'journal-detail' : undefined} data-list-condition={JSON.stringify([month, selectedDate, detailMode])}
        sx={{ minWidth: 0, minHeight: 0, height: { sm: '100%' }, overflowY: { sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        {liveApiEnabled && tradesError && !!remoteReport && <Button role="alert" onClick={() => void reloadTrades()}>최신 거래 조회 실패 · 다시 시도</Button>}
        {liveApiEnabled && lotsQuery.isError && <Button role="alert" onClick={() => void lotsQuery.refetch()}>연결 Lot 조회 실패 · 다시 시도</Button>}
        {detailMode === 'profit' ? <>{dateSelector}{profitCards}</> : detailMode === 'trade' && selectedTrade ? <>
          <Button onClick={() => setDetailMode('trades')} startIcon={<ArrowBackRounded/>} sx={{ minHeight: 32, fontSize: 12, mb: '8px' }}>거래현황으로 돌아가기</Button>{detail}
        </> : <Box data-testid="journal-day-card" {...dayGesture} sx={{ ...calendarPanel, p: '8px 14px', touchAction: 'pan-y' }}>
          {dayHeading}
          {summary}<Box sx={{ mt: '8px' }}>{titleRow}{transactions}</Box>
          <ButtonBase onClick={() => setDetailMode('profit')} sx={{ display: 'flex', justifyContent: 'flex-end', width: '100%', minHeight: 28, mt: '4px', color: colors.focus, fontSize: 10 }}>일별손익 보기 <ChevronRightRounded sx={{ fontSize: 16 }}/></ButtonBase>
        </Box>}
        <Box data-testid="journal-bottom-clearance" sx={{ height: 80 }}/>
      </Box>
    </Box>
    {tablet && <><OverlayRegionScrollbar scrollRef={leftRef} label="매매일지 달력 스크롤" offset={2}/><OverlayRegionScrollbar scrollRef={rightRef} label="매매일지 상세 스크롤" offset={4}/></>}
    <Dialog open={monthPickerOpen} onClose={() => setMonthPickerOpen(false)} aria-labelledby="journal-month-picker-title" fullWidth maxWidth="xs" slotProps={{ paper: { sx: { m: 2, maxWidth: 320, bgcolor: colors.surface, border: `1px solid ${colors.borderStrong}`, borderRadius: '14px', backgroundImage: 'none' } } }}>
      <DialogTitle id="journal-month-picker-title" sx={{ fontSize: 16, fontWeight: 700, pb: 1 }}>월 선택</DialogTitle>
      <DialogContent sx={{ pt: '4px !important' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <IconButton aria-label="이전 연도" onClick={() => setPickerYear((current) => current - 1)} sx={{ color: colors.textSecondary }}><ChevronLeftRounded /></IconButton>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{pickerYear}년</Typography>
          <IconButton aria-label="다음 연도" onClick={() => setPickerYear((current) => current + 1)} sx={{ color: colors.textSecondary }}><ChevronRightRounded /></IconButton>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {Array.from({ length: 12 }, (_, index) => {
            const target = dateOf(pickerYear, index + 1, 1).slice(0, 7);
            const active = target === month;
            return <ButtonBase key={target} aria-label={`${pickerYear}년 ${index + 1}월 선택`} aria-pressed={active} onClick={() => { goToMonth(target); setMonthPickerOpen(false); }} sx={{ height: 40, borderRadius: '8px', bgcolor: active ? colors.focus : colors.raised, color: active ? '#fff' : colors.textPrimary, fontSize: 13, fontWeight: active ? 700 : 500, '&:focus-visible': { outline: `2px solid ${colors.focus}` } }}>{index + 1}월</ButtonBase>;
          })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}><Button onClick={() => setMonthPickerOpen(false)} sx={{ color: colors.textSecondary }}>취소</Button></DialogActions>
    </Dialog>
  </>;
}


