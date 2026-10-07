import { Skeleton } from '@mui/material';
import {useReturnNavigation} from '../../hooks/navigation/usePageMemory';
import { DeleteOutlineRounded, EditRounded, FavoriteBorderRounded, FavoriteRounded } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Snackbar, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useRef, useState, type PointerEventHandler, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { stockItems } from '../../data/mockData';
import { deleteSellTrade, getAvailableLots, getSellTrades, type MockSellTrade } from '../../data/mockSellTrades';
import { colors } from '../../styles/tokens';
import { PageHeader } from '../../components/navigation/Navigation';
import { navigateToForm } from '../../utils/focusForm';
import { useFavoriteStocks } from '../../hooks/useFavoriteStocks';
import type { StockItem, StockListType } from '../../types/models';
import { formatRate, getMarketColor } from '../../utils/format';
import { TabletStockDetail } from './TabletStockDetail';

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
type DetailTab = 'summary' | 'holding' | 'trades';

export function StockDetailPage() {
  const { stockId = 'hyundai' } = useParams(); const navigate = useNavigate(); const back = useReturnNavigation(); const location = useLocation();
  const queryClient = useQueryClient();
  const savedTrade = (location.state as { savedTrade?: string } | null)?.savedTrade;
  const stock = stockItems.find((item) => item.id === stockId) ?? stockItems[0];
  const holding = stock.listType === 'holding';
  const { favoriteIds, toggleFavorite } = useFavoriteStocks();
  const requestedTab = new URLSearchParams(location.search).get('tab');
  const initialTab: DetailTab = holding && (requestedTab === 'summary' || requestedTab === 'trades') ? requestedTab : holding ? 'holding' : 'summary';
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [dialog, setDialog] = useState<'price' | 'category' | 'delete' | null>(null);
  const [deletingTrade, setDeletingTrade] = useState<MockSellTrade | null>(null);
  const [tradeRevision, setTradeRevision] = useState(0);
  const [categoryDraft, setCategoryDraft] = useState<StockListType>(stock.listType);
  const detailStocks = stockItems.filter((item) => item.listType === stock.listType);
  const stockIndex = detailStocks.findIndex((item) => item.id === stock.id);
  const previousStock = detailStocks[(stockIndex - 1 + detailStocks.length) % detailStocks.length];
  const nextStock = detailStocks[(stockIndex + 1) % detailStocks.length];
  const swipeStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const handleSwipeStart: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipeStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handleSwipeEnd: PointerEventHandler<HTMLDivElement> = (event) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== event.pointerId || detailStocks.length < 2) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;

    navigate(`/stocks/${deltaX < 0 ? nextStock.id : previousStock.id}`);
  };
  return <><Stack spacing="12px" onPointerDown={handleSwipeStart} onPointerUp={handleSwipeEnd} onPointerCancel={() => { swipeStart.current = null; }} sx={{ display: holding ? { xs: 'flex', sm: 'none' } : 'flex', pb: 2, touchAction: 'pan-y' }}>
    <StockHeader scope={holding ? "cover" : undefined} name={stock.name} symbol={stock.symbol} previousName={previousStock.name} nextName={nextStock.name} isFavorite={favoriteIds.has(stock.id)} onToggleFavorite={() => toggleFavorite(stock.id)} onBack={back} onPrevious={() => navigate(`/stocks/${previousStock.id}`)} onNext={() => navigate(`/stocks/${nextStock.id}`)} />
    {holding && <><Card sx={{ height: 64, borderRadius: '16px' }}><CardContent sx={{ height: '100%', px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', '&:last-child': { pb: 1 } }}><Box><Typography sx={{ fontSize: 22, fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{won(stock.currentPrice)}</Typography><Typography sx={{ fontSize: 12, color: getMarketColor(stock.priceChangeRate) }}>{won(stock.currentPrice * stock.priceChangeRate / 100)} ({formatRate(stock.priceChangeRate)})</Typography></Box><Button onClick={() => navigateToForm(navigate, `/trade?type=buy&stock=${stock.id}`)} sx={{ minHeight: 32, bgcolor: colors.raised }}>매수 +</Button></CardContent></Card>
    <Tabs value={tab} onChange={(_, value: DetailTab) => setTab(value)} variant="fullWidth" sx={{ minHeight: 40, p: '3px', bgcolor: colors.surface, borderRadius: '14px', '& .MuiTab-root': { minHeight: 34, py: 0, fontSize: 12, borderRadius: '9px' }, '& .MuiTabs-indicator': { display: 'none' }, '& .Mui-selected': { bgcolor: colors.buttonPrimary, color: '#fff !important' } }}><Tab value="summary" label="요약" /><Tab value="holding" label="보유 현황" /><Tab value="trades" label="거래내역" /></Tabs></>}
    {holding ? <HoldingDetail tab={tab} stock={stock} revision={tradeRevision} onEditTrade={(trade) => navigateToForm(navigate, `/trade?type=sell&stock=${stock.id}&lot=${trade.lotId}&edit=${trade.id}`)} onDeleteTrade={setDeletingTrade} onSellLot={(lotId: string) => navigateToForm(navigate, `/trade?type=sell&stock=${stock.id}&lot=${lotId}`)} /> : <InterestDetail stock={stock} onCategory={() => { setCategoryDraft(stock.listType); setDialog('category'); }} onDelete={() => setDialog('delete')} onEdit={() => navigateToForm(navigate, `/stocks/${stock.id}/edit`)} onValue={() => navigate(`/stocks/${stock.id}/value`)} onFinancials={() => navigate(`/stocks/${stock.id}/financials`)} />}
    <SimpleDialog type={dialog} stock={stock} categoryDraft={categoryDraft} onCategoryDraft={setCategoryDraft} onClose={() => setDialog(null)} onCategoryChange={() => { stock.listType = categoryDraft; setDialog(null); }} onDelete={() => { if (!holding) stockItems.splice(stockItems.findIndex((item) => item.id === stock.id), 1); setDialog(null); navigate('/stocks'); }} />
    <Dialog open={Boolean(deletingTrade)} onClose={() => setDeletingTrade(null)} fullWidth maxWidth="xs"><DialogTitle>매도 거래를 삭제할까요?</DialogTitle><DialogContent>삭제하면 연결된 매수 항목의 매도 가능 수량이 {deletingTrade?.quantity}주 복구됩니다.</DialogContent><DialogActions><Button onClick={() => setDeletingTrade(null)}>취소</Button><Button color="error" onClick={() => { if (deletingTrade) { deleteSellTrade(deletingTrade.id); void queryClient.invalidateQueries({ queryKey: ['buyLots', stock.id] }); } setDeletingTrade(null); setTradeRevision((value) => value + 1); }}>삭제</Button></DialogActions></Dialog>
  </Stack>{holding && <Box sx={{ display: { xs: 'none', sm: 'block' } }}><TabletStockDetail stock={stock} initialTab={initialTab} /></Box>}
    <Snackbar open={savedTrade === 'buy' || savedTrade === 'sell'} autoHideDuration={3000} onClose={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert severity="success" variant="filled" onClose={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })}>모의 {savedTrade === 'sell' ? '매도' : '매수'}가 등록됐어요. 실제 데이터는 변경되지 않았습니다.</Alert></Snackbar>
  </>;
}

type StockHeaderProps = {
  scope?: "cover";
  name: string;
  symbol: string;
  previousName: string;
  nextName: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

function StockHeader({ scope, name, symbol, previousName, nextName, isFavorite, onToggleFavorite, onBack, onPrevious, onNext }: StockHeaderProps) {
  return <>
    <PageHeader scope={scope} title={name} subtitle={symbol} onBack={onBack} showBackTablet showAdd={false} embedded action={<IconButton aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={isFavorite} onClick={onToggleFavorite} sx={{ width: 36, height: 36, color: isFavorite ? colors.warning : colors.textMuted }}>{isFavorite ? <FavoriteRounded sx={{ fontSize: 20 }} /> : <FavoriteBorderRounded sx={{ fontSize: 20 }} />}</IconButton>} />
    <Stack direction="row" sx={{ height: 20, alignItems: 'center', justifyContent: 'space-between', mt: '0 !important' }}>
      <Typography component="button" onClick={onPrevious} sx={{ border: 0, p: 0, bgcolor: 'transparent', color: colors.textMuted, fontSize: 10, cursor: 'pointer' }}>{previousName}</Typography>
      <Typography sx={{ fontSize: 10, color: colors.textMuted }}>{symbol}</Typography>
      <Typography component="button" onClick={onNext} sx={{ border: 0, p: 0, bgcolor: 'transparent', color: colors.textMuted, fontSize: 10, cursor: 'pointer' }}>{nextName}</Typography>
    </Stack>
  </>;
}

function HoldingDetail({ tab, stock, revision: _revision, onEditTrade, onDeleteTrade, onSellLot }: { tab: DetailTab; stock: StockItem; revision: number; onEditTrade: (trade: MockSellTrade) => void; onDeleteTrade: (trade: MockSellTrade) => void; onSellLot: (lotId: string) => void }) {
  if (tab === 'trades') return <TradeHistory stockId={stock.id} onEdit={onEditTrade} onDelete={onDeleteTrade} />;
  if (tab === 'summary') return <HoldingSummary />;
  const featuredLots: HoldingLot[] = [
    { lotId: 'lot-hyundai-20260910', date: '2026.09.10', heldDays: 8, quantity: 70, buyPrice: 230_000, expectedPrice: 236_900, profitRate: 3, profitAmount: 483_000, targets: [5, 10, 15] },
    { lotId: 'lot-hyundai-20260722', date: '2026.07.22', heldDays: 58, quantity: 20, buyPrice: 218_500, expectedPrice: 236_854, profitRate: 8.4, profitAmount: 367_080, targets: [10, 15, 20] },
  ];
  const availableLots = getAvailableLots(stock.id);
  const lots = stock.id === 'hyundai' ? featuredLots.filter((lot) => availableLots.some((available) => available.id === lot.lotId && available.remainingQuantity > 0)).map((lot) => {
    const remaining = availableLots.find((available) => available.id === lot.lotId)!.remainingQuantity;
    return { ...lot, quantity: remaining, profitAmount: lot.profitAmount * remaining / lot.quantity };
  }) : availableLots.filter((lot) => lot.remainingQuantity > 0).map((lot): HoldingLot => {
    const profitAmount = lot.remainingQuantity * (stock.currentPrice - lot.buyPrice);
    return { lotId: lot.id, date: lot.tradeDate.replaceAll('-', '.'), heldDays: Math.max(0, Math.floor((Date.now() - new Date(lot.tradeDate).getTime()) / 86_400_000)), quantity: lot.remainingQuantity, buyPrice: lot.buyPrice, expectedPrice: stock.currentPrice, profitRate: (stock.currentPrice / lot.buyPrice - 1) * 100, profitAmount, targets: [5, 10, 15] };
  });
  return <Stack spacing="12px">{lots.length ? lots.map((lot) => <HoldingLotCard key={lot.lotId} lot={lot} onSell={() => onSellLot(lot.lotId)} />) : <Typography sx={{ color: colors.textMuted, fontSize: 13 }}>매도 가능한 매수 항목이 없습니다.</Typography>}</Stack>;
}

function HoldingSummary() {
  return <Stack spacing="12px">
    <SummaryCard title="보유 요약" height={163} rows={[
      { label: '평균단가', rate: '700주', value: '230,000원' },
      { label: '매입금액', value: '161,000,000원' },
      { label: '평가금액', value: '241,500,000원', accent: true },
      { label: '평가손익', rate: '50.0%', value: '80,500,000원', accent: true, strong: true },
    ]} />
    <SummaryCard title="거래 요약" height={188} rows={[
      { label: '매수', value: '244,982,000원' },
      { label: '매도', value: '284,510,000원', accent: true },
      { label: '손익', rate: '16.1%', value: '39,528,000원', accent: true },
      { label: '배당', rate: '1.8%', value: '4,414,860원', accent: true },
      { label: '총계', rate: '17.9%', value: '43,942,860원', accent: true },
    ]} />
  </Stack>;
}

type SummaryRow = { label: string; rate?: string; value: string; accent?: boolean; strong?: boolean };

function SummaryCard({ title, height, rows }: { title: string; height: number; rows: SummaryRow[] }) {
  return <Card sx={{ height, minHeight: height, borderRadius: '16px', borderColor: '#23324A' }}><CardContent sx={{ p: '13px 15px', '&:last-child': { pb: '13px' } }}>
    <Typography sx={{ mb: '7px', fontSize: 15, lineHeight: '22px', fontWeight: 600 }}>{title}</Typography>
    {rows.map((row) => <Stack key={row.label} direction="row" sx={{ height: 26, alignItems: 'center' }}>
      <Typography sx={{ width: 112, fontSize: 12, lineHeight: '22px', color: colors.textMuted }}>{row.label}</Typography>
      <Typography sx={{ width: 56, textAlign: 'right', fontSize: 13, lineHeight: '22px', fontWeight: row.accent ? 600 : 500, color: row.accent ? '#FF6B6B' : colors.textSecondary }}>{row.rate ?? ''}</Typography>
      <Typography sx={{ flex: 1, textAlign: 'right', fontSize: 13, lineHeight: '22px', fontWeight: row.strong ? 600 : 500, color: row.accent ? '#FF6B6B' : colors.textSecondary }}>{row.value}</Typography>
    </Stack>)}
  </CardContent></Card>;
}

type TradeHistoryItem = { profit: number; rate: number; sellDate: string; quantity: number; buyPrice: number; buyDate: string; sellPrice: number; annualRate: number; heldDays: number };

function TradeHistory({ stockId, onEdit, onDelete }: { stockId: string; onEdit: (trade: MockSellTrade) => void; onDelete: (trade: MockSellTrade) => void }) {
  const savedTrades = getSellTrades(stockId).slice().reverse();
  const lots = getAvailableLots(stockId);
  const recordedTrades = savedTrades.map((trade) => {
    const lot = lots.find((item) => item.id === trade.lotId);
    const buyPrice = lot?.buyPrice ?? 0;
    const profit = trade.quantity * (trade.price - buyPrice) - trade.feeTaxAmount;
    const invested = trade.quantity * buyPrice;
    const rate = invested ? profit / invested * 100 : 0;
    const heldDays = lot ? Math.max(0, Math.floor((new Date(trade.tradeDate).getTime() - new Date(lot.tradeDate).getTime()) / 86_400_000)) : 0;
    return { trade, item: { profit, rate, sellDate: trade.tradeDate.replaceAll('-', '.'), quantity: trade.quantity, buyPrice, buyDate: lot?.tradeDate.replaceAll('-', '.') ?? '', sellPrice: trade.price, annualRate: heldDays ? rate * 365 / heldDays : 0, heldDays } };
  });
  const trades: TradeHistoryItem[] = [
    { profit: 275_000, rate: 14.4, sellDate: '2026.08.14', quantity: 5, buyPrice: 381_000, buyDate: '2026.07.28', sellPrice: 436_000, annualRate: 308.8, heldDays: 17 },
    { profit: 185_000, rate: 10, sellDate: '2026.08.05', quantity: 5, buyPrice: 369_000, buyDate: '2026.07.28', sellPrice: 406_000, annualRate: 456.3, heldDays: 8 },
  ];
  return <Stack>
    <Stack direction="row" sx={{ height: 38, px: '14px', alignItems: 'center' }}><Typography sx={{ width: 90, fontSize: 14, fontWeight: 600 }}>2026년</Typography><Typography sx={{ flex: 1, textAlign: 'center', fontSize: 11, color: colors.textMuted }}>{12 + recordedTrades.length}건</Typography><Typography sx={{ width: 144, textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#FF6B6B' }}>{won(11_930_000 + recordedTrades.reduce((sum, { item }) => sum + item.profit, 0))}</Typography></Stack>
    <Stack spacing="8px">{recordedTrades.map(({ trade, item }) => <TradeHistoryCard key={trade.id} trade={item} onEdit={() => onEdit(trade)} onDelete={() => onDelete(trade)} />)}{trades.map((trade) => <TradeHistoryCard key={trade.sellDate} trade={trade} />)}</Stack>
    <Box sx={{ height: 44, minHeight: 44, mt: '8px', borderRadius: '12px', bgcolor: '#0F172A', display: 'grid', placeItems: 'center' }}><Skeleton width="80%" height={24}/></Box>
  </Stack>;
}

function TradeHistoryCard({ trade, onEdit, onDelete }: { trade: TradeHistoryItem; onEdit?: () => void; onDelete?: () => void }) {
  return <Card sx={{ height: 176, minHeight: 176, borderRadius: '16px', borderColor: '#23324A', overflow: 'hidden' }}><CardContent sx={{ p: '11px 15px 8px', '&:last-child': { pb: '8px' } }}>
    <Stack direction="row" sx={{ height: 28, alignItems: 'flex-start', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 15, lineHeight: '22px', fontWeight: 600, color: '#FF6B6B' }}>{won(trade.profit)}　{trade.rate.toFixed(1)}%</Typography><Typography sx={{ fontSize: 12, lineHeight: '20px', fontWeight: 500, color: colors.textMuted }}>{trade.sellDate}</Typography></Stack>
    <Box sx={{ height: '1px', bgcolor: colors.raised }} />
    <TradeLine label="매수" expression={`${trade.quantity} × ${won(trade.buyPrice)}`} date={trade.buyDate} total={won(trade.quantity * trade.buyPrice)} />
    <TradeLine label="매도" expression={`${trade.quantity} × ${won(trade.sellPrice)}`} date={trade.sellDate} total={won(trade.quantity * trade.sellPrice)} accent />
    <Box sx={{ height: '1px', bgcolor: colors.raised, mt: '4px' }} />
    <Stack direction="row" sx={{ height: 35, alignItems: 'center' }}><Typography sx={{ width: 42, fontSize: 12, fontWeight: 600, color: '#FF6B6B' }}>연수익</Typography><Typography sx={{ width: 136, fontSize: 12, fontWeight: 600, color: '#FF6B6B' }}>{trade.annualRate.toFixed(1)}%</Typography><Typography sx={{ flex: 1, fontSize: 9, color: colors.textMuted }}>[1년기준]</Typography><Typography sx={{ width: 76, textAlign: 'right', fontSize: 11, color: colors.textMuted }}>보유일 {trade.heldDays}일</Typography></Stack>
    <Box sx={{ height: '1px', bgcolor: colors.raised }} />
    {(onEdit || onDelete) && <Stack direction="row" spacing="8px" sx={{ height: 32, alignItems: 'center', justifyContent: 'flex-end' }}>{onEdit && <IconButton aria-label="매도 수정" size="small" onClick={onEdit} sx={{ width: 26, height: 26, color: colors.textMuted }}><EditRounded sx={{ fontSize: 17 }} /></IconButton>}{onDelete && <IconButton aria-label="매도 삭제" size="small" onClick={onDelete} sx={{ width: 26, height: 26, color: colors.textMuted }}><DeleteOutlineRounded sx={{ fontSize: 18 }} /></IconButton>}</Stack>}
  </CardContent></Card>;
}

function TradeLine({ label, expression, date, total, accent = false }: { label: string; expression: string; date: string; total: string; accent?: boolean }) { const color = accent ? '#FF6B6B' : colors.textSecondary; return <Stack direction="row" sx={{ height: 23, alignItems: 'center' }}><Typography sx={{ width: 42, fontSize: 12, lineHeight: '19px', fontWeight: 600, color }}>{label}</Typography><Typography sx={{ width: 136, fontSize: 12, lineHeight: '19px', fontWeight: 500, color }}>{expression}</Typography><Typography sx={{ flex: 1, fontSize: 10, lineHeight: '19px', color: accent ? '#FF9A9A' : colors.disabled }}>[{date}]</Typography><Typography sx={{ width: 76, textAlign: 'right', fontSize: 11, lineHeight: '19px', fontWeight: accent ? 600 : 500, color }}>{total}</Typography></Stack>; }

type HoldingLot = { lotId: string; date: string; heldDays: number; quantity: number; buyPrice: number; expectedPrice: number; profitRate: number; profitAmount: number; targets: number[] };

function HoldingLotCard({ lot, onSell }: { lot: HoldingLot; onSell: () => void }) {
  const targetColors = [
    { border: 'rgba(255,107,107,.30)', rate: '#FF9A9A', total: '#E8A3A3' },
    { border: 'rgba(255,107,107,.46)', rate: '#FF7F7F', total: '#F0A0A0' },
    { border: 'rgba(255,107,107,.68)', rate: '#FF5F5F', total: '#FF9A9A' },
  ];
  return <Card component="button" type="button" aria-label={`${lot.date} 매수 Lot 매도`} onClick={onSell} sx={{ width: '100%', minHeight: 208, borderRadius: '16px', borderColor: '#23324A', overflow: 'hidden', textAlign: 'left', color: colors.textPrimary, cursor: 'pointer', '&:focus-visible': { outline: `2px solid ${colors.focus}` } }}><CardContent sx={{ p: '11px 15px 12px', '&:last-child': { pb: '12px' } }}>
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, lineHeight: '20px', fontWeight: 500, color: colors.textMuted }}>{lot.date}</Typography><Typography sx={{ fontSize: 12, lineHeight: '20px', fontWeight: 500, color: colors.textMuted }}>보유 {lot.heldDays}일</Typography></Stack>
    <LotValueRow label="매수" expression={`${lot.quantity} × ${won(lot.buyPrice)}`} total={won(lot.quantity * lot.buyPrice)} />
    <LotValueRow label="예상" expression={`${lot.quantity} × ${won(lot.expectedPrice)}`} total={won(lot.quantity * lot.expectedPrice)} accent />
    <LotValueRow label="손익률" expression={`${lot.profitRate.toFixed(1)}%`} total={won(lot.profitAmount)} accent compact />
    <Box sx={{ height: '1px', bgcolor: colors.raised, mt: '7px' }} />
    <Stack direction="row" sx={{ justifyContent: 'space-between', mt: '5px', mb: '6px' }}><Typography sx={{ fontSize: 12, lineHeight: '19px', fontWeight: 600, color: colors.textSecondary }}>목표수익률</Typography><Typography sx={{ fontSize: 11, lineHeight: '19px', color: colors.disabled }}>단가 · 총액</Typography></Stack>
    <Stack direction="row" spacing="8px" sx={{ alignItems: 'stretch' }}>{lot.targets.map((rate, index) => { const price = lot.buyPrice * (1 + rate / 100); return <Box key={rate} sx={{ flex: 1, minWidth: 0, minHeight: 48, bgcolor: '#0F172A', border: '1px solid', borderColor: targetColors[index].border, borderRadius: '8px', px: '6px', py: '2px', display: 'flex', flexDirection: 'column', '& .MuiTypography-root': { overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' } }}><Typography sx={{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: targetColors[index].rate }}>{rate}%</Typography><Typography sx={{ textAlign: 'right', fontSize: 10, lineHeight: '14px', fontWeight: 500, color: '#FFD1D1' }}>{won(price)}</Typography><Typography sx={{ textAlign: 'right', fontSize: 9, lineHeight: '14px', color: targetColors[index].total }}>{won(price * lot.quantity)}</Typography></Box>; })}</Stack>
  </CardContent></Card>;
}

function LotValueRow({ label, expression, total, accent = false, compact = false }: { label: string; expression: string; total: string; accent?: boolean; compact?: boolean }) { const color = accent ? '#FF6B6B' : colors.textSecondary; return <Stack direction="row" sx={{ alignItems: 'center', height: compact ? 24 : 25 }}><Typography sx={{ width: 42, flexShrink: 0, fontSize: compact ? 11 : 12, lineHeight: compact ? '18px' : '20px', fontWeight: 600, color }}>{label}</Typography><Typography sx={{ flex: 1, minWidth: 0, fontSize: compact ? 11 : 13, lineHeight: compact ? '18px' : '20px', fontWeight: compact || accent ? 600 : 500, color }}>{expression}</Typography><Typography sx={{ width: 140, flexShrink: 0, textAlign: 'right', fontSize: compact ? 11 : 13, lineHeight: compact ? '18px' : '20px', fontWeight: accent ? 600 : 500, color }}>{total}</Typography></Stack>; }

function InterestDetail({ stock, onCategory, onDelete, onEdit, onValue, onFinancials }: any) {
  const accent = getMarketColor(stock.priceChangeRate);
  const category = stock.listType === 'recommended' ? '추천종목' : '관심종목';
  const fundamentals = [['지배순이익','3.16조'],['발행주식수','92,331천주'],['자기주식수','1,245천주'],['자산','85.4조'],['부채','50.6조'],['지배주주자본','34.8조'],['전기 지배주주자본','32.1조'],['주당배당금','5,000원']];
  return <Stack spacing="12px">
    <Card onClick={onValue} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onValue(); }} sx={{ height: 126, borderRadius: '14px', borderColor: '#1F2E47', cursor: 'pointer' }}><CardContent sx={{ p: '11px 15px', '&:last-child': { pb: '11px' } }}><Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: '5px' }}><Typography sx={{ minHeight: 28, display: 'flex', alignItems: 'center', color: colors.textPrimary, fontSize: 11, fontWeight: 700 }}>가치지표 ›</Typography><Button onClick={(event) => { event.stopPropagation(); onCategory(); }} sx={{ width: 126, height: 28, minHeight: 28, px: 1, border: '1px solid #4573B8', borderRadius: '7px', bgcolor: '#1F2B40', color: colors.textPrimary, fontSize: 9 }}>W {(stock.pbr ?? 1).toFixed(2)} · {category} ›</Button></Stack><DetailRow label="현재가" value={won(stock.currentPrice)} color={accent} /><DetailRow label="전일대비" value={`${won(stock.currentPrice * stock.priceChangeRate / 100)} (${formatRate(stock.priceChangeRate)})`} color={accent} /><DetailRow label="주요지표" value={`PER ${stock.per ?? '-'} · PBR ${stock.pbr ?? '-'} · ROE ${stock.roe ?? '-'}%`} color={accent} /></CardContent></Card>
    <Card onClick={onFinancials} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onFinancials(); }} sx={{ height: 216, borderRadius: '14px', borderColor: '#1F2E47', cursor: 'pointer' }}><CardContent sx={{ p: '11px 15px', '&:last-child': { pb: '11px' } }}><Typography sx={{ minHeight: 22, mb: '1px', display: 'flex', alignItems: 'center', color: colors.textPrimary, fontSize: 11, lineHeight: '20px', fontWeight: 700 }}>계산 기초 데이터 ›</Typography>{fundamentals.map(([label,value]) => <DetailRow key={label} label={label} value={value} />)}</CardContent></Card>
    <Card sx={{ height: 36, borderRadius: '10px', borderColor: '#1F2E47' }}><CardContent sx={{ height: '100%', p: '0 15px !important', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 10 }}>메모</Typography><Typography noWrap sx={{ maxWidth: 286, textAlign: 'right', fontSize: 10, fontWeight: 600, color: colors.textSecondary }}>{stock.note ?? '저평가 구간 관찰 · 실적 회복 확인'}</Typography></CardContent></Card>
    <Stack direction="row" spacing="16px"><Button fullWidth onClick={onDelete} sx={{ height: 44, border: '1px solid #8C2B33', borderRadius: '10px', bgcolor: '#40171C', color: '#FA6170', fontSize: 13, fontWeight: 700 }}>삭제</Button><Button fullWidth variant="contained" onClick={onEdit} sx={{ height: 44, borderRadius: '10px', fontSize: 13, fontWeight: 700 }}>수정</Button></Stack>
  </Stack>;
}

function DetailRow({ label, value, color = colors.textPrimary }: { label: string; value: string; color?: string }) { return <Stack direction="row" sx={{ height: 21, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 10, fontWeight: 600, color: '#A3B2C9' }}>{label}</Typography><Typography sx={{ fontSize: 10, fontWeight: 600, color }}>{value}</Typography></Stack>; }

function SimpleDialog({ type, stock, categoryDraft, onCategoryDraft, onClose, onCategoryChange, onDelete }: { type: string | null; stock: any; categoryDraft: StockListType; onCategoryDraft: (value: StockListType) => void; onClose: () => void; onCategoryChange: () => void; onDelete: () => void }) {
  const isHolding = stock.listType === 'holding';
  const category = stock.listType === 'recommended' ? '추천종목' : '관심종목';
  if (type === 'category') { const options: Array<{ value: StockListType; label: string }> = [{ value: 'watchlist', label: '관심종목' }, { value: 'holding', label: '보유종목' }, { value: 'recommended', label: '추천종목' }]; return <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,.68)' } }, paper: { sx: { m: '16px', width: 'calc(100% - 32px)', maxWidth: 368, height: 272, p: '19px', bgcolor: colors.surface, border: '1px solid #25344D', borderRadius: '20px', backgroundImage: 'none' } } }}><Stack><Typography sx={{ fontSize: 18, fontWeight: 700 }}>{stock.name}</Typography><Typography sx={{ mt: '2px', fontSize: 11, color: colors.textMuted }}>{stock.symbol} · 코스피</Typography><Typography sx={{ mt: '20px', fontSize: 12, color: colors.textMuted }}>변경할 분류를 선택하세요.</Typography><Stack direction="row" spacing="12px" sx={{ mt: '16px' }}>{options.map((option) => <Button key={option.value} autoFocus={option.value === 'watchlist'} disabled={option.value === 'holding'} onClick={() => onCategoryDraft(option.value)} sx={{ flex: 1, height: 30, minHeight: 30, px: 0, border: '1px solid #243857', borderRadius: '14px', bgcolor: option.value === categoryDraft ? colors.buttonPrimary : '#0D1524', color: option.value === categoryDraft ? colors.textPrimary : '#8C9EB8', fontSize: 12 }}>{option.label}</Button>)}</Stack><Stack direction="row" spacing="8px" sx={{ mt: '40px' }}><Button fullWidth onClick={onClose} sx={{ height: 44, border: '1px solid #25344D', borderRadius: '10px', color: colors.textPrimary }}>취소</Button><Button fullWidth variant="contained" onClick={onCategoryChange} sx={{ height: 44, borderRadius: '10px' }}>변경</Button></Stack><Typography sx={{ mt: '9px', textAlign: 'center', fontSize: 10, color: colors.textMuted }}>현재 분류: {category} · 종목별 분류는 1개만 유지</Typography></Stack></Dialog>; }
  if (type === 'delete') return <Dialog open onClose={onClose} fullWidth maxWidth={false} slotProps={{ backdrop: { sx: { bgcolor: 'rgba(0,0,0,.68)' } }, paper: { sx: { m: '16px', width: 'calc(100% - 32px)', maxWidth: 368, p: '20px', bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '18px', backgroundImage: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.4)' } } }}><Stack spacing="14px"><Typography sx={{ fontSize: 18, fontWeight: 600 }}>{isHolding ? '거래내역을 삭제할까요?' : `${category}에서 삭제할까요?`}</Typography><Stack spacing="4px"><Typography sx={{ fontSize: 15, fontWeight: 600 }}>{stock.name}</Typography><Typography sx={{ fontSize: 12, color: colors.textSecondary }}>{isHolding ? '2026.08.14 · 매도　　2,180,000원' : `A${stock.symbol} · ${category}`}</Typography></Stack><Typography sx={{ fontSize: 12, color: colors.textSecondary }}>{isHolding ? '삭제한 거래내역은 복구할 수 없어요.' : `삭제한 종목은 ${category} 목록에서 제거돼요.`}</Typography><Stack direction="row" spacing="10px"><Button fullWidth onClick={onClose} sx={{ height: 44, border: `1px solid ${colors.border}`, borderRadius: '12px', bgcolor: colors.surface, color: colors.textSecondary, fontSize: 14, fontWeight: 600 }}>취소</Button><Button fullWidth variant="contained" onClick={onDelete} sx={{ height: 44, borderRadius: '12px', bgcolor: colors.marketRise, fontSize: 14, fontWeight: 600, boxShadow: 'none' }}>삭제</Button></Stack></Stack></Dialog>;
  return null;
}

