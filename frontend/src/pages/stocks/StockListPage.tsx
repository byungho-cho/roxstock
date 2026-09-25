import { AddRounded, CloseRounded, EditRounded, FavoriteBorderRounded, FavoriteRounded, InboxRounded, SearchRounded, SwapVertRounded } from '@mui/icons-material';
import { Box, Button, Card, CardActionArea, CardContent, Dialog, Grid, IconButton, InputBase, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useStocks } from '../../hooks/useMockData';
import { stockItems } from '../../data/mockData';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const requestedTab = searchParams.get('tab');
  const initialTab: StockListType = requestedTab === 'watchlist' || requestedTab === 'recommended' || requestedTab === 'holding' ? requestedTab : 'holding';
  const [activeTab, setActiveTab] = useState<StockListType>(initialTab);
  const [query, setQuery] = useState('');
  const [descending, setDescending] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const [priceStock, setPriceStock] = useState<StockItem | null>(null);
  const touchStartX = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { data = [], isPending } = useStocks(activeTab);

  const moveTab = (direction: -1 | 1) => {
    const index = tabs.findIndex((tab) => tab.value === activeTab);
    const value = tabs[(index + direction + tabs.length) % tabs.length].value;
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
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
        <IconButton aria-label="종목 추가" onClick={() => navigate(`/stocks/add?type=${activeTab}`)} sx={{ width: 36, height: 36, bgcolor: colors.raised }}><AddRounded sx={{ fontSize: 22 }} /></IconButton>
      </Stack>
    </Stack>

    <Card sx={{ p: '4px', border: 0, borderRadius: '12px', bgcolor: colors.surface }}>
      <Tabs value={activeTab} onChange={(_, value: StockListType) => { setActiveTab(value); setSearchParams({ tab: value }, { replace: true }); }} variant="fullWidth" textColor="inherit" aria-label="종목 목록 구분" sx={{ minHeight: 34, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minHeight: 34, py: 0, borderRadius: '9px', color: colors.textMuted, fontSize: 13, fontWeight: 400 }, '& .Mui-selected': { color: `${colors.textPrimary} !important`, bgcolor: colors.buttonPrimary, fontWeight: 600 } }}>
        {tabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </Tabs>
    </Card>

    <Stack direction="row" spacing={1}>
      <Box sx={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', gap: 1, px: '14px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '12px' }}>
        <SearchRounded sx={{ fontSize: 16, color: colors.textMuted }} />
        <InputBase inputRef={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명·코드 검색" sx={{ flex: 1, fontSize: 13 }} />
      </Box>
      <Button variant="outlined" color="inherit" startIcon={<SwapVertRounded />} onClick={() => setDescending((value) => !value)} sx={{ width: 86, minWidth: 86, minHeight: 40, height: 40, px: 0, gap: '6px', borderRadius: '12px', borderColor: colors.border, bgcolor: colors.surface, color: colors.textSecondary, fontSize: 12, lineHeight: '15px', whiteSpace: 'nowrap', '& .MuiButton-startIcon': { m: 0 }, '& .MuiSvgIcon-root': { fontSize: 14 }, '&:hover': { borderColor: colors.borderStrong, bgcolor: colors.surface } }}>{activeTab === 'holding' ? '평가금액' : activeTab === 'watchlist' ? '등락률' : '추천순'}</Button>
    </Stack>

    <Stack direction="row" sx={{ height: 26, alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>총 {items.length}개</Typography>
      {activeTab === 'holding' ? <Typography sx={{ fontSize: 13, fontWeight: 600, color: colors.marketRise }}>{formatWon(totalValue)}</Typography> : <Typography sx={{ fontSize: 10, fontWeight: 500, color: colors.textMuted }}>{activeTab === 'watchlist' ? '시세 1분 전' : '오늘 업데이트'}</Typography>}
    </Stack>

    <Box onTouchStart={(event) => { touchStartX.current = event.changedTouches[0].clientX; }} onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX)} sx={{ touchAction: 'pan-y' }}>
      {isPending ? <StockListLoading /> : items.length === 0 ? <EmptyStocks onRestore={() => { setShowEmpty(false); setQuery(''); }} /> : <Grid container spacing="12px">{items.map((stock) => <Grid key={stock.id} size={{ xs: 12, sm: 6 }}><StockCard stock={stock} onClick={() => navigate(`/stocks/${stock.id}`)} onEditPrice={() => setPriceStock(stock)} /></Grid>)}</Grid>}
    </Box>
    {!isPending && !showEmpty && <Button variant="text" color="inherit" onClick={() => setShowEmpty(true)} sx={{ alignSelf: 'center', color: 'text.secondary', fontSize: 11 }}>빈 목록 상태 미리보기</Button>}
    <CurrentPriceDialog stock={priceStock} onClose={() => setPriceStock(null)} onSave={(value) => {
      if (!priceStock) return;
      const sourceStock = stockItems.find((item) => item.id === priceStock.id);
      if (!sourceStock) return;
      const previousClose = sourceStock.currentPrice / (1 + sourceStock.priceChangeRate / 100);
      sourceStock.currentPrice = value;
      sourceStock.priceChangeRate = previousClose ? ((value - previousClose) / previousClose) * 100 : 0;
      if (sourceStock.quantity !== undefined) {
        sourceStock.marketValue = sourceStock.quantity * value;
        sourceStock.profitAmount = sourceStock.marketValue - sourceStock.quantity * (sourceStock.averagePrice ?? 0);
      }
      void queryClient.invalidateQueries({ queryKey: ['stocks'] });
      setPriceStock(null);
    }} />
  </Stack>;
}

function StockCard({ stock, onClick, onEditPrice }: { stock: StockItem; onClick: () => void; onEditPrice: () => void }) {
  const isHolding = stock.listType === 'holding';
  const quantity = stock.quantity ?? 0;
  const averagePrice = stock.averagePrice ?? 0;
  const investedAmount = quantity * averagePrice;
  const marketValue = stock.marketValue ?? quantity * stock.currentPrice;
  const profitAmount = stock.profitAmount ?? marketValue - investedAmount;
  const profitRate = stock.profitRate ?? (investedAmount ? (profitAmount / investedAmount) * 100 : 0);
  const dailyChange = Math.round(stock.currentPrice * stock.priceChangeRate / 100);

  return <Card sx={{ height: 148, border: 0, borderRadius: '16px', overflow: 'hidden' }}>
    <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '4px', px: '14px', pt: '12px', pb: '10px !important' }}>
        <Stack direction="row" sx={{ height: 22, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography noWrap sx={{ fontSize: 15, fontWeight: 700 }}>{stock.name}<Box component="span" sx={{ ml: 1, fontSize: 11, fontWeight: 400, color: colors.textMuted }}>{stock.symbol}</Box></Typography>
          {isHolding ? <IconButton aria-label="관심종목" onClick={(event) => event.stopPropagation()} sx={{ width: 30, height: 22, p: 0, color: ['hyundai', 'samsung'].includes(stock.id) ? colors.warning : colors.textMuted }}>{['hyundai', 'samsung'].includes(stock.id) ? <FavoriteRounded sx={{ fontSize: 20 }} /> : <FavoriteBorderRounded sx={{ fontSize: 20 }} />}</IconButton> : <Box sx={{ minWidth: 48, height: 20, px: 0.75, display: 'grid', placeItems: 'center', border: `1px solid ${colors.warning}88`, borderRadius: '6px', color: colors.warning, fontSize: 10, fontWeight: 600 }}>W {(stock.pbr ?? 1).toFixed(2)}</Box>}
        </Stack>
        <Box sx={{ height: '1px', bgcolor: colors.border }} />
        {isHolding ? <>
          <MetricRow label={<><Box component="span" sx={{ fontSize: 14 }}>보유</Box><Box component="span" sx={{ ml: 2, fontSize: 12.5 }}>{quantity.toLocaleString('ko-KR')} × {formatWon(averagePrice)}</Box></>} value={formatWon(investedAmount)} />
          <MetricRow label={<><Box component="span" sx={{ fontSize: 14 }}>평가</Box><Box component="span" sx={{ ml: 2, fontSize: 12 }}>{quantity.toLocaleString('ko-KR')} × {formatWon(stock.currentPrice)}</Box></>} value={formatWon(marketValue)} color={getMarketColor(stock.priceChangeRate)} />
          <MetricRow label={<><Box component="span">평가손익</Box><Box component="span" sx={{ ml: 2, color: getMarketColor(profitAmount) }}>{formatRate(profitRate)}</Box></>} value={formatWon(profitAmount)} color={getMarketColor(profitAmount)} />
          <Stack direction="row" sx={{ height: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack role="button" tabIndex={0} aria-label={`${stock.name} 현재가 수정`} direction="row" spacing={0.75} onClick={(event) => { event.stopPropagation(); onEditPrice(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onEditPrice(); } }} sx={{ alignItems: 'center', color: getMarketColor(stock.priceChangeRate), cursor: 'pointer' }}><Typography sx={{ fontSize: 10 }}>{formatWon(dailyChange)}({formatRate(stock.priceChangeRate)})</Typography><EditRounded sx={{ fontSize: 12, color: colors.textMuted }} /></Stack>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.textMuted }}>상세보기 ›</Typography>
          </Stack>
        </> : <>
          <MetricRow label={<Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}><span>현재가</span><EditRounded sx={{ fontSize: 12, color: colors.textMuted }} /></Stack>} value={formatWon(stock.currentPrice)} color={getMarketColor(stock.priceChangeRate)} />
          <MetricRow label="전일대비" value={`${formatWon(dailyChange)} (${formatRate(stock.priceChangeRate)})`} color={getMarketColor(stock.priceChangeRate)} />
          <MetricRow label={`PER ${stock.per ?? '-'} · PBR ${stock.pbr ?? '-'}`} value={`ROE ${stock.roe ?? '-'}%`} color={getMarketColor(stock.roe ?? 0)} />
          <Stack direction="row" sx={{ height: 14, alignItems: 'center', justifyContent: 'space-between' }}><Typography noWrap sx={{ maxWidth: 230, fontSize: 10, color: colors.textMuted }}>{stock.note ?? (stock.listType === 'recommended' ? '이익 성장 · 현금흐름 우수' : '재평가 구간 관찰')}</Typography><Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.textMuted }}>상세보기 ›</Typography></Stack>
        </>}
        <Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ display: 'none' }} />
      </CardContent>
    </CardActionArea>
  </Card>;
}

function CurrentPriceDialog({ stock, onClose, onSave }: { stock: StockItem | null; onClose: () => void; onSave: (value: number) => void }) {
  const [value, setValue] = useState<string | null>(null);
  const currentValue = value ?? String(stock?.currentPrice ?? '');
  const parsedValue = Number(currentValue.replace(/,/g, '')) || 0;
  const previousClose = stock ? stock.currentPrice / (1 + stock.priceChangeRate / 100) : 0;
  const change = parsedValue - previousClose;
  const changeRate = previousClose ? change / previousClose * 100 : 0;
  const marketColor = getMarketColor(change);
  const close = () => { setValue(null); onClose(); };

  return <Dialog open={Boolean(stock)} onClose={close} fullWidth maxWidth={false} slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,.58)' } }, paper: { sx: { m: '24px', width: 'calc(100% - 48px)', maxWidth: 352, height: 316, p: '18px', bgcolor: '#0B1322', border: '1px solid #2E4263', borderRadius: '16px', backgroundImage: 'none' } } }}>
    <Stack spacing="14px">
      <Stack direction="row" sx={{ height: 28, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 17, color: '#F0F5FF' }}>{stock?.name}</Typography><IconButton aria-label="닫기" onClick={close} sx={{ width: 28, height: 28, color: '#7A8AA6' }}><CloseRounded sx={{ fontSize: 24 }} /></IconButton></Stack>
      <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#7A8AA6' }}>A{stock?.symbol}</Typography>
      <Stack direction="row" sx={{ height: 22, alignItems: 'flex-start', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7A8AA6' }}>자동 수집 현재가</Typography><Typography sx={{ fontSize: 13, color: getMarketColor(stock?.priceChangeRate ?? 0) }}>{formatWon(stock?.currentPrice ?? 0)}</Typography></Stack>
      <Stack spacing="6px"><Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7A8AA6' }}>변경할 현재가</Typography><Box sx={{ height: 36, display: 'flex', alignItems: 'center', px: '12px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '10px' }}><Typography sx={{ width: 60, fontSize: 12, color: colors.textMuted }}>금액</Typography><InputBase autoFocus value={parsedValue ? parsedValue.toLocaleString('ko-KR') : ''} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ''))} inputProps={{ inputMode: 'numeric', 'aria-label': '변경할 현재가' }} sx={{ flex: 1, '& input': { p: 0, textAlign: 'right', fontSize: 14, fontWeight: 600 } }} /><Typography sx={{ ml: 0.5, fontSize: 14, fontWeight: 600 }}>원</Typography><IconButton aria-label="금액 지우기" onClick={() => setValue('')} sx={{ ml: 0.5, width: 20, height: 20, color: '#B8C7DB' }}><CloseRounded sx={{ fontSize: 14 }} /></IconButton></Box></Stack>
      <Stack direction="row" sx={{ height: 22, alignItems: 'flex-start', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7A8AA6' }}>전일 대비</Typography><Typography sx={{ fontSize: 13, color: marketColor }}>{formatWon(change)}　{formatRate(changeRate)}</Typography></Stack>
      <Stack direction="row" spacing="10px"><Button fullWidth onClick={close} sx={{ height: 40, border: `1px solid ${colors.border}`, borderRadius: '9px', bgcolor: colors.surface, color: colors.textSecondary, fontSize: 13 }}>취소</Button><Button fullWidth variant="contained" disabled={!parsedValue} onClick={() => { onSave(parsedValue); setValue(null); }} sx={{ height: 40, borderRadius: '9px', fontSize: 13, boxShadow: 'none' }}>변경</Button></Stack>
    </Stack>
  </Dialog>;
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
