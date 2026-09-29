import { Box, Skeleton, Stack, Typography } from '@mui/material';
import type { StockItem, StockListType } from '../../types/models';
import { colors } from '../../styles/tokens';
import { formatRate, getMarketColor } from '../../utils/format';
import { liveApiEnabled } from '../../data/liveData';

const won = (value: number) => Number.isFinite(value) ? `${Math.round(value).toLocaleString('ko-KR')}원` : '—';
const number = (value: number) => Number.isFinite(value) ? Math.round(value).toLocaleString('ko-KR') : '—';
const holdingColumns = 'minmax(0, 176fr) minmax(0, 42fr) minmax(0, 60fr) minmax(0, 46fr) minmax(0, 42fr) minmax(0, 64fr) minmax(0, 79fr) minmax(0, 80fr) minmax(0, 50fr) minmax(0, 103fr)';
const watchColumns = 'minmax(0, 245fr) minmax(0, 54fr) minmax(0, 78fr) minmax(0, 78fr) minmax(0, 78fr) minmax(0, 52fr) minmax(0, 48fr) minmax(0, 48fr) minmax(0, 57fr)';
const mockW: Record<string, number> = { '005380': 1.35, '005930': 1.2, '000660': 0.92, '000270': 2.3, '035420': 0.8, '012330': 1.9, '006400': 0.76, '051910': 0.88 };

export function TabletStockTable({ stocks, activeTab, loading, favoriteIds, onSelect }: { stocks: StockItem[]; activeTab: StockListType; loading: boolean; favoriteIds: Set<string>; onSelect: (stock: StockItem) => void }) {
  const holding = activeTab === 'holding';
  const heading = holding ? ['종목', '가치지표', '현재가', '등락률', '보유수량', '평균단가', '매입총액', '평가금액', '손익률', '평가손익'] : ['종목', '가치지표', '영업이익', '현재가', '등락금액', '등락률', 'PER', 'PBR', 'ROE'];
  const columns = holding ? holdingColumns : watchColumns;
  return <>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: '4px' }}><Stack direction="row" spacing="8px" sx={{ alignItems: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 11 }}>{holding ? '보유중' : activeTab === 'watchlist' ? '관심종목' : '추천종목'} {stocks.length}</Typography>{holding && <Box role="img" aria-label={stocks.some((stock) => stock.priceAvailable === false) ? '가격 미수집' : '시세 수집 정상'} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: stocks.some((stock) => stock.priceAvailable === false) ? colors.textMuted : colors.positive }} />}</Stack><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>정렬: 기본 · 선택한 열에만 정렬 방향 표시</Typography></Stack>
    <Box sx={{ height: 'max(220px, calc(100dvh - 240px))', px: '16px', pt: '4px', pb: '4px', border: `1px solid ${colors.borderStrong}`, borderRadius: '14px', bgcolor: colors.surface, overflow: 'hidden' }}>
      <Box role="table" aria-label={holding ? '보유종목' : activeTab === 'watchlist' ? '관심종목' : '추천종목'} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box role="row" sx={{ display: 'grid', gridTemplateColumns: columns, height: 35, flexShrink: 0, alignItems: 'center', borderBottom: `1px solid ${colors.borderStrong}` }}>{heading.map((label, index) => <Typography key={label} role="columnheader" noWrap sx={{ textAlign: index === 0 ? 'left' : 'right', fontSize: 8, color: colors.disabled }}>{label}</Typography>)}</Box>
        <Box role="rowgroup" tabIndex={stocks.length > 8 ? 0 : undefined} aria-label="종목 데이터 행" sx={{ minHeight: 0, flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${colors.textMuted} transparent`, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: colors.textMuted, borderRadius: 4 } }}>
        {loading ? Array.from({ length: 8 }, (_, index) => <Skeleton key={index} variant="text" height={33} />) : stocks.map((stock) => <Box key={stock.id} component="button" aria-label={`${stock.name} 상세보기`} onClick={() => onSelect(stock)} sx={{ display: 'grid', gridTemplateColumns: columns, alignItems: 'center', width: '100%', height: 33, p: 0, border: 0, borderBottom: `1px solid ${colors.borderStrong}`, bgcolor: 'transparent', color: colors.textPrimary, cursor: 'pointer', textAlign: 'left', '&:hover, &:focus-visible': { bgcolor: '#182235', outline: 'none' } }}>
          {holding ? <HoldingRow stock={stock} favorite={favoriteIds.has(stock.id)} /> : <WatchRow stock={stock} />}
        </Box>)}
        {!loading && stocks.length === 0 && <Typography sx={{ py: 6, textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>표시할 종목이 없습니다.</Typography>}
        </Box>
      </Box>
    </Box>
  </>;
}

const cell = { fontSize: 9, lineHeight: '15px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

function StockName({ stock, favorite }: { stock: StockItem; favorite?: boolean }) {
  return <Typography component="span" noWrap sx={{ ...cell, textAlign: 'left', fontSize: 10, fontWeight: 600 }}>{favorite ? '★ ' : ''}{stock.name} <Box component="span" sx={{ fontSize: 8, color: colors.disabled, fontWeight: 400 }}>(A{stock.symbol})</Box></Typography>;
}

function WChip({ stock }: { stock: StockItem }) {
  const w = liveApiEnabled ? stock.valuationW : mockW[stock.symbol];
  const color = w === undefined ? colors.textMuted : w >= 1 ? colors.marketRise : colors.marketFall;
  return <Box component="span" sx={{ justifySelf: 'end', width: 38, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}88`, borderRadius: '7px', color, fontSize: 7.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>W{w?.toFixed(2) ?? '—'}</Box>;
}

function HoldingRow({ stock, favorite }: { stock: StockItem; favorite: boolean }) {
  const quantity = stock.quantity ?? 0;
  const bought = quantity * (stock.averagePrice ?? 0);
  const market = stock.marketValue ?? quantity * stock.currentPrice;
  const profit = stock.profitAmount ?? market - bought;
  const profitRate = bought ? profit / bought * 100 : 0;
  return <><StockName stock={stock} favorite={favorite} /><WChip stock={stock} /><Typography component="span" sx={{ ...cell, color: getMarketColor(stock.priceChangeRate), fontWeight: 600 }}>{stock.priceAvailable === false ? '미수집' : number(stock.currentPrice)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(stock.priceChangeRate) }}>{formatRate(stock.priceChangeRate)}</Typography><Typography component="span" sx={cell}>{number(quantity)}</Typography><Typography component="span" sx={cell}>{number(stock.averagePrice ?? 0)}</Typography><Typography component="span" sx={cell}>{number(bought)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(profit), fontWeight: 600 }}>{number(market)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(profit) }}>{formatRate(profitRate)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(profit), fontWeight: 600 }}>{number(profit)}</Typography></>;
}

function WatchRow({ stock }: { stock: StockItem }) {
  const rate = stock.priceChangeRate;
  const change = rate ? stock.currentPrice * rate / (100 + rate) : 0;
  const profitChange = stock.operatingProfit !== undefined && stock.previousOperatingProfit !== undefined ? stock.operatingProfit - stock.previousOperatingProfit : undefined;
  return <><StockName stock={stock} /><WChip stock={stock} /><Typography component="span" title={profitChange === undefined ? '전년 비교 자료 없음' : `전년 대비 ${profitChange >= 0 ? '+' : ''}${number(profitChange)}억`} sx={{ ...cell, color: profitChange === undefined ? colors.textMuted : getMarketColor(profitChange) }}>{stock.operatingProfit === undefined ? "—" : `${stock.operatingProfit < 0 ? "(−) " : ""}${number(Math.abs(stock.operatingProfit))}억`}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(rate), fontWeight: 600 }}>{stock.priceAvailable === false ? '미수집' : won(stock.currentPrice)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(rate) }}>{won(change)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(rate) }}>{formatRate(rate)}</Typography><Typography component="span" sx={cell}>{stock.per?.toFixed(1) ?? '—'}</Typography><Typography component="span" sx={cell}>{stock.pbr?.toFixed(1) ?? '—'}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(stock.roe ?? 0) }}>{stock.roe === undefined ? '—' : `${stock.roe.toFixed(1)}%`}</Typography></>;
}
