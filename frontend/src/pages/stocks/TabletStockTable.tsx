import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { useRef, type ReactNode } from 'react';
import { useCardNavigation } from '../../hooks/useCardNavigation';
import type { StockItem, StockListType } from '../../types/models';
import { colors } from '../../styles/tokens';
import { formatRate, getMarketColor } from '../../utils/format';
import {OverlayRegionScrollbar} from '../../components/navigation/OverlayRegionScrollbar';
import {stockValuation,dayChange} from './stockMath';
import { liveApiEnabled } from '../../data/liveData';

const won = (value: number) => Number.isFinite(value) ? `${Math.round(value).toLocaleString('ko-KR')}원` : '—';
const number = (value: number) => Number.isFinite(value) ? Math.round(value).toLocaleString('ko-KR') : '—';
const holdingColumns = 'minmax(0, 147fr) minmax(0, 48.3fr) minmax(0, 63fr) minmax(0, 44.1fr) minmax(0, 44.1fr) minmax(0, 63fr) minmax(0, 77.7fr) minmax(0, 79.8fr) minmax(0, 48.3fr) minmax(0, 77.7fr)';
const watchColumns = 'minmax(0, 245fr) minmax(0, 54fr) minmax(0, 78fr) minmax(0, 78fr) minmax(0, 78fr) minmax(0, 52fr) minmax(0, 48fr) minmax(0, 48fr) minmax(0, 57fr)';
const mockW: Record<string, number> = { '005380': 1.35, '005930': 1.2, '000660': 0.92, '000270': 2.3, '035420': 0.8, '012330': 1.9, '006400': 0.76, '051910': 0.88 };

export function TabletStockTable({ stocks, activeTab, loading, error=false, favoriteIds, onSelect, onValue, onFavorite }: { stocks: StockItem[]; activeTab: StockListType; loading: boolean; error?: boolean; favoriteIds: Set<string>; onSelect: (stock: StockItem) => void; onValue?: (stock: StockItem) => void; onFavorite?: (stock: StockItem) => void }) {
  const rowsRef=useRef<HTMLDivElement>(null);
  const holding = activeTab === 'holding';
  const traded = activeTab === 'traded';
  const heading = traded ? ['종목','마지막 매도일','누적 실현손익'] : holding ? ['종목', '가치지표', '현재가', '등락률', '보유수량', '평균단가', '매입총액', '평가금액', '손익률', '평가손익'] : ['종목', '가치지표', '영업이익', '현재가', '등락금액', '등락률', 'PER', 'PBR', 'ROE'];
  const columns = traded ? '2fr 1fr 1fr' : holding ? holdingColumns : watchColumns;
  return <>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: '4px' }}><Stack direction="row" spacing="8px" sx={{ alignItems: 'center' }}><Typography sx={{ color: colors.textMuted, fontSize: 11 }}>{holding ? '보유중' : traded ? '거래종목' : '관심종목'} {stocks.length}</Typography>{<Box role="img" aria-label={stocks.some((stock) => stock.priceAvailable === false) ? '가격 미수집' : '시세 수집 정상'} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: stocks.some((stock) => stock.priceAvailable === false) ? colors.textMuted : colors.positive }} />}</Stack><Typography sx={{ color: colors.textMuted, fontSize: 10 }}>서버 시세 기준</Typography></Stack>
    <Box sx={{ flex: 1, minHeight: 0, px: '8px', pt: '4px', pb: '4px', border: `1px solid ${colors.borderStrong}`, borderRadius: '8px', bgcolor: colors.surface, overflow: 'hidden' }}>
      <Box role="table" aria-label={holding ? '보유종목' : traded ? '거래종목' : '관심종목'} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box role="row" sx={{ display: 'grid', gridTemplateColumns: columns, height: 28, flexShrink: 0, alignItems: 'center', borderBottom: `1px solid ${colors.borderStrong}` }}>{heading.map((label, index) => <Typography key={label} role="columnheader" noWrap sx={{ textAlign: index === 0 ? 'left' : 'right', fontSize: 8, color: colors.disabled }}>{label}</Typography>)}</Box>
        <Box ref={rowsRef} data-scroll-region="stock-table" role="rowgroup" tabIndex={stocks.length > 8 ? 0 : undefined} aria-label="종목 데이터 행" sx={{ minHeight: 0, flex: 1, pb:'80px', overflowY: 'auto', scrollbarWidth: 'none', scrollbarColor: `${colors.textMuted} transparent`, '&::-webkit-scrollbar': { display: 'none' }, '&::-webkit-scrollbar-thumb': { bgcolor: colors.textMuted, borderRadius: 4 } }}>
        {loading ? Array.from({ length: 8 }, (_, index) => <Skeleton key={index} variant="text" height={33} />) : stocks.map((stock) => <StockTableRow key={stock.id} stock={stock} columns={columns} favorite={favoriteIds.has(stock.id)} onSelect={onSelect}>
          {traded ? <><StockName stock={stock} favorite={favoriteIds.has(stock.id)} onValue={onValue} onFavorite={onFavorite}/><Typography sx={cell}>{stock.lastSoldAt?new Date(stock.lastSoldAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}):'—'}</Typography><Typography sx={{...cell,color:getMarketColor(stock.realizedProfit??Number.NaN)}}>{won(stock.realizedProfit??Number.NaN)}</Typography></> : holding ? <HoldingRow stock={stock} favorite={favoriteIds.has(stock.id)} onValue={onValue} onFavorite={onFavorite}/> : <WatchRow stock={stock} favorite={favoriteIds.has(stock.id)} onValue={onValue} onFavorite={onFavorite}/>}
        </StockTableRow>)}
        {!loading && !error && stocks.length === 0 && <Typography sx={{ py: 6, textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>내용이 없습니다.</Typography>}
        </Box>
      </Box>
      <OverlayRegionScrollbar scrollRef={rowsRef} label="종목 데이터 행 스크롤" offset={12}/>
    </Box>
  </>;
}

function StockTableRow({stock,columns,favorite,onSelect,children}:{stock:StockItem;columns:string;favorite:boolean;onSelect:(stock:StockItem)=>void;children:ReactNode}) {
 const navigation=useCardNavigation(()=>onSelect(stock));
 return <Box role="row" aria-label={`${stock.name} 상세보기`} data-scroll-item={stock.id} tabIndex={0} {...navigation} sx={{display:'grid',gridTemplateColumns:columns,alignItems:'center',width:'100%',height:28,p:0,border:'1px solid '+(favorite?colors.warning:'transparent'),borderBottomColor:favorite?colors.warning:'transparent',bgcolor:'transparent',color:colors.textPrimary,cursor:'pointer',textAlign:'left','&:hover, &:focus-visible':{bgcolor:'#182235',outline:'none'}}}>{children}</Box>;
}

const cell = { fontSize: 9, lineHeight: '15px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

function StockName({ stock, favorite, onValue, onFavorite }: { stock: StockItem; favorite?: boolean; onValue?: (s: StockItem)=>void; onFavorite?: (s: StockItem)=>void }) {
  return <Stack direction="row" sx={{minWidth:0,alignItems:'center'}}>{onFavorite&&<Button aria-label={`${stock.name} 즐겨찾기`} onClick={e=>{e.stopPropagation();onFavorite(stock);}} sx={{p:0,minWidth:12,fontSize:10,color:favorite?colors.warning:colors.textMuted}}>{favorite?'♥':'♡'}</Button>}<Button aria-label={`${stock.name} 가치지표`} onClick={e=>{e.stopPropagation();onValue?.(stock);}} sx={{p:0,minWidth:0,justifyContent:'flex-start',fontSize:10,color:colors.textPrimary,textAlign:'left',overflow:'hidden',whiteSpace:'nowrap'}}>{stock.name}<Box component="span" sx={{fontSize:8,color:colors.textMuted}}> (A{stock.symbol})</Box></Button></Stack>;
}

function WChip({ stock }: { stock: StockItem }) {
  const w = liveApiEnabled ? stock.valuationW : mockW[stock.symbol];
  const color = w === undefined || !Number.isFinite(w) ? colors.textMuted : w > 1 ? colors.marketRise : colors.marketFall;
  if(w===undefined||!Number.isFinite(w))return <Typography sx={{...cell,color:colors.textMuted}}>—</Typography>;
  return <Box component="span" sx={{ justifySelf: 'end', width: 38, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}88`, borderRadius: '7px', color, fontSize: 7.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>W{w?.toFixed(2) ?? '—'}</Box>;
}

function HoldingRow({ stock, favorite, onValue, onFavorite }: { stock: StockItem; favorite: boolean; onValue?: (s: StockItem)=>void; onFavorite?: (s: StockItem)=>void }) {
  const {quantity,purchase:bought,amount:market,profit,rate:profitRate}=stockValuation(stock);
  return <><StockName stock={stock} favorite={favorite} onValue={onValue} onFavorite={onFavorite}/><WChip stock={stock} /><Typography component="span" sx={{ ...cell, color: getMarketColor(stock.priceChangeRate), fontWeight: 600 }}>{stock.priceAvailable === false ? '—' : number(stock.currentPrice)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(stock.priceChangeRate) }}>{stock.priceAvailable===false||stock.priceChangeAvailable===false?'—':formatRate(stock.priceChangeRate,2)}</Typography><Typography component="span" sx={cell}>{number(quantity)}</Typography><Typography component="span" sx={cell}>{number(stock.averagePrice ?? Number.NaN)}</Typography><Typography component="span" sx={cell}>{number(bought)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(profit), fontWeight: 600 }}>{number(market)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(profit) }}>{formatRate(profitRate)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(profit), fontWeight: 600 }}>{number(profit)}</Typography></>;
}

function WatchRow({ stock, favorite, onValue, onFavorite }: { stock: StockItem; favorite:boolean; onValue?: (s: StockItem)=>void; onFavorite?: (s:StockItem)=>void }) {
  const rate = stock.priceAvailable===false||stock.priceChangeAvailable===false?Number.NaN:stock.priceChangeRate;
  const change = dayChange(stock);
  const profitChange = stock.operatingProfit !== undefined && stock.previousOperatingProfit !== undefined ? stock.operatingProfit - stock.previousOperatingProfit : undefined;
  return <><StockName stock={stock} favorite={favorite} onValue={onValue} onFavorite={onFavorite}/><WChip stock={stock} /><Typography component="span" title={profitChange === undefined ? '전년 비교 자료 없음' : `전년 대비 ${profitChange >= 0 ? '+' : ''}${number(profitChange)}억`} sx={{ ...cell, color: profitChange === undefined ? colors.textMuted : getMarketColor(profitChange) }}>{stock.operatingProfit === undefined ? "—" : `${stock.operatingProfit < 0 ? "(−) " : ""}${number(Math.abs(stock.operatingProfit))}억`}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(rate), fontWeight: 600 }}>{stock.priceAvailable === false ? '—' : won(stock.currentPrice)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(rate) }}>{won(change)}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(rate) }}>{formatRate(rate)}</Typography><Typography component="span" sx={cell}>{stock.per?.toFixed(1) ?? '—'}</Typography><Typography component="span" sx={cell}>{stock.pbr?.toFixed(1) ?? '—'}</Typography><Typography component="span" sx={{ ...cell, color: getMarketColor(stock.roe ?? 0) }}>{stock.roe === undefined ? '—' : `${stock.roe.toFixed(1)}%`}</Typography></>;
}

