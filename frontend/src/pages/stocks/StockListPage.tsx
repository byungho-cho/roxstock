import { ArrowForwardIosRounded, InboxRounded } from '@mui/icons-material';
import { Box, Button, Card, CardActionArea, CardContent, Chip, Grid, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStocks } from '../../hooks/useMockData';
import type { CollectionStatus, StockItem, StockListType } from '../../types/models';
import { formatAmount, formatRate, formatSignedAmount, getMarketColor } from '../../utils/format';

const tabs: Array<{ value: StockListType; label: string }> = [
  { value: 'watchlist', label: '관심' }, { value: 'holding', label: '보유' }, { value: 'recommended', label: '추천' },
];

const collectionStatusLabel: Record<CollectionStatus, string> = {
  success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패',
};

export function StockListPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StockListType>('holding');
  const [showEmpty, setShowEmpty] = useState(false);
  const touchStartX = useRef<number | null>(null);
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

  const items = showEmpty ? [] : data;
  return (
    <Stack spacing={{ xs: 1, sm: 1.25 }}>
      <Card sx={{ p: 0.375, bgcolor: 'rgba(17,24,39,0.72)' }}>
        <Tabs value={activeTab} onChange={(_, value: StockListType) => setActiveTab(value)} variant="fullWidth" textColor="inherit" aria-label="종목 목록 구분" sx={{ minHeight: 36, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minHeight: 36, py: 0, borderRadius: '6px', color: '#94A3B8', fontSize: 13 }, '& .Mui-selected': { color: 'secondary.main', bgcolor: 'rgba(251,191,36,0.10)' } }}>
          {tabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
        </Tabs>
      </Card>

      <Box onTouchStart={(event) => { touchStartX.current = event.changedTouches[0].clientX; }} onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX)} sx={{ touchAction: 'pan-y' }}>
        {isPending ? <StockListLoading /> : items.length === 0 ? <EmptyStocks onRestore={() => setShowEmpty(false)} /> : (
          <Grid container spacing={{ xs: 0.75, sm: 1 }}>
            {items.map((stock) => <Grid key={stock.id} size={{ xs: 12, sm: 6 }}><StockCard stock={stock} onClick={() => navigate(`/stocks/${stock.id}`)} onTrade={() => navigate(`/trade?type=buy&stock=${stock.id}`)} /></Grid>)}
          </Grid>
        )}
      </Box>

      {!isPending && !showEmpty && (
        <Button variant="text" color="inherit" onClick={() => setShowEmpty(true)} sx={{ alignSelf: 'center', color: 'text.secondary' }}>빈 목록 상태 미리보기</Button>
      )}
    </Stack>
  );
}

function StockCard({ stock, onClick, onTrade }: { stock: StockItem; onClick: () => void; onTrade: () => void }) {
  const isHolding = stock.listType === 'holding';
  return (
    <Card sx={{ height: '100%', overflow: 'hidden' }}>
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ p: '10px 12px', '&:last-child': { pb: '10px' } }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.625} sx={{ alignItems: 'center' }}>
                <Typography variant="subtitle1" noWrap sx={{ fontSize: 15, lineHeight: '20px' }}>{stock.name}</Typography>
                <Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `collection.${stock.collectionStatus}` }} />
                <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>{stock.symbol}</Typography>
              </Stack>
            </Box>
            <ArrowForwardIosRounded sx={{ fontSize: 13, color: '#64748B', mt: 0.375 }} />
          </Stack>

          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
            <Typography color="text.secondary" sx={{ fontSize: 11 }}>현재가</Typography>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}><Typography sx={{ fontWeight: 800, fontSize: 15, color: getMarketColor(stock.priceChangeRate), letterSpacing: '-0.025em' }}>{formatAmount(stock.currentPrice)}</Typography><Typography sx={{ color: getMarketColor(stock.priceChangeRate), fontSize: 10, fontWeight: 700 }}>{formatRate(stock.priceChangeRate)}</Typography></Stack>
          </Stack>

          {isHolding ? (
            <Stack spacing={0.25} sx={{ mt: 0.75, pt: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
              <DataLine label={`보유 ${stock.quantity ?? 0}주`} value={formatAmount(stock.marketValue ?? 0)} />
              <DataLine label="평가손익" value={`${formatSignedAmount(stock.profitAmount ?? 0)} · ${formatRate(stock.profitRate ?? 0)}`} color={getMarketColor(stock.profitAmount ?? 0)} />
            </Stack>
          ) : (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Chip size="small" label={`PER ${stock.per ?? '-'}`} /><Chip size="small" label={`PBR ${stock.pbr ?? '-'}`} /><Chip size="small" label={`ROE ${stock.roe ?? '-'}%`} />
            </Stack>
          )}

          {stock.note && <Typography noWrap color="text.secondary" sx={{ mt: 0.5, fontSize: 10 }}>{stock.note}</Typography>}
        </CardContent>
      </CardActionArea>
      <Box sx={{ px: 1.5, pb: 0.75 }}><Button fullWidth size="small" variant="outlined" onClick={(event) => { event.stopPropagation(); onTrade(); }} sx={{ minHeight: 28, height: 28, py: 0, fontSize: 11 }}>매수 등록</Button></Box>
    </Card>
  );
}

function DataLine({ label, value, color = 'text.primary' }: { label: string; value: string; color?: string }) {
  return <Stack direction="row" sx={{ minHeight: 17, justifyContent: 'space-between', alignItems: 'center' }}><Typography color="text.secondary" sx={{ fontSize: 11 }}>{label}</Typography><Typography sx={{ color, fontSize: 11, fontWeight: 700 }}>{value}</Typography></Stack>;
}

function EmptyStocks({ onRestore }: { onRestore: () => void }) {
  return <Card><CardContent sx={{ py: 5, textAlign: 'center' }}><InboxRounded sx={{ fontSize: 42, color: 'text.secondary' }} /><Typography sx={{ mt: 1, fontWeight: 750 }}>표시할 종목이 없어요.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>종목을 추가하거나 다른 탭을 확인해 주세요.</Typography><Button sx={{ mt: 2 }} onClick={onRestore}>목 데이터 다시 보기</Button></CardContent></Card>;
}

function StockListLoading() {
  return <Grid container spacing={0.75}>{[1, 2, 3, 4].map((item) => <Grid key={item} size={{ xs: 12, sm: 6 }}><Skeleton variant="rounded" height={148} /></Grid>)}</Grid>;
}
