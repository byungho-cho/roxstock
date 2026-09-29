import { FavoriteBorderRounded, FavoriteRounded } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { useFavoriteStocks } from '../../hooks/useFavoriteStocks';
import { deleteWatchlistItem, getSecurityAnalysis, getTrades, updateSecurityPrice, updateWatchlistItem } from '../../data/roxstockApi';
import { useBuyLots, useStocks } from '../../hooks/useMockData';
import { formatRate, formatWon, getMarketColor } from '../../utils/format';
import { colors } from '../../styles/tokens';
import { CurrentPriceDialog } from './StockListPage';
import { useActiveAccount } from '../../hooks/useActiveAccount';

export const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : formatWon(value);
export function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return <Card sx={{ borderRadius: 2 }}><CardContent sx={{ p: '14px 16px !important' }}><Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>{title}</Typography>{children}</CardContent></Card>;
}
export function DetailRow({ label, value }: { label: string; value: string }) {
  return <Stack direction="row" sx={{ minHeight: 25, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}><Typography sx={{ fontSize: 12, color: colors.textMuted }}>{label}</Typography><Typography sx={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{value}</Typography></Stack>;
}

export function LiveStockDetailPage() {
  const { stockId = '' } = useParams();
  const { accountId } = useActiveAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { favoriteIds, toggleFavorite } = useFavoriteStocks();
  const { data: stocks, isPending, isError, refetch } = useStocks();
  const { data: lots, isPending: lotsPending, isError: lotsError } = useBuyLots(stockId);
  const analysis = useQuery({ queryKey: ['securityAnalysis', stockId], enabled: Boolean(stockId), queryFn: () => getSecurityAnalysis(stockId) });
  const trades = useQuery({ queryKey: ['stockTrades', accountId, stockId], enabled: Boolean(stockId && accountId), queryFn: () => getTrades(accountId ?? '', { securityId: stockId }) });
  const stock = stocks?.find((item) => item.id === stockId);
  const [tab, setTab] = useState<'summary' | 'holding' | 'trades'>('holding');
  const [dialog, setDialog] = useState<'category' | 'delete' | null>(null);
  const [category, setCategory] = useState<'WATCHLIST' | 'RECOMMENDED'>('WATCHLIST');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const updateList = async () => {
    if (!stock?.watchlistItemId) return;
    setBusy(true);
    try {
      if (dialog === 'delete') await deleteWatchlistItem(stock.watchlistItemId);
      else await updateWatchlistItem(stock.watchlistItemId, { listType: category });
      await queryClient.invalidateQueries({ queryKey: ['stocks'] });
      navigate(`/stocks?tab=${dialog === 'delete' ? 'watchlist' : category === 'WATCHLIST' ? 'watchlist' : 'recommended'}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '변경에 실패했습니다.'); }
    finally { setBusy(false); setDialog(null); }
  };
  return <Stack spacing="12px" sx={{ pb: 2 }}>
    <PageHeader embedded showAdd={false} title={stock?.name ?? '종목 상세'} subtitle={stock?.symbol} onBack={() => navigate('/stocks')} action={stock && <IconButton aria-label="즐겨찾기" onClick={() => toggleFavorite(stock.id)} sx={{ color: favoriteIds.has(stock.id) ? colors.warning : colors.textMuted }}>{favoriteIds.has(stock.id) ? <FavoriteRounded /> : <FavoriteBorderRounded />}</IconButton>} />
    {isPending ? <><Card><CardContent><Skeleton width="45%" /><Skeleton width="75%" height={40} /></CardContent></Card><Card><CardContent><Skeleton width="35%" /><Skeleton /><Skeleton /></CardContent></Card></> : isError && !stocks ? <DetailCard title="종목 정보"><Button role="alert" onClick={() => void refetch()}>종목 조회 실패 · 다시 시도</Button></DetailCard> : !stock ? <DetailCard title="종목 정보"><Typography role="status">종목을 찾을 수 없습니다.</Typography></DetailCard> : <>
      {error && <Typography role="alert" color="error">{error}</Typography>}
      {stock.listType === 'holding' ? <>
        <Card><CardContent sx={{ p: '12px 16px !important', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography sx={{ fontSize: 22, fontWeight: 700, color: getMarketColor(stock.priceChangeRate) }}>{money(stock.currentPrice)}</Typography><Typography sx={{ fontSize: 12, color: getMarketColor(stock.priceChangeRate) }}>{Number.isFinite(stock.priceChangeRate) ? formatRate(stock.priceChangeRate) : '등락 정보 없음'}</Typography></Box><Stack direction="row"><Button size="small" onClick={() => setPriceOpen(true)}>현재가 수정</Button><Button onClick={() => navigate(`/trade?type=buy&stock=${stock.id}`)}>매수 +</Button></Stack></CardContent></Card>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth" sx={{ bgcolor: colors.surface, borderRadius: 2, '& .MuiTab-root': { minHeight: 36, fontSize: 12 } }}><Tab value="summary" label="요약" /><Tab value="holding" label="보유 현황" /><Tab value="trades" label="거래내역" /></Tabs>
        {tab === 'summary' && <Stack spacing={1}><DetailCard title="보유 요약"><DetailRow label="보유수량" value={`${stock.quantity?.toLocaleString('ko-KR') ?? '—'}주`} /><DetailRow label="평균단가" value={money(stock.averagePrice)} /><DetailRow label="매입금액" value={money((stock.quantity ?? 0) * (stock.averagePrice ?? 0))} /><DetailRow label="평가금액" value={money(stock.marketValue)} /><DetailRow label="평가손익" value={money(stock.profitAmount)} /></DetailCard><DetailCard title="거래 요약"><DetailRow label="매수" value={money(trades.data ? Number(trades.data.summary.buyAmount) : null)} /><DetailRow label="매도" value={money(trades.data ? Number(trades.data.summary.sellAmount) : null)} /><DetailRow label="실현손익" value={money(trades.data ? Number(trades.data.summary.realizedProfitLoss) : null)} /></DetailCard></Stack>}
        {tab === 'holding' && (lotsPending ? <DetailCard title="매수 내역"><Skeleton /><Skeleton /></DetailCard> : lotsError ? <DetailCard title="매수 내역"><Typography role="alert">매수 내역 조회에 실패했습니다.</Typography></DetailCard> : lots?.some((lot) => lot.remainingQuantity > 0) ? <Stack spacing={1}>{lots.filter((lot) => lot.remainingQuantity > 0).map((lot) => {
          const invested = lot.remainingQuantity * lot.buyPrice;
          const profit = lot.remainingQuantity * (stock.currentPrice - lot.buyPrice);
          return <DetailCard key={lot.id} title={lot.tradeDate}><DetailRow label="매수" value={`${lot.remainingQuantity}주 × ${money(lot.buyPrice)}`} /><DetailRow label="매입금액" value={money(invested)} /><DetailRow label="평가금액" value={money(lot.remainingQuantity * stock.currentPrice)} /><DetailRow label="손익률" value={invested ? formatRate(profit / invested * 100) : '—'} /><Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button size="small" onClick={() => navigate(`/trade?type=sell&stock=${stock.id}&lot=${lot.id}`)}>매도</Button><Button size="small" onClick={() => navigate(`/trade?type=buy&stock=${stock.id}&edit=${lot.id}`)}>매수 수정</Button></Stack></DetailCard>;
        })}</Stack> : <Typography>보유 중인 매수 항목이 없습니다.</Typography>)}
        {tab === 'trades' && (trades.isPending ? <DetailCard title="거래내역"><Skeleton /><Skeleton /></DetailCard> : trades.isError ? <DetailCard title="거래내역"><Button onClick={() => void trades.refetch()}>거래 조회 실패 · 다시 시도</Button></DetailCard> : trades.data?.data.length ? <Stack spacing={1}>{trades.data.data.map((entry) => <DetailCard key={`${entry.type}-${entry.id}`} title={`${entry.type === 'BUY' ? '매수' : '매도'} · ${entry.tradedAt.slice(0, 10)}`}><DetailRow label="수량 · 단가" value={`${entry.quantity}주 × ${money(Number(entry.unitPrice))}`} /><DetailRow label="거래금액" value={money(Number(entry.amount))} /><DetailRow label="실현손익" value={entry.realizedProfitLoss === null ? '—' : money(Number(entry.realizedProfitLoss))} /><Button size="small" onClick={() => navigate(`/trade?${new URLSearchParams({ type: entry.type.toLowerCase(), stock: stock.id, edit: entry.id, ...(entry.type === 'SELL' ? { lot: entry.buyTradeId } : {}) })}`)}>상세·수정·삭제</Button></DetailCard>)}</Stack> : <Typography>거래내역이 없습니다.</Typography>)}
      </> : <>
        <DetailCard title="가치지표"><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Button size="small" onClick={() => { setCategory(stock.listType === 'recommended' ? 'RECOMMENDED' : 'WATCHLIST'); setDialog('category'); }}>{stock.listType === 'recommended' ? '추천종목' : '관심종목'} ›</Button><Button size="small" onClick={() => setPriceOpen(true)}>현재가 수정</Button></Stack><DetailRow label="현재가" value={money(stock.currentPrice)} /><DetailRow label="전일대비" value={Number.isFinite(stock.priceChangeRate) ? formatRate(stock.priceChangeRate) : '—'} /><DetailRow label="주요지표" value={`PER ${stock.per ?? '—'} · PBR ${stock.pbr ?? '—'} · ROE ${stock.roe ?? '—'}%`} /></DetailCard>
        <DetailCard title="계산 기초 데이터">{analysis.isPending ? <Typography>재무 데이터를 불러오는 중입니다.</Typography> : analysis.isError ? <Button onClick={() => void analysis.refetch()}>데이터 조회 실패 · 다시 시도</Button> : <><DetailRow label="EPS" value={money(analysis.data?.valuation?.eps ? Number(analysis.data.valuation.eps) : null)} /><DetailRow label="BPS" value={money(analysis.data?.valuation?.bps ? Number(analysis.data.valuation.bps) : null)} /><DetailRow label="주당배당금" value={money(analysis.data?.valuation?.dividendPerShare ? Number(analysis.data.valuation.dividendPerShare) : null)} /><DetailRow label="최근 영업이익" value={money(analysis.data?.statements.find((item) => item.periodType === 'ANNUAL')?.operatingProfit ? Number(analysis.data.statements.find((item) => item.periodType === 'ANNUAL')!.operatingProfit) : null)} /></>}</DetailCard>
        {stock.note && <DetailCard title="메모"><Typography sx={{ fontSize: 12 }}>{stock.note}</Typography></DetailCard>}
        <Stack direction="row" spacing={1}><Button fullWidth color="error" onClick={() => setDialog('delete')}>삭제</Button><Button fullWidth variant="contained" onClick={() => navigate(`/stocks/${stock.id}/edit`)}>정보 수정</Button></Stack>
      </>}
      <Stack direction="row" spacing={1}><Button fullWidth variant="outlined" onClick={() => navigate(`/stocks/${stock.id}/value`)}>가치분석</Button><Button fullWidth variant="outlined" onClick={() => navigate(`/stocks/${stock.id}/financials`)}>재무지표</Button></Stack>
      <Dialog open={dialog !== null} onClose={() => setDialog(null)} fullWidth maxWidth="xs"><DialogTitle>{dialog === 'delete' ? '종목을 삭제할까요?' : '종목 분류 변경'}</DialogTitle><DialogContent>{dialog === 'delete' ? '목록에서 이 종목이 삭제됩니다.' : <Stack spacing={1}><Button variant={category === 'WATCHLIST' ? 'contained' : 'outlined'} onClick={() => setCategory('WATCHLIST')}>관심종목</Button><Button variant={category === 'RECOMMENDED' ? 'contained' : 'outlined'} onClick={() => setCategory('RECOMMENDED')}>추천종목</Button></Stack>}</DialogContent><DialogActions><Button onClick={() => setDialog(null)}>취소</Button><Button disabled={busy} color={dialog === 'delete' ? 'error' : 'primary'} onClick={() => void updateList()}>확인</Button></DialogActions></Dialog>
      <CurrentPriceDialog stock={priceOpen ? stock : null} inputRef={priceInputRef} onClose={() => setPriceOpen(false)} onSave={async (value) => {
        try {
          await updateSecurityPrice(stock.id, String(value));
          await Promise.all([queryClient.invalidateQueries({ queryKey: ['stocks'] }), queryClient.invalidateQueries({ queryKey: ['securityAnalysis', stock.id] })]);
          setPriceOpen(false);
        } catch (cause) { setError(cause instanceof Error ? cause.message : '현재가 변경에 실패했습니다.'); }
      }} />
    </>}
  </Stack>;
}
