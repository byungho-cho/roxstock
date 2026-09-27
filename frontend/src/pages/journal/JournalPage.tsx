import { AddRounded, ChevronLeftRounded, ChevronRightRounded, DeleteOutlineRounded, EditRounded } from '@mui/icons-material';
import { Box, Button, CardActionArea, IconButton, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppCard, ConfirmDialog, StatusChip } from '../../components/common/Common';
import { getBuyTrades, deleteBuyTrade } from '../../data/mockBuyTrades';
import { buyLots, stockItems } from '../../data/mockData';
import { getAvailableLots, getSellTrades, deleteSellTrade } from '../../data/mockSellTrades';
import { colors } from '../../styles/tokens';

type JournalEntry = {
  id: string;
  type: 'buy' | 'sell';
  date: string;
  stockId: string;
  stockName: string;
  quantity: number;
  price: number;
  feeTaxAmount: number;
  lotId?: string;
  profit?: number;
  sample?: boolean;
};

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split('-').map(Number);
  const shifted = new Date(year, value - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

export function JournalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today);
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);

  const entries = useMemo(() => {
    const lots = getAvailableLots();
    const buys: JournalEntry[] = getBuyTrades().map((trade) => ({
      ...trade, date: trade.tradeDate, stockName: stockItems.find((stock) => stock.id === trade.stockId)?.name ?? trade.stockId,
    }));
    const samples: JournalEntry[] = buyLots.map((lot) => ({
      id: lot.id, type: 'buy', date: lot.tradeDate, stockId: lot.stockId, stockName: lot.stockName,
      quantity: lot.quantity, price: lot.buyPrice, feeTaxAmount: 0, sample: true,
    }));
    const sells: JournalEntry[] = getSellTrades().map((trade) => {
      const lot = lots.find((item) => item.id === trade.lotId);
      return {
        ...trade, date: trade.tradeDate,
        stockName: stockItems.find((stock) => stock.id === trade.stockId)?.name ?? trade.stockId,
        profit: lot ? trade.quantity * (trade.price - lot.buyPrice) - trade.feeTaxAmount : undefined,
      };
    });
    return [...buys, ...samples, ...sells].sort((a, b) => b.date.localeCompare(a.date));
  }, [revision]);

  const monthEntries = entries.filter((entry) => entry.date.startsWith(month));
  const dayEntries = monthEntries.filter((entry) => entry.date === selectedDate);
  const counts = new Map<string, { buy: number; sell: number }>();
  for (const entry of monthEntries) {
    const count = counts.get(entry.date) ?? { buy: 0, sell: 0 };
    count[entry.type] += 1;
    counts.set(entry.date, count);
  }
  const [year, value] = month.split('-').map(Number);
  const leadingDays = new Date(year, value - 1, 1).getDay();
  const daysInMonth = new Date(year, value, 0).getDate();

  const changeMonth = (offset: number) => {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelectedDate(`${next}-01`);
  };
  const edit = (entry: JournalEntry) => {
    if (entry.sample) return;
    const params = new URLSearchParams({ type: entry.type, stock: entry.stockId, edit: entry.id, return: 'journal', fromDate: selectedDate });
    if (entry.lotId) params.set('lot', entry.lotId);
    navigate(`/trade?${params}`);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    if (deleting.type === 'sell') deleteSellTrade(deleting.id);
    else deleteBuyTrade(deleting.id, getAvailableLots(deleting.stockId).find((lot) => lot.id === deleting.id)?.soldQuantity ?? 0);
    void queryClient.invalidateQueries({ queryKey: ['buyLots', deleting.stockId] });
    setDeleting(null);
    setRevision((value) => value + 1);
  };

  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'start' }}>
    <AppCard sx={{ width: { xs: '100%', sm: '48%' }, p: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <IconButton aria-label="이전 달" onClick={() => changeMonth(-1)}><ChevronLeftRounded /></IconButton>
        <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{year}년 {value}월</Typography>
        <IconButton aria-label="다음 달" onClick={() => changeMonth(1)}><ChevronRightRounded /></IconButton>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
        {weekdays.map((day) => <Typography key={day} sx={{ textAlign: 'center', color: colors.textMuted, fontSize: 11, py: 0.5 }}>{day}</Typography>)}
        {Array.from({ length: leadingDays }, (_, index) => <Box key={`blank-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const date = `${month}-${String(day).padStart(2, '0')}`;
          const count = counts.get(date);
          return <Box key={date} component="button" aria-label={`${date} 거래 ${count ? count.buy + count.sell : 0}건`} aria-pressed={date === selectedDate} onClick={() => setSelectedDate(date)} sx={{ minWidth: 0, minHeight: 47, border: `1px solid ${date === selectedDate ? colors.focus : 'transparent'}`, borderRadius: 2, bgcolor: date === selectedDate ? colors.raised : 'transparent', color: colors.textPrimary, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: date === selectedDate ? 700 : 400 }}>{day}</Typography>
            <Stack direction="row" spacing={0.4} sx={{ height: 4 }}>
              {count?.buy ? <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: colors.marketFall }} /> : null}
              {count?.sell ? <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: colors.marketRise }} /> : null}
            </Stack>
          </Box>;
        })}
      </Box>
      <Typography sx={{ mt: 1.5, textAlign: 'right', color: colors.textMuted, fontSize: 11 }}>이번 달 {monthEntries.length}건 · 매수 {monthEntries.filter((entry) => entry.type === 'buy').length}건 · 매도 {monthEntries.filter((entry) => entry.type === 'sell').length}건</Typography>
    </AppCard>

    <Stack spacing={1.5} sx={{ width: { xs: '100%', sm: '52%' }, minWidth: 0 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{selectedDate.replaceAll('-', '.')} 거래내역</Typography>
        <Button startIcon={<AddRounded />} onClick={() => navigate('/trade?type=buy')} sx={{ color: colors.focus, minWidth: 0 }}>매수 등록</Button>
      </Stack>
      {dayEntries.length ? dayEntries.map((entry) => {
        const sold = entry.type === 'buy' ? getAvailableLots(entry.stockId).find((lot) => lot.id === entry.id)?.soldQuantity ?? 0 : 0;
        return <AppCard key={`${entry.type}-${entry.id}`} sx={{ overflow: 'hidden' }}>
          <CardActionArea onClick={() => entry.sample ? navigate(`/stocks/${entry.stockId}?tab=holding`) : edit(entry)} sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <StatusChip label={entry.type === 'buy' ? '매수' : '매도'} tone={entry.type === 'buy' ? 'fall' : 'rise'} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{entry.stockName} {entry.sample && <Typography component="span" sx={{ color: colors.textMuted, fontSize: 10 }}>기본 예시</Typography>}</Typography>
              <Typography sx={{ color: colors.textMuted, fontSize: 11 }}>{entry.quantity.toLocaleString('ko-KR')}주 × {won(entry.price)}</Typography>
            </Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: entry.type === 'buy' ? colors.marketFall : colors.marketRise, textAlign: 'right' }}>{won(entry.quantity * entry.price)}{entry.profit !== undefined && <Typography sx={{ fontSize: 10, color: entry.profit > 0 ? colors.marketRise : entry.profit < 0 ? colors.marketFall : colors.textPrimary }}>손익 {entry.profit > 0 ? '+' : ''}{won(entry.profit)}</Typography>}</Typography>
          </Stack>
          </CardActionArea>
          {!entry.sample && <Stack direction="row" sx={{ justifyContent: 'flex-end', px: 1.5, pb: 0.5 }}>
            <Button size="small" startIcon={<EditRounded />} onClick={() => edit(entry)}>수정</Button>
            <Button size="small" startIcon={<DeleteOutlineRounded />} disabled={sold > 0} title={sold > 0 ? '연결된 매도 거래를 먼저 삭제해 주세요' : undefined} onClick={() => setDeleting(entry)} sx={{ color: colors.marketRise }}>삭제</Button>
          </Stack>}
        </AppCard>;
      }) : <AppCard sx={{ p: 3, textAlign: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 13 }}>선택한 날짜의 거래가 없습니다.</Typography></AppCard>}
    </Stack>

    <ConfirmDialog open={Boolean(deleting)} title={`${deleting?.type === 'buy' ? '매수' : '매도'} 거래를 삭제할까요?`} description={deleting ? `${deleting.stockName} · ${deleting.date} · ${deleting.quantity}주${deleting.type === 'sell' ? ' (연결된 매수의 매도 가능 수량이 복구됩니다)' : ''}` : ''} confirmLabel="삭제" danger onConfirm={confirmDelete} onClose={() => setDeleting(null)} />
  </Stack>;
}
