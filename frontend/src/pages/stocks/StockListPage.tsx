import { AddRounded, CloseRounded, EditRounded, FavoriteBorderRounded, FavoriteRounded, InboxRounded, SearchRounded, SwapVertRounded } from '@mui/icons-material';
import { Box, Button, Card, CardActionArea, CardContent, Dialog, Grid, IconButton, InputBase, Skeleton, Snackbar, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useStocks } from '../../hooks/useMockData';
import { useFavoriteStocks } from '../../hooks/useFavoriteStocks';
import { PageHeader } from '../../components/navigation/Navigation';
import { stockItems } from '../../data/mockData';
import { liveApiEnabled } from '../../data/liveData';
import type { CollectionStatus, StockItem, StockListType } from '../../types/models';
import { formatRate, getMarketColor } from '../../utils/format';
import { colors } from '../../styles/tokens';
import { navigateToForm } from '../../utils/focusForm';
import { TabletStockTable } from './TabletStockTable';
import { TabletStockMasterDetail } from './TabletStockMasterDetail';
import { updateSecurityPrice } from '../../data/roxstockApi';

const tabs: Array<{ value: StockListType; label: string }> = [
  { value: 'watchlist', label: '관심종목' }, { value: 'holding', label: '보유종목' }, { value: 'recommended', label: '추천종목' },
];
const collectionStatusLabel: Record<CollectionStatus, string> = { success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패' };
const formatWon = (value: number) => Number.isFinite(value) ? `${Math.round(value).toLocaleString('ko-KR')}원` : '—';

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
  const [selectedTabletStockId, setSelectedTabletStockId] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const { data: stockData, isPending, isError, refetch } = useStocks(activeTab);
  const data = stockData ?? [];
  const [apiMessage, setApiMessage] = useState('');
  const { favoriteIds, toggleFavorite } = useFavoriteStocks();

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
      .sort((a, b) => {
        if (activeTab === 'holding') {
          const favoriteOrder = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
          if (favoriteOrder !== 0) return favoriteOrder;
        }
        const aValue = a.marketValue ?? (a.quantity ?? 0) * a.currentPrice;
        const bValue = b.marketValue ?? (b.quantity ?? 0) * b.currentPrice;
        return (bValue - aValue) * (descending ? 1 : -1);
      });
  }, [activeTab, data, descending, favoriteIds, query, showEmpty]);
  const totalValue = items.some((stock) => stock.listType === 'holding' && stock.marketValue === undefined)
    ? Number.NaN : items.reduce((sum, stock) => sum + (stock.marketValue ?? 0), 0);

  return <Stack spacing="12px">
    <PageHeader title="종목목록" subtitle="관심·보유·추천 종목을 한 곳에서 관리합니다" showAdd={false} embedded action={<IconButton aria-label="종목 추가" onClick={() => navigateToForm(navigate, `/stocks/add?type=${activeTab}`)} sx={{ width: 36, height: 36, bgcolor: colors.raised }}><AddRounded sx={{ fontSize: 22 }} /></IconButton>} />

    <Card sx={{ p: { xs: '4px', sm: '5px' }, border: { xs: 0, sm: `1px solid ${colors.borderStrong}` }, borderRadius: { xs: '12px', sm: '14px' }, bgcolor: colors.surface }}>
      <Tabs value={activeTab} onChange={(_, value: StockListType) => { setActiveTab(value); setSearchParams({ tab: value }, { replace: true }); }} variant="fullWidth" textColor="inherit" aria-label="종목 목록 구분" sx={{ minHeight: { xs: 34, sm: 34 }, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minHeight: 34, py: 0, borderRadius: '9px', color: colors.textMuted, fontSize: { xs: 13, sm: 12 }, fontWeight: 400 }, '& .Mui-selected': { color: `${colors.textPrimary} !important`, bgcolor: colors.buttonPrimary, fontWeight: 600 } }}>
        {tabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </Tabs>
    </Card>

    {isError && !stockData && <Button role="alert" onClick={() => void refetch()}>종목 목록을 불러오지 못했습니다. 다시 시도</Button>}
    <Snackbar open={isError && !!stockData} message="최신 시세 조회에 실패했습니다. 이전 값을 표시합니다." />
    {apiMessage && <Box role="alert" sx={{ color: colors.marketRise, fontSize: 12 }}>{apiMessage}</Box>}
    <Stack direction="row" spacing={1} sx={{ display: { xs: 'flex', sm: 'none' } }}>
      <Box sx={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', gap: 1, px: '14px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '12px' }}>
        <SearchRounded sx={{ fontSize: 16, color: colors.textMuted }} />
        <InputBase inputRef={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); searchInputRef.current?.blur(); } }} inputProps={{ enterKeyHint: 'done' }} placeholder="종목명·코드 검색" sx={{ flex: 1, fontSize: 13 }} />
      </Box>
      <Button variant="outlined" color="inherit" startIcon={<SwapVertRounded />} onClick={() => setDescending((value) => !value)} sx={{ width: 86, minWidth: 86, minHeight: 40, height: 40, px: 0, gap: '6px', borderRadius: '12px', borderColor: colors.border, bgcolor: colors.surface, color: colors.textSecondary, fontSize: 12, lineHeight: '15px', whiteSpace: 'nowrap', '& .MuiButton-startIcon': { m: 0 }, '& .MuiSvgIcon-root': { fontSize: 14 }, '&:hover': { borderColor: colors.borderStrong, bgcolor: colors.surface } }}>{activeTab === 'holding' ? '평가금액' : activeTab === 'watchlist' ? '등락률' : '추천순'}</Button>
    </Stack>

    <Stack direction="row" sx={{ display: { xs: 'flex', sm: 'none' }, height: 26, alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>총 {items.length}개</Typography>
      {activeTab === 'holding' ? <Typography sx={{ fontSize: 13, fontWeight: 600, color: colors.marketRise }}>{formatWon(totalValue)}</Typography> : <Typography sx={{ fontSize: 10, fontWeight: 500, color: colors.textMuted }}>{liveApiEnabled ? '서버 시세 기준' : activeTab === 'watchlist' ? '시세 1분 전' : '오늘 업데이트'}</Typography>}
    </Stack>

    <Box sx={{ display: { xs: 'block', sm: 'none' }, touchAction: 'pan-y' }} onTouchStart={(event) => { touchStartX.current = event.changedTouches[0].clientX; }} onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX)}>
      {isPending ? <StockListLoading /> : isError && !stockData ? null : items.length === 0 ? <EmptyStocks onRestore={liveApiEnabled ? undefined : () => { setShowEmpty(false); setQuery(''); }} /> : <Grid container spacing="12px">{items.map((stock) => <Grid key={stock.id} size={{ xs: 12, sm: 6 }}><StockCard stock={stock} isFavorite={favoriteIds.has(stock.id)} onToggleFavorite={() => toggleFavorite(stock.id)} onClick={() => navigate(`/stocks/${stock.id}`)} onEditPrice={() => { flushSync(() => setPriceStock(stock)); priceInputRef.current?.focus({ preventScroll: true }); }} /></Grid>)}</Grid>}
    </Box>
    <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{(!isError || stockData) && (liveApiEnabled && selectedTabletStockId && items.some((stock) => stock.id === selectedTabletStockId) ?
      <TabletStockMasterDetail stocks={items} stock={items.find((stock) => stock.id === selectedTabletStockId)!} favoriteIds={favoriteIds} onSelect={(stock) => setSelectedTabletStockId(stock.id)} onClose={() => setSelectedTabletStockId(null)} /> :
      <TabletStockTable stocks={data} activeTab={activeTab} loading={isPending} favoriteIds={favoriteIds} onSelect={(stock) => liveApiEnabled ? setSelectedTabletStockId(stock.id) : navigate(`/stocks/${stock.id}`)} />)}</Box>
    {!liveApiEnabled && !isPending && !showEmpty && <Button variant="text" color="inherit" onClick={() => setShowEmpty(true)} sx={{ display: { xs: 'inline-flex', sm: 'none' }, alignSelf: 'center', color: 'text.secondary', fontSize: 11 }}>빈 목록 상태 미리보기</Button>}
    {priceStock && <CurrentPriceDialog stock={priceStock} inputRef={priceInputRef} onClose={() => setPriceStock(null)} onSave={async (value) => {
      if (!priceStock) return;
      if (liveApiEnabled) {
        try { await updateSecurityPrice(priceStock.id, String(value)); await queryClient.invalidateQueries({ queryKey: ['stocks'] }); setPriceStock(null); }
        catch (error) { setApiMessage(error instanceof Error ? error.message : '현재가 변경에 실패했습니다.'); }
        return;
      }
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
    }} />}
  </Stack>;
}

function StockCard({ stock, isFavorite, onToggleFavorite, onClick, onEditPrice }: { stock: StockItem; isFavorite: boolean; onToggleFavorite: () => void; onClick: () => void; onEditPrice: () => void }) {
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
          {isHolding ? <IconButton aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={isFavorite} onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }} sx={{ width: 30, height: 22, p: 0, color: isFavorite ? colors.warning : colors.textMuted }}>{isFavorite ? <FavoriteRounded sx={{ fontSize: 20 }} /> : <FavoriteBorderRounded sx={{ fontSize: 20 }} />}</IconButton> : <Box sx={{ minWidth: 48, height: 20, px: 0.75, display: 'grid', placeItems: 'center', border: `1px solid ${colors.warning}88`, borderRadius: '6px', color: colors.warning, fontSize: 10, fontWeight: 600 }}>W {stock.valuationW?.toFixed(2) ?? (liveApiEnabled ? '—' : (stock.pbr ?? 1).toFixed(2))}</Box>}
        </Stack>
        <Box sx={{ height: '1px', bgcolor: colors.border }} />
        {isHolding ? <>
          <MetricRow label={<><Box component="span" sx={{ fontSize: 14 }}>보유</Box><Box component="span" sx={{ ml: 2, fontSize: 12.5 }}>{quantity.toLocaleString('ko-KR')} × {formatWon(averagePrice)}</Box></>} value={formatWon(investedAmount)} />
          <MetricRow label={<><Box component="span" sx={{ fontSize: 14 }}>평가</Box><Box component="span" sx={{ ml: 2, fontSize: 12 }}>{quantity.toLocaleString('ko-KR')} × {stock.priceAvailable === false ? '미수집' : formatWon(stock.currentPrice)}</Box></>} value={formatWon(marketValue)} color={getMarketColor(stock.priceChangeRate)} />
          <MetricRow label={<><Box component="span">평가손익</Box><Box component="span" sx={{ ml: 2, color: getMarketColor(profitAmount) }}>{formatRate(profitRate)}</Box></>} value={formatWon(profitAmount)} color={getMarketColor(profitAmount)} />
          <Stack direction="row" sx={{ height: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack role="button" tabIndex={0} aria-label={`${stock.name} 현재가 수정`} direction="row" spacing={0.75} onClick={(event) => { event.stopPropagation(); onEditPrice(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onEditPrice(); } }} sx={{ alignItems: 'center', color: getMarketColor(stock.priceChangeRate), cursor: 'pointer' }}><Typography sx={{ fontSize: 10 }}>{stock.priceAvailable === false ? '시세 미수집' : stock.priceChangeAvailable === false ? '등락 정보 없음' : `${formatWon(dailyChange)} (${formatRate(stock.priceChangeRate)})`}</Typography><EditRounded sx={{ fontSize: 12, color: colors.textMuted }} /></Stack>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.textMuted }}>상세보기 ›</Typography>
          </Stack>
        </> : <>
          <MetricRow label={<Stack role="button" tabIndex={0} aria-label={`${stock.name} 현재가 수정`} direction="row" spacing={0.75} onClick={(event) => { event.stopPropagation(); onEditPrice(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onEditPrice(); } }} sx={{ alignItems: 'center', cursor: 'pointer' }}><span>현재가</span><EditRounded sx={{ fontSize: 12, color: colors.textMuted }} /></Stack>} value={stock.priceAvailable === false ? '미수집' : formatWon(stock.currentPrice)} color={getMarketColor(stock.priceChangeRate)} />
          <MetricRow label="전일대비" value={stock.priceChangeAvailable === false ? '—' : `${formatWon(dailyChange)} (${formatRate(stock.priceChangeRate)})`} color={getMarketColor(stock.priceChangeRate)} />
          <MetricRow label={`PER ${stock.per ?? '-'} · PBR ${stock.pbr ?? '-'}`} value={`ROE ${stock.roe ?? '-'}%`} color={getMarketColor(stock.roe ?? 0)} />
          <Stack direction="row" sx={{ height: 14, alignItems: 'center', justifyContent: 'space-between' }}><Typography noWrap sx={{ maxWidth: 230, fontSize: 10, color: colors.textMuted }}>{stock.note ?? (liveApiEnabled ? '' : stock.listType === 'recommended' ? '이익 성장 · 현금흐름 우수' : '재평가 구간 관찰')}</Typography><Typography sx={{ fontSize: 10, fontWeight: 600, color: colors.textMuted }}>상세보기 ›</Typography></Stack>
        </>}
        <Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ display: 'none' }} />
      </CardContent>
    </CardActionArea>
  </Card>;
}

export function CurrentPriceDialog({ stock, inputRef, onClose, onSave }: { stock: StockItem | null; inputRef: Ref<HTMLInputElement>; onClose: () => void; onSave: (value: number) => void | Promise<void> }) {
  const [value, setValue] = useState<string | null>(null);
  const currentValue = value ?? String(stock?.currentPrice ?? '');
  const parsedValue = Number(currentValue.replace(/,/g, '')) || 0;
  const previousClose = stock ? stock.currentPrice / (1 + stock.priceChangeRate / 100) : 0;
  const change = parsedValue - previousClose;
  const changeRate = previousClose ? change / previousClose * 100 : 0;
  const marketColor = getMarketColor(change);
  const close = () => { setValue(null); onClose(); };
  const savePrice = () => {
    if (parsedValue <= 0) return;
    onSave(parsedValue);
    setValue(null);
  };

  return <Dialog open={Boolean(stock)} onClose={close} fullWidth maxWidth={false} slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,.58)' } }, paper: { sx: { m: '24px', width: 'calc(100% - 48px)', maxWidth: 352, height: 316, p: '18px', bgcolor: '#0B1322', border: '1px solid #2E4263', borderRadius: '16px', backgroundImage: 'none' } } }}>
    <Stack spacing="14px">
      <Stack direction="row" sx={{ height: 28, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 17, color: '#F0F5FF' }}>{stock?.name}</Typography><IconButton aria-label="닫기" onClick={close} sx={{ width: 28, height: 28, color: '#7A8AA6' }}><CloseRounded sx={{ fontSize: 24 }} /></IconButton></Stack>
      <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#7A8AA6' }}>A{stock?.symbol}</Typography>
      <Stack direction="row" sx={{ height: 22, alignItems: 'flex-start', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7A8AA6' }}>자동 수집 현재가</Typography><Typography sx={{ fontSize: 13, color: getMarketColor(stock?.priceChangeRate ?? 0) }}>{formatWon(stock?.currentPrice ?? 0)}</Typography></Stack>
      <Stack spacing="6px"><Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7A8AA6' }}>변경할 현재가</Typography><Box sx={{ height: 36, display: 'flex', alignItems: 'center', px: '12px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '10px' }}><Typography sx={{ width: 60, fontSize: 12, color: colors.textMuted }}>금액</Typography><InputBase autoFocus inputRef={inputRef} value={parsedValue ? parsedValue.toLocaleString('ko-KR') : ''} onFocus={(event) => event.target.select()} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); savePrice(); } }} inputProps={{ inputMode: 'numeric', enterKeyHint: 'done', 'aria-label': '변경할 현재가' }} sx={{ flex: 1, '& input': { p: 0, textAlign: 'right', fontSize: 14, fontWeight: 600 } }} /><Typography sx={{ ml: 0.5, fontSize: 14, fontWeight: 600 }}>원</Typography><IconButton aria-label="금액 지우기" onClick={() => setValue('')} sx={{ ml: 0.5, width: 20, height: 20, color: '#B8C7DB' }}><CloseRounded sx={{ fontSize: 14 }} /></IconButton></Box></Stack>
      <Stack direction="row" sx={{ height: 22, alignItems: 'flex-start', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 11, fontWeight: 600, color: '#7A8AA6' }}>전일 대비</Typography><Typography sx={{ fontSize: 13, color: marketColor }}>{formatWon(change)}　{formatRate(changeRate)}</Typography></Stack>
      <Stack direction="row" spacing="10px"><Button fullWidth onClick={close} sx={{ height: 40, border: `1px solid ${colors.border}`, borderRadius: '9px', bgcolor: colors.surface, color: colors.textSecondary, fontSize: 13 }}>취소</Button><Button fullWidth variant="contained" disabled={!parsedValue} onClick={savePrice} sx={{ height: 40, borderRadius: '9px', fontSize: 13, boxShadow: 'none' }}>변경</Button></Stack>
    </Stack>
  </Dialog>;
}

function MetricRow({ label, value, color = colors.textPrimary }: { label: ReactNode; value: string; color?: string }) {
  return <Stack direction="row" sx={{ height: 20, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}><Typography component="div" noWrap sx={{ minWidth: 0, fontSize: 12, color: colors.textSecondary }}>{label}</Typography><Typography noWrap sx={{ width: 130, textAlign: 'right', fontSize: 12, fontWeight: 600, color }}>{value}</Typography></Stack>;
}

function EmptyStocks({ onRestore }: { onRestore?: () => void }) {
  return <Card><CardContent sx={{ py: 5, textAlign: 'center' }}><InboxRounded sx={{ fontSize: 42, color: 'text.secondary' }} /><Typography sx={{ mt: 1, fontWeight: 750 }}>표시할 종목이 없어요.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>종목을 추가하거나 다른 탭을 확인해 주세요.</Typography>{onRestore && <Button sx={{ mt: 2 }} onClick={onRestore}>목 데이터 다시 보기</Button>}</CardContent></Card>;
}

function StockListLoading() {
  return <Grid container spacing="12px">{[1, 2, 3, 4].map((item) => <Grid key={item} size={{ xs: 12, sm: 6 }}><Skeleton variant="rounded" height={148} sx={{ borderRadius: '16px' }} /></Grid>)}</Grid>;
}
