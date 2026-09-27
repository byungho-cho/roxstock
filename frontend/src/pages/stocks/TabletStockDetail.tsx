import { AddRounded } from '@mui/icons-material';
import { Box, Button, IconButton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { stockItems } from '../../data/mockData';
import type { StockItem, StockListType } from '../../types/models';
import { colors } from '../../styles/tokens';
import { formatRate, getMarketColor } from '../../utils/format';
import { navigateToForm } from '../../utils/focusForm';

type DetailTab = 'holding' | 'summary' | 'trades';
const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const industry = (stock: StockItem) => {
  if (stock.id === 'samsung' || stock.id === 'hynix-holding' || stock.id === 'samsung-sdi') return '반도체';
  if (stock.id === 'naver' || stock.id === 'naver-financial') return '인터넷';
  if (stock.id === 'hyundai' || stock.id === 'kia') return '자동차';
  return '코스피';
};

const recentTrades = [
  { stockId: 'hyundai', date: '09.18', type: '매수', quantity: 10, price: 230_000 },
  { stockId: 'hyundai', date: '09.12', type: '매도', quantity: 20, price: 242_000 },
  { stockId: 'hyundai', date: '09.05', type: '매수', quantity: 15, price: 218_000 },
  { stockId: 'hyundai', date: '08.28', type: '매도', quantity: 30, price: 205_000 },
  { stockId: 'hyundai', date: '08.14', type: '매도', quantity: 10, price: 198_000 },
];

export function TabletStockDetail({ stock }: { stock: StockItem }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DetailTab>('holding');
  const holdings = stockItems.filter((item) => item.listType === 'holding');
  const visible = [stock, ...holdings.filter((item) => item.id !== stock.id)].slice(0, 3);
  const invested = (stock.quantity ?? 0) * (stock.averagePrice ?? 0);
  const market = stock.marketValue ?? (stock.quantity ?? 0) * stock.currentPrice;
  const profit = stock.profitAmount ?? market - invested;
  const profitRate = invested ? profit / invested * 100 : 0;
  const trades = recentTrades.filter((item) => item.stockId === stock.id).slice(0, 5);

  const selectCategory = (category: StockListType) => navigate(`/stocks?tab=${category}`);

  return <Box sx={{ pb: 2 }}>
    <PageHeader title="종목목록" subtitle="관심·보유·추천 종목을 한 곳에서 관리합니다" embedded scope="tablet" showAdd={false} action={<IconButton aria-label="종목 추가" onClick={() => navigateToForm(navigate, '/stocks/add?type=holding')} sx={{ width: 38, height: 38, bgcolor: colors.raised, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}><AddRounded /></IconButton>} />
    <Tabs value="holding" onChange={(_, category: StockListType) => selectCategory(category)} variant="fullWidth" sx={{ height: 46, minHeight: 46, p: '5px', border: `1px solid ${colors.borderStrong}`, borderRadius: '14px', bgcolor: colors.surface, '& .MuiTab-root': { minHeight: 34, height: 34, p: 0, borderRadius: '10px', color: colors.textMuted, fontSize: 12 }, '& .Mui-selected': { bgcolor: colors.buttonPrimary, color: `${colors.textPrimary} !important`, fontWeight: 600 }, '& .MuiTabs-indicator': { display: 'none' } }}><Tab value="watchlist" label="관심종목" /><Tab value="holding" label="보유종목" /><Tab value="recommended" label="추천종목" /></Tabs>
    <Stack direction="row" sx={{ mt: '14px', mb: '8px', justifyContent: 'space-between', color: colors.textMuted }}><Stack direction="row" spacing="5px" sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 11 }}>보유중 {holdings.length}</Typography><Box role="img" aria-label="시세 수집 정상" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors.positive }} /></Stack><Typography sx={{ fontSize: 11 }}>목록에서 선택하면 우측 상세가 갱신됩니다</Typography></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 304px) minmax(0, 1fr)', gap: '12px', alignItems: 'start' }}>
      <Box sx={{ height: 366, p: '12px 11px', display: 'flex', flexDirection: 'column', border: `1px solid ${colors.borderStrong}`, borderRadius: '12px', bgcolor: colors.surface }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, mb: '10px' }}>보유종목</Typography>
        <Stack spacing="8px" sx={{ overflowY: "auto", minHeight: 0, flex: 1, scrollbarWidth: "thin" }}>{visible.map((item) => <Box key={item.id} component="button" aria-current={item.id === stock.id ? 'true' : undefined} onClick={() => { setTab('holding'); navigate(`/stocks/${item.id}`); }} sx={{ width: '100%', minHeight: 64, px: '11px', py: '8px', border: '1px solid', borderColor: item.id === stock.id ? colors.buttonPrimary : colors.borderStrong, borderRadius: '10px', bgcolor: item.id === stock.id ? '#182235' : colors.surface, color: colors.textPrimary, cursor: 'pointer', textAlign: 'left' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}><Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{item.name}</Typography><Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: getMarketColor(item.priceChangeRate) }}>{won(item.currentPrice)}</Typography></Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: '2px' }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>{item.symbol} · {industry(item)}</Typography><Typography sx={{ fontSize: 11, color: getMarketColor(item.priceChangeRate) }}>{formatRate(item.priceChangeRate)}</Typography></Stack>
        </Box>)}</Stack>
      </Box>
      <Box sx={{ position: 'sticky', top: 0, minHeight: 366, p: '10px 19px 15px', border: `1px solid ${colors.borderStrong}`, borderRadius: '12px', bgcolor: colors.surface }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: colors.buttonPrimary }}>보유종목 상세</Typography>
        <Stack direction="row" sx={{ alignItems: 'start', justifyContent: 'space-between', mt: '2px' }}><Box><Typography noWrap sx={{ fontSize: 22, fontWeight: 700, lineHeight: '29px' }}>{stock.name}</Typography><Typography sx={{ color: colors.textMuted, fontSize: 11 }}>{stock.symbol} · KOSPI</Typography></Box><Box sx={{ textAlign: 'right' }}><Typography noWrap sx={{ fontSize: 20, fontWeight: 700, color: getMarketColor(stock.priceChangeRate) }}>{won(stock.currentPrice)}</Typography><Typography sx={{ fontSize: 11, color: getMarketColor(stock.priceChangeRate) }}>{formatRate(stock.priceChangeRate)}</Typography></Box></Stack>
        <Stack direction="row" spacing="8px" sx={{ mt: '9px' }}>
          {([['holding', '보유현황'], ['summary', '요약'], ['trades', '거래내역']] as const).map(([value, label]) => <Button key={value} onClick={() => setTab(value)} aria-pressed={tab === value} sx={{ minWidth: 0, minHeight: 28, height: 28, px: '11px', border: `1px solid ${tab === value ? colors.buttonPrimary : colors.borderStrong}`, borderRadius: '8px', bgcolor: tab === value ? colors.buttonPrimary : '#172033', color: tab === value ? colors.textPrimary : colors.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>{label}</Button>)}
          <Button onClick={() => navigate(`/stocks/${stock.id}/value`)} sx={linkStyle}>가치분석</Button><Button onClick={() => navigate(`/stocks/${stock.id}/financials`)} sx={linkStyle}>재무지표</Button>
        </Stack>
        {tab === 'holding' ? <>
          <Stack direction="row" spacing="14px" sx={{ mt: '12px' }}><SummaryMetric label="평가금액" value={won(market)} color={getMarketColor(profit)} detail={`${stock.quantity ?? 0} × ${won(stock.currentPrice)}`} /><SummaryMetric label="평가손익" value={`${profit >= 0 ? '+' : ''}${won(profit)}`} color={getMarketColor(profit)} detail={formatRate(profitRate)} /></Stack>
          <Typography sx={{ mt: '8px', mb: '4px', fontSize: 11, color: colors.textMuted }}>최근 거래 내역</Typography>
          {trades.length ? trades.map((trade) => <Box key={trade.date} sx={{ display: 'grid', gridTemplateColumns: '48px 32px minmax(0, 1fr) 122px', alignItems: 'center', gap: '8px', height: 28, borderBottom: `1px solid ${colors.borderStrong}`, fontSize: 11, color: trade.type === '매도' ? colors.marketRise : colors.textPrimary }}><Box sx={{ color: colors.textMuted }}>{trade.date}</Box><Box>{trade.type}</Box><Box sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{trade.quantity}주 × {won(trade.price)}</Box><Box sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{won(trade.quantity * trade.price)}</Box></Box>) : <Typography sx={{ mt: 2, fontSize: 11, color: colors.textMuted }}>최근 거래 내역이 없습니다.</Typography>}
        </> : tab === 'summary' ? <Stack spacing="8px" sx={{ mt: '12px' }}><SummaryMetric label="보유수량 / 평균단가" value={`${stock.quantity ?? 0}주 · ${won(stock.averagePrice ?? 0)}`} /><SummaryMetric label="매입금액" value={won(invested)} /><SummaryMetric label="평가금액" value={won(market)} color={getMarketColor(profit)} /><SummaryMetric label="평가손익" value={`${formatRate(profitRate)} · ${won(profit)}`} color={getMarketColor(profit)} /></Stack> : <Box sx={{ mt: '12px' }}>{trades.length ? trades.map((trade) => <Stack key={trade.date} direction="row" sx={{ justifyContent: 'space-between', py: '8px', borderBottom: `1px solid ${colors.borderStrong}`, fontSize: 11, color: trade.type === '매도' ? colors.marketRise : colors.textPrimary }}><span>{trade.date} · {trade.type}</span><span>{trade.quantity}주 × {won(trade.price)}</span><span>{won(trade.quantity * trade.price)}</span></Stack>) : <Typography sx={{ fontSize: 11, color: colors.textMuted }}>거래내역이 없습니다.</Typography>}</Box>}
      </Box>
    </Box>
  </Box>;
}

const linkStyle = { minWidth: 0, minHeight: 28, height: 28, px: '10px', border: `1px solid ${colors.borderStrong}`, borderRadius: '8px', bgcolor: '#172033', color: colors.textMuted, fontSize: 11, whiteSpace: 'nowrap' } as const;

function SummaryMetric({ label, value, color = colors.textPrimary, detail }: { label: string; value: string; color?: string; detail?: string }) {
  return <Box sx={{ flex: 1, minWidth: 0, minHeight: 58, p: '8px 11px', bgcolor: '#172033', borderRadius: '10px' }}><Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>{label}</Typography>{detail && <Typography noWrap sx={{ fontSize: 10, color }}>{detail}</Typography>}</Stack><Typography noWrap sx={{ mt: '4px', textAlign: 'right', fontSize: 14, fontWeight: 600, color }}>{value}</Typography></Box>;
}
