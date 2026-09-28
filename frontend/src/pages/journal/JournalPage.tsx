import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material';
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography, useMediaQuery } from '@mui/material';
import { useMemo, useRef, useState, type TouchEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getBuyTrades } from '../../data/mockBuyTrades';
import { buyLots, stockItems } from '../../data/mockData';
import { getAvailableLots, getSellTrades } from '../../data/mockSellTrades';
import { liveApiEnabled } from '../../data/liveData';
import { currentAccountId, getTrades } from '../../data/roxstockApi';
import { PageHeader } from '../../components/navigation/Navigation';
import { colors } from '../../styles/tokens';
import { getKoreanHolidays } from './koreanHolidays';

type Entry = { id: string; type: 'buy' | 'sell'; date: string; stockId: string; stockName: string; quantity: number; price: number; profit?: number; lotId?: string; sample?: boolean };
// Journal-only examples: these illustrate multiple trades on a day without changing holdings or cash.
const exampleTrades: Entry[] = [
  { id: 'example-0903-buy', type: 'buy', date: '2026-09-03', stockId: 'hyundai', stockName: '현대자동차', quantity: 5, price: 230000, sample: true },
  { id: 'example-0903-sell', type: 'sell', date: '2026-09-03', stockId: 'kia', stockName: '기아', quantity: 4, price: 130000, profit: 40000, sample: true },
  { id: 'example-0914-buy-1', type: 'buy', date: '2026-09-14', stockId: 'samsung', stockName: '삼성전자', quantity: 10, price: 84600, sample: true },
  { id: 'example-0914-buy-2', type: 'buy', date: '2026-09-14', stockId: 'naver', stockName: 'NAVER', quantity: 2, price: 222500, sample: true },
  { id: 'example-0914-sell-1', type: 'sell', date: '2026-09-14', stockId: 'hyundai', stockName: '현대자동차', quantity: 2, price: 519000, profit: 18000, sample: true },
  { id: 'example-0914-sell-2', type: 'sell', date: '2026-09-14', stockId: 'kia', stockName: '기아', quantity: 3, price: 130000, profit: 30000, sample: true },
  { id: 'example-0914-sell-3', type: 'sell', date: '2026-09-14', stockId: 'samsung', stockName: '삼성전자', quantity: 2, price: 84600, profit: 9200, sample: true },
  { id: 'example-0921-buy', type: 'buy', date: '2026-09-21', stockId: 'kia', stockName: '기아', quantity: 5, price: 130000, sample: true },
  { id: 'example-0921-sell-1', type: 'sell', date: '2026-09-21', stockId: 'hyundai', stockName: '현대자동차', quantity: 1, price: 519000, profit: 9000, sample: true },
  { id: 'example-0921-sell-2', type: 'sell', date: '2026-09-21', stockId: 'naver', stockName: 'NAVER', quantity: 2, price: 222500, profit: 15000, sample: true },
];
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const getTodayDate = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const won = (amount: number) => `${Math.round(amount).toLocaleString('ko-KR')}원`;
const signedWon = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${won(Math.abs(amount))}`;
const dateOf = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const monthOf = (date: string) => date.slice(0, 7);
function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value - 1 + offset, 1);
  return dateOf(next.getFullYear(), next.getMonth() + 1, 1).slice(0, 7);
}
const panel = { bgcolor: colors.surface, border: `1px solid ${colors.borderStrong}`, borderRadius: '14px' } as const;

export function JournalPage() {
  const navigate = useNavigate();
  const tablet = useMediaQuery('(min-width:600px)');
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('date');
  const initialDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : getTodayDate();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [month, setMonth] = useState(monthOf(initialDate));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(initialDate.slice(0, 4)));
  const [detailNotice, setDetailNotice] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const { data: remoteReport, isPending: tradesPending, isError: tradesError, refetch: reloadTrades } = useQuery({
    queryKey: ['journalTrades', month], enabled: liveApiEnabled,
    queryFn: async () => {
      const [year, value] = month.split('-').map(Number);
      const first = new Date(year, value - 1, 1);
      const last = new Date(year, value, 0);
      first.setDate(first.getDate() - 6);
      last.setDate(last.getDate() + 6);
      return getTrades(await currentAccountId(), {
        from: dateOf(first.getFullYear(), first.getMonth() + 1, first.getDate()),
        to: dateOf(last.getFullYear(), last.getMonth() + 1, last.getDate()),
      });
    },
  });

  const entries = useMemo(() => {
    if (liveApiEnabled) return (remoteReport?.data ?? []).map((trade): Entry => ({
      id: trade.id, type: trade.type === 'BUY' ? 'buy' : 'sell',
      date: new Date(trade.tradedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
      stockId: trade.security.id, stockName: trade.security.name, quantity: Number(trade.quantity),
      price: Number(trade.unitPrice), profit: trade.realizedProfitLoss === null ? undefined : Number(trade.realizedProfitLoss),
      lotId: trade.type === 'SELL' ? trade.buyTradeId : undefined,
    }));
    const lots = getAvailableLots();
    const buys: Entry[] = getBuyTrades().map((trade) => ({ id: trade.id, type: 'buy', date: trade.tradeDate, stockId: trade.stockId, stockName: stockItems.find((stock) => stock.id === trade.stockId)?.name ?? trade.stockId, quantity: trade.quantity, price: trade.price }));
    const samples: Entry[] = buyLots.map((lot) => ({ id: lot.id, type: 'buy', date: lot.tradeDate, stockId: lot.stockId, stockName: stockItems.find((stock) => stock.id === lot.stockId)?.name ?? lot.stockName, quantity: lot.quantity, price: lot.buyPrice, sample: true }));
    const sells: Entry[] = getSellTrades().map((trade) => {
      const lot = lots.find((candidate) => candidate.id === trade.lotId);
      return { id: trade.id, type: 'sell', date: trade.tradeDate, stockId: trade.stockId, stockName: stockItems.find((stock) => stock.id === trade.stockId)?.name ?? trade.stockId, quantity: trade.quantity, price: trade.price, lotId: trade.lotId, profit: lot ? trade.quantity * (trade.price - lot.buyPrice) : undefined };
    });
    return [...buys, ...samples, ...sells, ...exampleTrades].sort((a, b) => b.date.localeCompare(a.date));
  }, [remoteReport]);
  const goToMonth = (next: string) => {
    const day = Math.min(Number(selectedDate.slice(8, 10)), new Date(Number(next.slice(0, 4)), Number(next.slice(5, 7)), 0).getDate());
    setMonth(next);
    setSelectedDate(`${next}-${String(day).padStart(2, '0')}`);
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
  const rows = Math.ceil((firstWeekday + new Date(year, value, 0).getDate()) / 7);
  const calendar = Array.from({ length: rows * 7 }, (_, index) => {
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
  const monthProfit = monthEntries.reduce((sum, entry) => sum + (entry.profit ?? 0), 0);
  const monthBuy = monthEntries.filter((entry) => entry.type === 'buy').reduce((sum, entry) => sum + entry.quantity * entry.price, 0);
  const dayProfit = dayEntries.reduce((sum, entry) => sum + (entry.profit ?? 0), 0);
  const dayBuy = dayEntries.filter((entry) => entry.type === 'buy').reduce((sum, entry) => sum + entry.quantity * entry.price, 0);
  const daySell = dayEntries.filter((entry) => entry.type === 'sell').reduce((sum, entry) => sum + entry.quantity * entry.price, 0);
  const dayAmount = dayBuy + daySell;
  const dayWeekday = new Date(`${selectedDate}T12:00:00`).getDay();
  const selectDate = (date: string) => { setSelectedDate(date); setMonth(monthOf(date)); };
  const openEntry = (entry: Entry) => {
    if (liveApiEnabled) { setDetailNotice(true); return; }
    if (entry.sample) { navigate(`/stocks/${entry.stockId}?tab=trades`); return; }
    const params = new URLSearchParams({ type: entry.type, stock: entry.stockId, edit: entry.id, return: 'journal', fromDate: selectedDate });
    if (entry.lotId) params.set('lot', entry.lotId);
    navigate(`/trade?${params}`);
  };
  const monthControls = <Stack direction="row" sx={{ width: { xs: '100%', sm: 'auto' }, height: 44, alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'center' }, gap: { xs: 0, sm: '2px' } }}>
    <IconButton aria-label="이전 달" onClick={() => changeMonth(-1)} sx={{ width: { xs: 44, sm: 28 }, height: { xs: 44, sm: 36 }, color: colors.textSecondary }}><ChevronLeftRounded sx={{ fontSize: 20 }} /></IconButton>
    <Box sx={{ textAlign: 'center', minWidth: 155 }}>
      <ButtonBase aria-label={`${year}년 ${value}월, 월 선택`} onClick={() => { setPickerYear(year); setMonthPickerOpen(true); }} sx={{ display: 'block', mx: 'auto', borderRadius: '4px', '&:focus-visible': { outline: `2px solid ${colors.focus}` } }}><Typography sx={{ fontSize: 13, lineHeight: '18px', fontWeight: 700 }}>{year}년 {value}월</Typography></ButtonBase>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: 10, lineHeight: '14px', whiteSpace: 'nowrap', color: monthProfit >= 0 ? colors.marketRise : colors.marketFall }}>
        <Box component="span">월손익</Box>
        <Box component="span">{monthBuy ? `${(monthProfit / monthBuy * 100).toFixed(1)}%` : '0.0%'}</Box>
        <Box component="span">{signedWon(monthProfit)}</Box>
      </Box>
    </Box>
    <IconButton aria-label="다음 달" onClick={() => changeMonth(1)} sx={{ width: { xs: 44, sm: 28 }, height: { xs: 44, sm: 36 }, color: colors.textSecondary }}><ChevronRightRounded sx={{ fontSize: 20 }} /></IconButton>
  </Stack>;

  if (liveApiEnabled && (tradesPending || tradesError)) return <>
    <PageHeader embedded title="매매일지" variant="home" showAdd={false} />
    {tradesError ? <Button role="alert" onClick={() => void reloadTrades()}>거래내역을 불러오지 못했습니다. 다시 시도</Button> : <Typography role="status">거래내역을 불러오는 중입니다.</Typography>}
  </>;
  return <>
    {detailNotice && <Typography role="status" sx={{ color: colors.textMuted, fontSize: 11 }}>개별 거래 상세 조회 API가 준비되지 않아 수정·삭제 화면에 진입할 수 없습니다.</Typography>}
    <PageHeader embedded title="매매일지" variant="home" showAdd={false} maxWidth={1100} center={monthControls} action={<Button onClick={() => selectDate(getTodayDate())} aria-label="오늘 날짜로 이동" sx={{ minWidth: 56, minHeight: 32, height: 32, p: 0, border: `1px solid ${colors.borderStrong}`, borderRadius: '8px', color: colors.textPrimary, fontSize: 12, fontWeight: 700 }}>오늘</Button>} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, min(400px, calc((100% - 16px) / 2))) minmax(0, 1fr)' }, height: { sm: '100%' }, minHeight: 0, gap: { xs: '12px', sm: '16px' }, px: { xs: 0, sm: '6px' } }}>
    <Stack spacing={{ xs: '12px', sm: 0 }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null; }} onClickCapture={(event) => {
      if (Date.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    }} sx={{ minWidth: 0, minHeight: 0, height: { sm: '100%' }, touchAction: 'pan-y' }}>
      <Stack direction="row" sx={{ ...panel, display: { sm: 'none' }, height: 44, alignItems: 'center', justifyContent: 'space-between', px: '6px', flexShrink: 0 }}>
        {monthControls}
      </Stack>
      <Box aria-label={`${year}년 ${value}월 거래 달력`} sx={{ ...panel, p: { xs: '8px', sm: '4px 8px' }, userSelect: 'none', display: 'flex', flexDirection: 'column', flex: { sm: 1 }, minHeight: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', height: 25, alignItems: 'center' }}>{weekdays.map((day, index) => <Typography key={day} sx={{ textAlign: 'center', fontSize: 9, fontWeight: 600, color: index === 0 ? colors.marketRise : index === 6 ? colors.marketFall : colors.textMuted }}>{day}</Typography>)}</Box>
        <Box sx={{ flex: { sm: 1 }, minHeight: 0, overflowY: { sm: 'auto' }, scrollbarWidth: 'thin', borderTop: `1px solid ${colors.borderStrong}` }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: { sm: `repeat(${rows}, minmax(42px, 1fr))` }, minHeight: { sm: '100%' } }}>{calendar.map(({ date, day, adjacent }, index) => {
          const count = counts.get(date);
          const selected = selectedDate === date;
          const holiday = holidays.get(date);
          return <ButtonBase key={date} component="button" aria-label={`${date}${holiday ? ` ${holiday}` : ''} 매수 ${count?.buy ?? 0}건 매도 ${count?.sell ?? 0}건`} aria-pressed={selected} onClick={() => selectDate(date)} sx={{ minWidth: 0, height: { xs: 50, sm: '100%' }, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', alignSelf: 'stretch', textAlign: 'left', px: '3px', py: { xs: '3px', sm: '1px' }, border: 0, borderBottom: index >= calendar.length - 7 ? 0 : `1px solid ${colors.borderStrong}`, bgcolor: selected ? '#302B1B' : 'transparent', outline: selected ? `1px solid ${colors.warning}` : 'none', outlineOffset: selected ? '-2px' : undefined, borderRadius: selected ? '7px' : 0, color: holiday || index % 7 === 0 ? colors.marketRise : adjacent ? colors.disabled : index % 7 === 6 ? colors.marketFall : colors.textPrimary, cursor: 'pointer', '&:focus-visible': { outline: `2px solid ${colors.warning}` } }}>
            <Typography component="span" sx={{ display: 'block', fontSize: 9, lineHeight: '13px', fontWeight: selected ? 700 : 400, color: holiday ? colors.marketRise : 'inherit' }}>{day}</Typography>
            {count?.buy ? <Typography component="span" sx={{ display: 'block', width: 'fit-content', maxWidth: '100%', px: '2px', mt: { xs: '2px', sm: '1px' }, border: `1px solid ${colors.marketFall}`, borderRadius: '3px', color: colors.marketFall, fontSize: 8, lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden' }}>매수 {count.buy}</Typography> : null}
            {count?.sell ? <Typography component="span" sx={{ display: 'block', width: 'fit-content', maxWidth: '100%', px: '2px', mt: { xs: '2px', sm: '1px' }, border: `1px solid ${colors.marketRise}`, borderRadius: '3px', color: colors.marketRise, fontSize: 8, lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden' }}>매도 {count.sell}</Typography> : null}
          </ButtonBase>;
        })}</Box></Box>
      </Box>
    </Stack>
    <Box sx={{ ...panel, mt: { xs: 0, sm: 0 }, px: { xs: '12px', sm: '16px' }, py: { xs: '12px', sm: '14px' }, minWidth: 0, minHeight: 0, display: { sm: 'flex' }, flexDirection: { sm: 'column' }, alignSelf: { xs: 'start', sm: 'stretch' }, containerType: 'inline-size' }}>
      {tablet ? <>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontSize: 15, fontWeight: 700 }}>{selectedDate.replaceAll('-', '.')} · {weekdays[dayWeekday]}요일</Typography></Stack>
        <Stack direction="row" sx={{ mt: '20px', justifyContent: 'space-between' }}><Typography sx={{ color: colors.textMuted, fontSize: 11 }}>전체손익</Typography><Typography sx={{ color: dayProfit > 0 ? colors.marketRise : dayProfit < 0 ? colors.marketFall : colors.textMuted, fontSize: 11 }}>{dayProfit && dayBuy ? `${(dayProfit / dayBuy * 100).toFixed(1)}%` : '0.0%'}</Typography></Stack>
        <Typography sx={{ color: dayProfit > 0 ? colors.marketRise : dayProfit < 0 ? colors.marketFall : colors.textPrimary, fontSize: 24, fontWeight: 700, lineHeight: '31px', textAlign: 'right' }}>{signedWon(dayProfit)}</Typography>
        <Typography sx={{ color: colors.textMuted, fontSize: 10, mt: '2px' }}>매수 {won(dayBuy)} · 매도 {won(daySell)}</Typography>
        <Stack direction="row" sx={{ mt: '25px', mb: '7px', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 13, fontWeight: 700 }}>거래현황</Typography><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>총 {dayEntries.length}건</Typography></Stack>
      </> : <Stack direction="row" sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{selectedDate.slice(5).replace('-', '.')} 거래 {dayEntries.length}건</Typography><Typography sx={{ fontSize: 12, fontWeight: 700, color: colors.marketRise }}>{won(dayAmount)}</Typography></Stack>}
      <Box sx={{ borderTop: { xs: `1px solid ${colors.borderStrong}`, sm: 0 }, pt: { xs: '5px', sm: 0 }, flex: { sm: 1 }, minHeight: 0, overflowY: { sm: 'auto' }, scrollbarWidth: 'thin' }}>
        {dayEntries.length ? dayEntries.map((entry) => <ButtonBase key={`${entry.type}-${entry.id}`} component="button" onClick={() => openEntry(entry)} aria-label={`${entry.type === 'buy' ? '매수' : '매도'} ${entry.stockName} 거래 상세`} sx={{ width: '100%', minHeight: { xs: 24, sm: 45 }, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 102px 110px', sm: 'minmax(0, 1fr) minmax(112px, auto)' }, gridTemplateAreas: { xs: '"stock expression amount"', sm: '"stock values"' }, alignItems: 'center', textAlign: 'left', color: colors.textPrimary, '@media (max-width:599px)': { '@container (max-width: 300px)': { gridTemplateColumns: 'minmax(0, 1fr) auto', gridTemplateAreas: '"stock amount" "expression amount"', rowGap: '2px' } }, '&:focus-visible': { outline: `2px solid ${colors.focus}` } }}>
          <Box sx={{ gridArea: 'stock', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
            <Typography component="span" sx={{ flexShrink: 0, width: 'fit-content', border: `1px solid ${entry.type === 'buy' ? colors.marketFall : colors.marketRise}`, color: entry.type === 'buy' ? colors.marketFall : colors.marketRise, borderRadius: '3px', px: '3px', fontSize: 9, lineHeight: '15px' }}>{entry.type === 'buy' ? '매수' : '매도'}</Typography>
            <Typography sx={{ minWidth: 0, fontSize: { xs: 10.5, sm: 11.5 }, fontWeight: 600, lineHeight: '16px', overflowWrap: 'anywhere' }}>{entry.stockName}</Typography>
          </Box>
          <Box sx={{ gridArea: 'values', display: { xs: 'none', sm: 'flex' }, minWidth: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography noWrap sx={{ color: colors.textMuted, fontSize: 10.25, lineHeight: '16px', textAlign: 'right' }}>{entry.quantity.toLocaleString('ko-KR')} × {won(entry.price)}</Typography>
            <Typography noWrap sx={{ color: entry.type === 'buy' ? colors.marketFall : colors.marketRise, fontSize: 11.5, fontWeight: 700, lineHeight: '18px', textAlign: 'right' }}>{won(entry.quantity * entry.price)}</Typography>
          </Box>
          <Typography noWrap sx={{ gridArea: 'expression', display: { sm: 'none' }, minWidth: 0, color: colors.textMuted, fontSize: 9.25, textAlign: 'right' }}>{entry.quantity.toLocaleString('ko-KR')} × {won(entry.price)}</Typography>
          <Typography sx={{ gridArea: 'amount', display: { sm: 'none' }, minWidth: 0, color: entry.type === 'buy' ? colors.marketFall : colors.marketRise, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}>{won(entry.quantity * entry.price)}</Typography>
        </ButtonBase>) : <Typography sx={{ color: colors.textMuted, fontSize: 11, py: 2, borderTop: `1px solid ${colors.border}` }}>선택한 날짜의 거래가 없습니다.</Typography>}
      </Box>
      {!tablet && <ButtonBase onClick={() => navigate(`/detail/daily-profit?date=${selectedDate}`)} sx={{ mt: '8px', color: colors.focus, fontSize: 11, fontWeight: 600, minHeight: 28 }}>일별 상세보기 ›</ButtonBase>}
    </Box>
    </Box>
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
