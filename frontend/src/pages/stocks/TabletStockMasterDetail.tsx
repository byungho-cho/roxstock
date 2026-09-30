import { ArrowBackRounded, FavoriteRounded } from '@mui/icons-material';
import { Box, Button, Card, CardContent, IconButton, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSecurityAnalysis, getTrades } from '../../data/roxstockApi';
import { useBuyLots } from '../../hooks/useMockData';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { colors } from '../../styles/tokens';
import type { StockItem } from '../../types/models';
import { formatRate, getMarketColor } from '../../utils/format';
import { money } from './LiveStockDetailPage';
import { fetchLiveBuyLots } from '../../data/liveData';

type Section = 'holding' | 'summary' | 'trades' | 'value' | 'financials';

export function TabletStockMasterDetail({ stocks, stock, favoriteIds, onSelect, onClose }: {
  stocks: StockItem[]; stock: StockItem; favoriteIds: Set<string>;
  onSelect: (stock: StockItem) => void; onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { accountId } = useActiveAccount();
  const [section, setSection] = useState<Section>('holding');
  const holding = stock.listType === 'holding';
  const { data: lots, isPending: lotsPending, isError: lotsError, refetch: reloadLots } = useBuyLots(stock.id);
  const trades = useQuery({ queryKey: ['stockTrades', accountId, stock.id], enabled: !!accountId, queryFn: () => getTrades(accountId ?? '', { securityId: stock.id }) });
  const analysis = useQuery({ queryKey: ['securityAnalysis', stock.id], queryFn: () => getSecurityAnalysis(stock.id) });
  useEffect(() => {
    if (!accountId) return;
    const index = stocks.findIndex((item) => item.id === stock.id);
    for (const neighbor of [stocks[index - 1], stocks[index + 1]]) {
      if (!neighbor) continue;
      void queryClient.prefetchQuery({ queryKey: ['securityAnalysis', neighbor.id], queryFn: () => getSecurityAnalysis(neighbor.id), staleTime: 60_000 });
      if (neighbor.listType === 'holding') {
        void queryClient.prefetchQuery({ queryKey: ['buyLots', neighbor.id, 'api', accountId], queryFn: () => fetchLiveBuyLots(neighbor.id, accountId), staleTime: 60_000 });
        void queryClient.prefetchQuery({ queryKey: ['stockTrades', accountId, neighbor.id], queryFn: () => getTrades(accountId, { securityId: neighbor.id }), staleTime: 60_000 });
      }
    }
  }, [accountId, queryClient, stock.id, stocks]);
  const annual = analysis.data?.statements.filter((item) => item.periodType === 'ANNUAL').slice(0, 3) ?? [];
  const value = analysis.data?.valuation;
  const change = stock.priceChangeRate;
  return <Stack direction="row" spacing={1.5} sx={{ height: 'max(225px, calc(100dvh - 212px))', minHeight: 0 }}>
    <Card sx={{ width: '39%', minWidth: 0, bgcolor: colors.surface, borderRadius: 2, overflow: 'hidden' }}>
      <CardContent sx={{ p: '10px 12px !important', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{holding ? '보유종목' : stock.listType === 'watchlist' ? '관심종목' : '추천종목'}</Typography><IconButton size="small" aria-label="표로 돌아가기" onClick={onClose}><ArrowBackRounded sx={{ fontSize: 16 }} /></IconButton></Stack>
        <Stack spacing={0.75} sx={{ overflowY: 'auto', minHeight: 0, pr: 0.5 }}>{stocks.map((item) => <Box key={item.id} component="button" onClick={() => { onSelect(item); setSection(item.listType === 'holding' ? 'holding' : 'summary'); }} sx={{ width: '100%', p: 1, textAlign: 'left', border: `1px solid ${item.id === stock.id ? colors.buttonPrimary : colors.borderStrong}`, borderRadius: 1.5, bgcolor: item.id === stock.id ? colors.raised : 'transparent', color: colors.textPrimary, cursor: 'pointer' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}><Typography noWrap sx={{ fontSize: 12, fontWeight: 700 }}>{favoriteIds.has(item.id) && <FavoriteRounded sx={{ fontSize: 11, color: colors.warning, mr: 0.5 }} />}{item.name}</Typography><Typography sx={{ fontSize: 12, fontWeight: 700, color: getMarketColor(item.priceChangeRate) }}>{money(item.currentPrice)}</Typography></Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: 10, color: colors.textMuted }}>A{item.symbol}</Typography><Typography sx={{ fontSize: 10, color: getMarketColor(item.priceChangeRate) }}>{Number.isFinite(item.priceChangeRate) ? formatRate(item.priceChangeRate) : '—'}</Typography></Stack>
        </Box>)}</Stack>
      </CardContent>
    </Card>
    <Card sx={{ flex: 1, minWidth: 0, bgcolor: colors.surface, borderRadius: 2, overflow: 'hidden' }}>
      <CardContent sx={{ p: '12px 16px !important', height: '100%', overflowY: 'auto' }}>
        <Typography sx={{ fontSize: 10, color: colors.buttonPrimary, mb: 0.5 }}>{holding ? '보유종목 상세' : '종목 상세'}</Typography>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontSize: 18, fontWeight: 700 }}>{stock.name}</Typography><Typography sx={{ fontSize: 18, fontWeight: 700, color: getMarketColor(change) }}>{money(stock.currentPrice)}</Typography></Stack>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: 10, color: colors.textMuted }}>A{stock.symbol}</Typography><Typography sx={{ fontSize: 10, color: getMarketColor(change) }}>{Number.isFinite(change) ? formatRate(change) : '—'}</Typography></Stack>
        <Tabs value={section} onChange={(_, value: Section) => setSection(value)} variant="fullWidth" sx={{ mt: 1, minHeight: 32, '& .MuiTab-root': { minWidth: 0, minHeight: 32, p: 0.5, fontSize: 10 } }}>
          {holding && <Tab value="holding" label="보유현황" />}<Tab value="summary" label="요약" />{holding && <Tab value="trades" label="거래내역" />}<Tab value="value" label="가치분석" /><Tab value="financials" label="재무지표" />
        </Tabs>
        <Box sx={{ mt: 1.5 }}>
          {section === 'holding' && <><Stack direction="row" spacing={1}><Metric label="평가금액" value={money(stock.marketValue)} /><Metric label="평가손익" value={money(stock.profitAmount)} /></Stack><Typography sx={{ mt: 1.5, fontSize: 11, color: colors.textMuted }}>매수 내역</Typography>{lotsPending ? <Skeleton /> : lotsError ? <Button onClick={() => void reloadLots()}>매수 내역 조회 실패 · 다시 시도</Button> : lots?.filter((lot) => lot.remainingQuantity > 0).slice(0, 5).map((lot) => <Line key={lot.id} label={lot.tradeDate} value={`${lot.remainingQuantity}주 × ${money(lot.buyPrice)}`} />)}</>}
          {section === 'summary' && <><Line label="현재가" value={money(stock.currentPrice)} /><Line label="PER / PBR / ROE" value={`${stock.per ?? '—'} / ${stock.pbr ?? '—'} / ${stock.roe ?? '—'}%`} />{holding ? <><Line label="보유수량" value={`${stock.quantity ?? '—'}주`} /><Line label="평균단가" value={money(stock.averagePrice)} /><Line label="평가금액" value={money(stock.marketValue)} /></> : <><Line label="영업이익" value={stock.operatingProfit === undefined ? '—' : `${stock.operatingProfit.toLocaleString('ko-KR')}억`} /><Line label="메모" value={stock.note ?? '—'} /></>}</>}
          {section === 'trades' && (trades.isPending ? <Skeleton /> : trades.isError ? <Button onClick={() => void trades.refetch()}>거래 조회 실패 · 다시 시도</Button> : trades.data?.data.length ? trades.data.data.slice(0, 5).map((trade) => <Line key={`${trade.type}-${trade.id}`} label={`${trade.tradedAt.slice(0, 10)} ${trade.type === 'BUY' ? '매수' : '매도'}`} value={`${trade.quantity}주 × ${money(Number(trade.unitPrice))}`} />) : <Typography sx={{ fontSize: 11, color: colors.textMuted }}>거래내역이 없습니다.</Typography>)}
          {section === 'value' && (analysis.isPending ? <Skeleton /> : analysis.isError ? <Button onClick={() => void analysis.refetch()}>가치분석 조회 실패 · 다시 시도</Button> : <><Line label="BPS" value={value?.bps ? money(Number(value.bps)) : '—'} /><Line label="EPS" value={value?.eps ? money(Number(value.eps)) : '—'} /><Line label="ROE" value={value?.roe ? `${value.roe}%` : '—'} /><Line label="기준일" value={value?.metricDate ?? '—'} /></>)}
          {section === 'financials' && (analysis.isPending ? <Skeleton /> : analysis.isError ? <Button onClick={() => void analysis.refetch()}>재무지표 조회 실패 · 다시 시도</Button> : annual.length ? annual.map((item) => <Box key={item.fiscalYear} sx={{ mb: 1 }}><Typography sx={{ fontSize: 11, fontWeight: 700 }}>{item.fiscalYear}년</Typography><Line label="매출액" value={item.revenue ? money(Number(item.revenue)) : '—'} /><Line label="영업이익" value={item.operatingProfit ? money(Number(item.operatingProfit)) : '—'} /><Line label="순이익" value={item.netIncome ? money(Number(item.netIncome)) : '—'} /></Box>) : <Typography sx={{ fontSize: 11, color: colors.textMuted }}>연간 재무 데이터가 없습니다.</Typography>)}
        </Box>
        <Button size="small" sx={{ mt: 1.5 }} onClick={() => navigate(`/stocks/${stock.id}`)}>전체 상세보기 ›</Button>
      </CardContent>
    </Card>
  </Stack>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Box sx={{ flex: 1, minWidth: 0, p: 1, borderRadius: 1.5, bgcolor: colors.raised }}><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{label}</Typography><Typography sx={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{value}</Typography></Box>;
}
function Line({ label, value }: { label: string; value: string }) {
  return <Stack direction="row" sx={{ py: 0.5, justifyContent: 'space-between', gap: 1, borderBottom: `1px solid ${colors.border}` }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>{label}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right' }}>{value}</Typography></Stack>;
}
