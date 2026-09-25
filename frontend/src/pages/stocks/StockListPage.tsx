import { AddRounded, EditRounded, FavoriteBorderRounded, FavoriteRounded, InboxRounded, SearchRounded, SwapVertRounded } from '@mui/icons-material';
import { Box, Button, Card, CardActionArea, CardContent, Chip, Grid, IconButton, InputBase, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStocks } from '../../hooks/useMockData';
import type { CollectionStatus, StockItem, StockListType } from '../../types/models';
import { formatRate, getMarketColor } from '../../utils/format';
import { colors } from '../../styles/tokens';

const tabs: Array<{ value: StockListType; label: string }> = [
  { value: 'watchlist', label: '관심종목' }, { value: 'holding', label: '보유종목' }, { value: 'recommended', label: '추천종목' },
];
const collectionStatusLabel: Record<CollectionStatus, string> = { success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패' };
const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

export function StockListPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StockListType>('holding');
  const [query, setQuery] = useState('');
  const [descending, setDescending] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { data = [], isPending } = useStocks(activeTab);

  const moveTab = (direction: -1 | 1) => {
    const index = tabs.findIndex((tab) => tab.value === activeTab);
    setActiveTab(tabs[(index + direction + tabs.length) % tabs.length].value);
  };
  const handleTouchEnd = (endX: number) => {
    if (touchStartX.current === null) return;
    const distance = endX - touchStartX.current;
    if (Math.abs(distance) >= 56) moveTab(distance < 0 ? 1 : -1);
    touchStartX.current = null;
  };
  const items = useMemo(() => {
    if (showEmpty) return [];
    const keyword = query.trim().toLowerCase();
    return data
      .filter((stock) => !keyword || stock.name.toLowerCase().includes(keyword) || stock.symbol.includes(keyword))
      .sort((a, b) => ((b.marketValue ?? 0) - (a.marketValue ?? 0)) * (descending ? 1 : -1));
  }, [data, descending, query, showEmpty]);
  const totalValue = items.reduce((sum, stock) => sum + (stock.marketValue ?? 0), 0);

  return <Stack spacing="12px">
    <Stack direction="row" sx={{ height: 40, alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography component="h1" sx={{ fontSize: 22, lineHeight: '27px', fontWeight: 700 }}>종목목록</Typography>
      <Stack direction="row" spacing={1}>
        <IconButton aria-label="종목 검색" onClick={() => searchInputRef.current?.focus()} sx={{ width: 36, height: 36, bgcolor: colors.surface, border: `1px solid ${colors.border}` }}><SearchRounded sx={{ fontSize: 19 }} /></IconButton>
        <IconButton aria-label="종목 추가" onClick={() => navigate('/detail/stock-add')} sx={{ width: 36, height: 36, bgcolor: colors.raised }}><AddRounded sx={{ fontSize: 22 }} /></IconButton>
      </Stack>
    </Stack>

    <Card sx={{ p: '4px', border: 0, borderRadius: '12px', bgcolor: colors.surface }}>
      <Tabs value={activeTab} onChange={(_, value: StockListType) => setActiveTab(value)} variant="fullWidth" textColor="inherit" aria-label="종목 목록 구분" sx={{ minHeight: 34, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minHeight: 34, py: 0, borderRadius: '9px', color: colors.textMuted, fontSize: 13, fontWeight: 400 }, '& .Mui-selected': { color: `${colors.textPrimary} !important`, bgcolor: colors.buttonPrimary, fontWeight: 600 } }}>
        {tabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </Tabs>
    </Card>

    <Stack direction="row" spacing={1}>
      <Box sx={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', gap: 1, px: '14px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '12px' }}>
        <SearchRounded sx={{ fontSize: 16, color: colors.textMuted }} />
        <InputBase inputRef={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명·코드 검색" sx={{ flex: 1, fontSize: 13 }} />
      </Box>
      <Button variant="outlined" color="inherit" startIcon={<SwapVertRounded />} onClick={() => setDescending((value) => !value)} sx={{ width: 86, minWidth: 86, minHeight: 40, height: 40, px: 1, borderRadius: '12px', color: colors.textSecondary, fontSize: 12 }}>평가금액</Button>
    </Stack>

    <Stack direction="row" sx={{ height: 26, alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>총 {items.length}개</Typography>
      {activeTab === 'holding' && <Typography sx={{ fontSize: 13, fontWeight: 600, color: colors.marketRise }}>{formatWon(totalValue)}</Typography>}
    </Stack>

    <Box onTouchStart={(event) => { touchStartX.current = event.changedTouches[0].clientX; }} onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX)} sx={{ touchAction: 'pan-y' }}>
      {isPending ? <StockListLoading /> : items.length === 0 ? <EmptyStocks onRestore={() => { setShowEmpty(false); setQuery(''); }} /> : <Grid container spacing="12px">{items.map((stock) => <Grid key={stock.id} size={{ xs: 12, sm: 6 }}><StockCard stock={stock} onClick={() => navigate(`/stocks/${stock.id}`)} /></Grid>)}</Grid>}
    </Box>
    {!isPending && !showEmpty && <Button variant="text" color="inherit" onClick={() => setShowEmpty(true)} sx={{ alignSelf: 'center', color: 'text.secondary', fontSize: 11 }}>빈 목록 상태 미리보기</Button>}
  </Stack>;
}

function StockCard({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  const isHolding = stock.listType === 'holding';
  const quantity = stock.quantity ?? 0;
  const averagePrice = stock.averagePrice ?? 0;
  const investedAmount = quantity * averagePrice;
  const marketValue = stock.marketValue ?? quantity * stock.currentPrice;
  const profitAmount = stock.profitAmount ?? marketValue - investedAmount;
  const profitRate = stock.profitRate ?? (investedAmount ? (profitAmount / investedAmount) * 100 : 0);
  const dailyChange = Math.round(stock.currentPrice * stock.priceChangeRate / 100);

  return <Card sx={{ height: isHolding ? 148 : 116, border: 0, borderRadius: '16px', overflow: 'hidden' }}>
    <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '4px', px: '14px', pt: '12px', pb: '10px !important' }}>
        <Stack direction="row" sx={{ height: 22, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography noWrap sx={{ fontSize: 15, fontWeight: 700 }}>{stock.name}<Box component="span" sx={{ ml: 1, fontSize: 11, fontWeight: 400, color: colors.textMuted }}>{stock.symbol}</Box></Typography>
          <IconButton aria-label="관심종목" onClick={(event) => event.stopPropagation()} sx={{ width: 30, height: 22, p: 0, color: isHolding && ['hyundai', 'samsung'].includes(stock.id) ? colors.warning : colors.textMuted }}>{isHolding && ['hyundai', 'samsung'].includes(stock.id) ? <FavoriteRounded sx={{ fontSize: 20 }} /> : <FavoriteBorderRounded sx={{ fontSize: 20 }} />}</IconButton>
        </Stack>
        <Box sx={{ height: '1px', bgcolor: colors.border }} />
        {isHolding ? <>
          <MetricRow label={<><Box component="span" sx={{ fontSize: 14 }}>보유</Box><Box component="span" sx={{ ml: 2, fontSize: 12.5 }}>{quantity.toLocaleString('ko-KR')} × {formatWon(averagePrice)}</Box></>} value={formatWon(investedAmount)} />
          <MetricRow label={<><Box component="span" sx={{ fontSize: 14 }}>평가</Box><Box component="span" sx={{ ml: 2, fontSize: 12 }}>{quantity.toLocaleString('ko-KR')} × {formatWon(stock.currentPrice)}</Box></>} value={formatWon(marketValue)} color={getMarketColor(stock.priceChangeRate)} />
          <MetricRow label={<><Box component="span">평가손익</Box><Box component="span" sx={{ ml: 2, color: getMarketColor(profitAmount) }}>{formatRate(profitRate)}</Box></>} value={formatWon(profitAmount)} color={getMarketColor(profitAmount)} />
          <Stack direction="row" sx={{ height: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: getMarketColor(stock.priceChangeRate) }}><Typography sx={{ fontSize: 10 }}>{formatWon(dailyChange)}({formatRate(stock.priceChangeRate)})</Typography><EditRounded sx={{ fontSize: 12, color: colors.textMuted }} /></Stack>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.textMuted }}>상세보기 ›</Typography>
          </Stack>
        </> : <>
          <MetricRow label="현재가" value={formatWon(stock.currentPrice)} color={getMarketColor(stock.priceChangeRate)} />
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}><Chip size="small" label={`PER ${stock.per ?? '-'}`} /><Chip size="small" label={`PBR ${stock.pbr ?? '-'}`} /><Chip size="small" label={`ROE ${stock.roe ?? '-'}%`} /></Stack>
        </>}
        <Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ display: 'none' }} />
      </CardContent>
    </CardActionArea>
  </Card>;
}

function MetricRow({ label, value, color = colors.textPrimary }: { label: ReactNode; value: string; color?: string }) {
  return <Stack direction="row" sx={{ height: 20, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}><Typography component="div" noWrap sx={{ minWidth: 0, fontSize: 12, color: colors.textSecondary }}>{label}</Typography><Typography noWrap sx={{ width: 130, textAlign: 'right', fontSize: 12, fontWeight: 600, color }}>{value}</Typography></Stack>;
}

function EmptyStocks({ onRestore }: { onRestore: () => void }) {
  return <Card><CardContent sx={{ py: 5, textAlign: 'center' }}><InboxRounded sx={{ fontSize: 42, color: 'text.secondary' }} /><Typography sx={{ mt: 1, fontWeight: 750 }}>표시할 종목이 없어요.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>종목을 추가하거나 다른 탭을 확인해 주세요.</Typography><Button sx={{ mt: 2 }} onClick={onRestore}>목 데이터 다시 보기</Button></CardContent></Card>;
}

function StockListLoading() {
  return <Grid container spacing="12px">{[1, 2, 3, 4].map((item) => <Grid key={item} size={{ xs: 12, sm: 6 }}><Skeleton variant="rounded" height={148} sx={{ borderRadius: '16px' }} /></Grid>)}</Grid>;
}
