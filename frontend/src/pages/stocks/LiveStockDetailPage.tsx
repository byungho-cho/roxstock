import { Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { currentAccountId, getTrades } from '../../data/roxstockApi';
import { useBuyLots, useStocks } from '../../hooks/useMockData';
import { formatWon } from '../../utils/format';
import { colors } from '../../styles/tokens';

/** API-backed data for the existing detail route; design revision can restore richer cards later. */
export function LiveStockDetailPage() {
  const { stockId = '' } = useParams();
  const navigate = useNavigate();
  const { data: stocks, isPending, isError, refetch } = useStocks();
  const { data: lots, isPending: lotsPending, isError: lotsError } = useBuyLots(stockId);
  const trades = useQuery({ queryKey: ['stockTrades', stockId], enabled: Boolean(stockId), queryFn: async () => getTrades(await currentAccountId(), { securityId: stockId }) });
  const stock = stocks?.find((item) => item.id === stockId);
  return <Stack spacing={1.5}>
    <PageHeader embedded showAdd={false} title={stock?.name ?? '종목 상세'} onBack={() => navigate('/stocks')} />
    <Snackbar open={isError && !!stocks} message="최신 시세 조회에 실패했습니다. 이전 값을 표시합니다." />
    {isPending ? <Typography role="status">종목을 불러오는 중입니다.</Typography> :
      isError && !stocks ? <Button role="alert" onClick={() => void refetch()}>종목 조회 실패 · 다시 시도</Button> : !stock ? <Typography role="status">종목을 찾을 수 없습니다.</Typography> : <>
        <AppCard sx={{ p: 2 }}><Typography>{stock.name} · {stock.symbol}</Typography><Typography sx={{ mt: 1, color: colors.textMuted }}>{stock.priceAvailable ? formatWon(stock.currentPrice) : '가격 미수집'}</Typography>
          {stock.listType === 'holding' && <Typography>잔여수량 {stock.quantity}주 · 평가금액 {formatWon(stock.marketValue ?? Number.NaN)}</Typography>}
          <Button onClick={() => navigate(`/trade?type=buy&stock=${stock.id}`)}>매수</Button>
        </AppCard>
        {stock.listType === 'holding' && <AppCard sx={{ p: 2 }}><Typography sx={{ fontWeight: 700 }}>매수 Lot</Typography>
          {lotsPending ? <Typography role="status">Lot 조회 중</Typography> : lotsError ? <Typography role="alert">Lot 조회에 실패했습니다.</Typography> :
            lots?.length ? lots.map((lot) => <Stack key={lot.id} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 1 }}><Typography>{lot.tradeDate} · {lot.remainingQuantity}주 · {formatWon(lot.buyPrice)}</Typography><Button onClick={() => navigate(`/trade?type=sell&stock=${stock.id}&lot=${lot.id}`)}>매도</Button></Stack>) : <Typography>매도 가능한 Lot이 없습니다.</Typography>}
        </AppCard>}
        <AppCard sx={{ p: 2 }}><Typography sx={{ fontWeight: 700 }}>거래내역</Typography>
          {trades.isPending ? <Typography role="status">거래 조회 중</Typography> : trades.isError ? <Typography role="alert">거래 조회에 실패했습니다.</Typography> :
            trades.data?.data.length ? trades.data.data.map((entry) => <Box key={`${entry.type}-${entry.id}`} sx={{ mt: 1 }}><Typography>{entry.type === 'BUY' ? '매수' : '매도'} · {new Date(entry.tradedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })} · {entry.quantity}주 × {formatWon(Number(entry.unitPrice))}</Typography></Box>) : <Typography>거래내역이 없습니다.</Typography>}
        </AppCard>
      </>}
  </Stack>;
}
