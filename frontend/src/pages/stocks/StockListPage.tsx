import {HeaderAddButton} from '../../components/navigation/HeaderAddButton';
import {PriceTimestamp} from './PriceTimestamp';
import {CloseRounded,FavoriteBorderRounded,FavoriteRounded} from '@mui/icons-material';
import {Box,Button,Card,Dialog,IconButton,InputBase,MenuItem,Select,Skeleton,Stack,Tab,Tabs,Typography,useMediaQuery} from '@mui/material';
import {useEffect,useMemo,useRef,useState,type Ref,type ReactNode} from 'react';
import {useLocation,useSearchParams} from 'react-router-dom';
import {useDetailSwipe} from '../../hooks/useDetailSwipe';
import {useStockNeighbors} from '../../hooks/useStockNeighbors';
import {useCardNavigation} from '../../hooks/useCardNavigation';
import {usePageMemory,useListNavigation,useReturnNavigation} from '../../hooks/navigation/usePageMemory';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {useStocks} from '../../hooks/useMockData';
import {useFavoriteStocks} from '../../hooks/useFavoriteStocks';
import {PageHeader} from '../../components/navigation/Navigation';
import {colors} from '../../styles/tokens';
import type {StockItem,StockListType} from '../../types/models';
import {formatRate,getMarketColor} from '../../utils/format';
import {OverlayRegionScrollbar} from '../../components/navigation/OverlayRegionScrollbar';
import {TabletStockTable} from './TabletStockTable';
import {StockDetailContent} from './LiveStockDetailPage';
import {ValueIndicatorDialog,PriceDialog} from './StockDialogs';
import {dayChange,defaultSort,sortOptions,sortStocks,stockTabs,stockValuation,won,type StockSort} from './stockMath';

export function StockListPage({initialSelectedId,initialTab}:{initialSelectedId?:string;initialTab?:StockListType}={}) {
 const navigate=useListNavigation(),back=useReturnNavigation(),location=useLocation(),tablet=useMediaQuery('(min-width:600px)');const[params,setParams]=useSearchParams();
 const active=stockTabs.find(t=>t.value===params.get('tab'))?.value??initialTab??'holding';
 const {accountId}=useActiveAccount();const previousAccount=useRef(accountId);
 const {data,isPending,isError,refetch}=useStocks();const {favoriteIds,toggleFavorite}=useFavoriteStocks();
 const [query,setQuery]=usePageMemory('stockQuery',''),[sorting,setSorting]=usePageMemory<Partial<Record<StockListType,{key:StockSort;descending:boolean}>>>('stockSorting',{});
 const selected=params.get('selected')??initialSelectedId??null;
 const [valueStock,setValueStock]=useState<StockItem|null>(null),[priceStock,setPriceStock]=useState<StockItem|null>(null);const right=useRef<HTMLDivElement>(null),left=useRef<HTMLDivElement>(null);
 const sort=sorting[active]??defaultSort(active),all=data??[];
 const items=useMemo(()=>sortStocks(all.filter(s=>s.listType===active&&(!query.trim()||s.name.toLowerCase().includes(query.trim().toLowerCase())||s.symbol.includes(query.trim()))),sort.key,sort.descending,favoriteIds),[all,active,query,sort.key,sort.descending,favoriteIds]);
 const chosen=items.find(s=>s.id===selected),split=tablet&&!!chosen;
 const navigationState={accountId,ids:items.map(s=>s.id),tab:active};
 const neighbors=useStockNeighbors(chosen?.id??'',all,split?items.map(s=>s.id):[]);
 const moveDetail=(offset:number)=>{const target=offset<0?neighbors.previous:neighbors.next;if(target)setParams({tab:active,selected:target.id},{replace:true,state:{...location.state,stockNavigation:navigationState,listEntryKey:location.state?.listEntryKey??location.key}});};
 const detailSwipe=useDetailSwipe(moveDetail,split);
 const total=items.filter(s=>(s.quantity??0)>0).reduce((sum,s)=>sum+stockValuation(s).amount,0);
 useEffect(()=>{if(right.current)right.current.scrollTop=0;},[chosen?.id]);
 const changeTab=(tab:StockListType)=>{setParams({tab},{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 useEffect(()=>{if(previousAccount.current&&previousAccount.current!==accountId){if(selected&&window.location.pathname===location.pathname)setParams({tab:active},{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});setValueStock(null);setPriceStock(null);}previousAccount.current=accountId;},[accountId]);
 const select=(s:StockItem)=>{if(s.listType==='watchlist'||s.listType==='recommended'){navigate(`/stocks/${s.id}/value`,{state:{stockNavigation:navigationState}});return;}if(tablet){setParams({tab:active,selected:s.id},{state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key,stockNavigation:navigationState,returnTo:location.state?.returnTo??{pathname:location.pathname,search:location.search,index:window.history.state?.idx}}});}else navigate(`/stocks/${s.id}${s.listType==='traded'?'?tab=trades':''}`,{state:{stockNavigation:navigationState}});};
 const add=()=>navigate(`/stocks/add?type=${active==='traded'?'watchlist':active}`,{state:{backgroundLocation:location}});
 const toolbar=<StockToolbar query={query} onQuery={setQuery} sort={sort.key} descending={sort.descending} tab={active} onSort={key=>setSorting({...sorting,[active]:{...sort,key}})} onDirection={()=>setSorting({...sorting,[active]:{...sort,descending:!sort.descending}})} compact={tablet&&!split}/>;
 const summary=<Stack direction="row" sx={{height:26,alignItems:'center',justifyContent:'space-between'}}><Typography sx={{fontSize:14,fontWeight:600}}>총 {items.length}개</Typography>{active==='holding'&&<Typography sx={{fontSize:13,fontWeight:600,color:colors.marketRise}}>{isPending?'—':won(total)}</Typography>}</Stack>;
 const cards=<Stack spacing="8px" sx={{pb:tablet?'80px':0}}>{items.map(s=><StockCard key={s.id} stock={s} isFavorite={favoriteIds.has(s.id)} onToggleFavorite={()=>toggleFavorite(s.id)} onValue={()=>setValueStock(s)} onClick={()=>select(s)} onEditPrice={()=>tablet?setPriceStock(s):navigate(`/stocks/${s.id}/price`)}/>)}</Stack>;
 return <Stack spacing={split?0:1} data-testid="stock-list" data-restoration-ready={!isPending||isError} data-list-condition={JSON.stringify([active,query,sort])} sx={{height:tablet?'100%':undefined,minHeight:0,fontFamily:'RoxHomeInter, sans-serif'}}>
  <PageHeader embedded title={split?`종목목록(${stockTabs.find(t=>t.value===active)!.label})`:'종목목록'} showAdd={false} onBack={split?back:undefined} showBackTablet action={<HeaderAddButton label="종목 추가" onClick={add}/>}/>
  {isError&&<Button role="alert" onClick={()=>void refetch()}>{data?'최신 조회 실패 · 기존 목록 표시':'종목 목록 조회 실패 · 다시 시도'}</Button>}
  {split?<Stack direction="row" spacing="8px" sx={{height:'100%',minHeight:0}}><Box ref={left} data-testid="stock-left" data-scroll-region="stock-left" sx={{width:'calc((100% - 8px)/2)',minHeight:0,p:0,overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'}}}><Stack spacing={1}>{toolbar}{summary}{cards}</Stack></Box><OverlayRegionScrollbar scrollRef={left} label="종목목록 열 스크롤"/><Box ref={right} {...detailSwipe} data-detail-swipe data-testid="stock-right" data-scroll-region="stock-right" data-list-condition={chosen?.id} sx={{touchAction:'pan-y',flex:1,minWidth:0,p:0,overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'}}}><StockDetailContent key={chosen.id} stock={chosen} initialTab={active==='traded'?'trades':'holding'}/></Box><OverlayRegionScrollbar scrollRef={right} label="종목 상세 열 스크롤"/></Stack>:<>
   <Stack direction={tablet?'row':'column'} spacing={1} sx={{flexShrink:0}}><Tabs value={active} onChange={(_,value:StockListType)=>changeTab(value)} variant="fullWidth" aria-label="종목 목록 구분" sx={{width:tablet?270:'100%',minHeight:tablet?36:42,p:'4px',bgcolor:colors.surface,borderRadius:'8px','& .MuiTabs-indicator':{display:'none'},'& .MuiTab-root':{p:0,minWidth:0,minHeight:tablet?28:34,fontSize:tablet?10:13,fontWeight:400,borderRadius:'8px',color:colors.textMuted},'& .Mui-selected':{bgcolor:colors.buttonPrimary,color:'#fff !important',fontWeight:600}}}>{stockTabs.map(t=><Tab key={t.value} value={t.value} label={t.label}/>)}</Tabs><Box sx={{flex:tablet?1:undefined,minWidth:0}}>{toolbar}</Box></Stack>
   {tablet?<Box sx={{flex:1,minHeight:0,display:'flex',flexDirection:'column'}}><TabletStockTable stocks={items} activeTab={active} loading={isPending} error={isError&&!data} favoriteIds={favoriteIds} onSelect={select} onValue={s=>setValueStock(s)} onFavorite={s=>toggleFavorite(s.id)}/></Box>:<>{summary}{isPending?<Skeleton variant="rounded" height={139}/>:items.length?cards:!isError&&<Typography sx={{py:5,textAlign:'center',fontSize:13,color:colors.textMuted}}>내용이 없습니다.</Typography>}</>}
  </>}
  <ValueIndicatorDialog navigationState={navigationState} stock={valueStock} onClose={()=>setValueStock(null)}/><PriceDialog stock={priceStock} onClose={()=>setPriceStock(null)}/>
 </Stack>;
}
export function StockToolbar({query,onQuery,sort,descending,tab,onSort,onDirection,compact=false}:{query:string;onQuery:(s:string)=>void;sort:StockSort;descending:boolean;tab:StockListType;onSort:(s:StockSort)=>void;onDirection:()=>void;compact?:boolean}) {
 return <Stack direction="row" spacing="8px" sx={{height:compact?36:40,alignItems:'flex-start','& > *':{height:36}}}><Box sx={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:1,pl:'8px',pr:'4px',bgcolor:colors.surface,border:`1px solid ${colors.border}`,borderRadius:'8px'}}><Box component="img" src="/stocks-v03/search.svg" alt=""/><InputBase aria-label="목록 종목 검색" value={query} onFocus={e=>e.target.select()} onChange={e=>onQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();onQuery(e.currentTarget.querySelector('input')?.value??query);}}} placeholder="종목명·코드 검색" sx={{minWidth:0,flex:1,fontSize:12}}/></Box><IconButton aria-label={descending?'내림차순 · 오름차순으로 변경':'오름차순 · 내림차순으로 변경'} onClick={onDirection} sx={{width:32,border:`1px solid ${colors.border}`,bgcolor:colors.surface,borderRadius:'8px'}}><Box component="img" src="/stocks-v03/direction.svg" alt="" sx={{transform:descending?'none':'rotate(180deg)'}}/></IconButton><Select aria-label="정렬 기준" value={sort} onChange={e=>onSort(e.target.value as StockSort)} IconComponent={props=><Box component="img" {...props} src="/stocks-v03/chevron.svg" alt=""/>} sx={{width:96,bgcolor:colors.surface,borderRadius:'8px',fontSize:12,'& .MuiSelect-select':{pl:'8px',pr:'24px !important',py:0},'& .MuiSelect-icon':{right:8}}} MenuProps={{slotProps:{paper:{sx:{'& li':{fontSize:12,textAlign:'left',minHeight:36}}}}}}>{sortOptions[tab].map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}</Select></Stack>;
}
export function StockCard({stock:s,isFavorite,onToggleFavorite,onValue,onClick,onEditPrice}:{stock:StockItem;isFavorite:boolean;onToggleFavorite:()=>void;onValue:()=>void;onClick:()=>void;onEditPrice:()=>void}) {
 const cardNavigation=useCardNavigation(onClick);
 const holding=s.listType==='holding',traded=s.listType==='traded';
 const {quantity:qty,purchase:bought,price,amount:market,profit,rate}=stockValuation(s);
 return <Card data-testid={`stock-card-${s.id}`} data-scroll-item={s.id} tabIndex={0} {...cardNavigation} sx={{cursor:'pointer',border:'1px solid '+(isFavorite?colors.warning:colors.border),height:holding?139:traded?112:148,p:'12px 14px 10px',borderRadius:'8px',bgcolor:colors.surface,overflow:'hidden'}}><Stack spacing="4px"><Stack direction="row" sx={{height:22,alignItems:'center',justifyContent:'space-between'}}><Button aria-label={`${s.name} 가치지표`} onClick={e=>{e.stopPropagation();onValue();}} sx={{p:0,minWidth:0,justifyContent:'flex-start',color:colors.textPrimary,fontSize:15,fontWeight:700,overflow:'hidden',whiteSpace:'nowrap'}}>{s.name}<Box component="span" sx={{ml:1,fontSize:11,fontWeight:400,color:colors.textMuted}}>{s.symbol}</Box></Button>{Number.isFinite(s.valuationW)&&<Box component="span" sx={{ml:'auto',mr:1,px:'4px',border:`1px solid ${colors.warning}88`,borderRadius:'6px',fontSize:10,color:colors.warning}}>W{s.valuationW!.toFixed(2)}</Box>}<IconButton aria-label={`${s.name} ${isFavorite?'즐겨찾기 해제':'즐겨찾기 추가'}`} aria-pressed={isFavorite} onClick={e=>{e.stopPropagation();onToggleFavorite();}} sx={{width:22,height:22,p:0,color:isFavorite?colors.warning:colors.textMuted}}>{isFavorite?<FavoriteRounded sx={{fontSize:20}}/>:<FavoriteBorderRounded sx={{fontSize:20}}/>}</IconButton></Stack><Box sx={{height:1,bgcolor:colors.border}}/>
 {holding?<><MetricRow label={`보유　${qty.toLocaleString('ko-KR')} × ${won(s.averagePrice)}`} value={won(bought)}/><MetricRow label={<>평가　{qty.toLocaleString('ko-KR')} × {won(price)}<PriceTimestamp value={s.priceUpdatedAt}/></>} value={won(market)} color={getMarketColor(profit)}/><MetricRow label={<>평가손익　<Box component="span" sx={{color:getMarketColor(profit)}}>{Number.isFinite(rate)?formatRate(rate):'—'}</Box></>} value={won(profit)} color={getMarketColor(profit)}/></>:traded?<><MetricRow label="마지막 매도일" value={s.lastSoldAt?new Date(s.lastSoldAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}):'—'}/><MetricRow label="누적 실현손익" value={won(s.realizedProfit)} color={getMarketColor(s.realizedProfit??Number.NaN)}/></>:<><MetricRow label={<Stack direction="row" sx={{alignItems:'center',gap:1}}>현재가<IconButton aria-label={`${s.name} 현재가 수정`} onClick={e=>{e.stopPropagation();onEditPrice();}} sx={{p:0,width:14,height:14}}><Box component="img" src="/stocks-v03/price-edit.svg" alt=""/></IconButton></Stack>} value={<>{won(price)}<PriceTimestamp value={s.priceUpdatedAt}/></>} color={getMarketColor(s.priceChangeRate)}/><MetricRow label="전일대비" value={`${won(dayChange(s))} (${s.priceAvailable!==false&&s.priceChangeAvailable!==false&&Number.isFinite(s.priceChangeRate)?formatRate(s.priceChangeRate,2):'—'})`} color={getMarketColor(s.priceChangeRate)}/><MetricRow label={`PER ${s.per??'—'} · PBR ${s.pbr??'—'}`} value={`ROE ${s.roe??'—'}%`}/></>}
 <Stack direction="row" sx={{height:14,alignItems:'center',justifyContent:'space-between'}}>{holding?<Button aria-label={`${s.name} 현재가 수정`} onClick={e=>{e.stopPropagation();onEditPrice();}} sx={{p:0,minWidth:0,fontSize:10,color:getMarketColor(s.priceChangeRate),gap:'6px'}}>{`${won(dayChange(s))}(${s.priceAvailable!==false&&s.priceChangeAvailable!==false&&Number.isFinite(s.priceChangeRate)?formatRate(s.priceChangeRate,2):'—'})`}<Box component="img" src="/stocks-v03/price-edit.svg" alt=""/></Button>:<Typography noWrap sx={{fontSize:10,color:colors.textMuted,minWidth:0}}>{s.note??''}</Typography>}<Button onClick={e=>{e.stopPropagation();onClick();}} aria-label={`${s.name} 상세보기`} sx={{p:0,minWidth:0,fontSize:10,color:colors.textMuted}}>상세보기 ›</Button></Stack></Stack></Card>;
}
function MetricRow({label,value,color=colors.textPrimary}:{label:ReactNode;value:ReactNode;color?:string}){return <Stack direction="row" sx={{height:20,alignItems:'center',justifyContent:'space-between',gap:1}}><Typography component="div" noWrap sx={{fontSize:12,minWidth:0,color:colors.textSecondary}}>{label}</Typography><Typography noWrap sx={{fontSize:12,fontWeight:600,color,textAlign:'right',flexShrink:0}}>{value}</Typography></Stack>;}

const formatWon=won;
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


