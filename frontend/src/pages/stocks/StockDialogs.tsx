import {FairPriceCard} from '../value/FairPriceCard';
import {ValuePopupCharts} from '../value/ValueFinancialCharts';
import {detailValues,seoulYear,format} from '../value/valueApi';
import {valuePopupBasis} from './valuePopupBasis';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import {Box,Button,Dialog,IconButton,Stack,Typography} from '@mui/material';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect,useRef,useState} from 'react';
import type {StockItem} from '../../types/models';
import {updateSecurityPrice} from '../../data/roxstockApi';
import {NumberField} from '../../components/forms/Fields';
import {formatRate,getMarketColor} from '../../utils/format';
import {colors} from '../../styles/tokens';
import {dayChange,won} from './stockMath';
import {useListNavigation} from '../../hooks/navigation/usePageMemory';
export const stockDialogPaper={m:'16px',width:'calc(100% - 32px)',maxWidth:354,maxHeight:'calc(100dvh - 32px)',p:'16px',borderRadius:'8px',bgcolor:'#0B1322',border:'1px solid #2E4263',backgroundImage:'none'};
export function ValueIndicatorDialog({stock,onClose,navigationState}:{stock:StockItem|null;onClose:()=>void;navigationState?:import('../../hooks/useStockNeighbors').StockNavigation}) {
 const {accountId}=useActiveAccount(),navigate=useListNavigation(),year=seoulYear();
 const query=useQuery({queryKey:['valuePopup',accountId,stock?.id,year],enabled:!!stock,queryFn:({signal})=>detailValues(stock!.id,year,'annual',Math.max(2015,year-2),1,3,signal)});
 const data=query.data,empty={security:{currentPrice:null},fairPrices:['0.7','0.8','0.9','1.0'].map(persistence=>({persistence,price:null}))};
 return <Dialog open={!!stock} onClose={onClose} aria-labelledby="value-popup-title" slotProps={{paper:{sx:{...stockDialogPaper,m:'16px 8px',width:'calc(100% - 16px)',overflow:'hidden',display:'flex',flexDirection:'column',gap:'8px'}}}}>
  <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',flexShrink:0}}><Typography id="value-popup-title" sx={{fontSize:16,fontWeight:600}}>가치지표</Typography><IconButton aria-label="가치지표 닫기" onClick={onClose} sx={{p:0}}><Box component="img" src="/stocks-v03/close.svg" alt=""/></IconButton></Stack>
  <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',flexShrink:0,gap:1,minHeight:24}}><Typography sx={{fontSize:14,fontWeight:500,overflowWrap:'anywhere'}}>{stock?.name} · {stock?.symbol}</Typography><Box sx={{border:'1px solid #FBBF2488',borderRadius:'6px',px:'6px',fontSize:10,color:'#FBBF24',whiteSpace:'nowrap'}}>W {format(data?.w??stock?.valuationW,2)}</Box></Stack>
  <Box data-testid="value-popup-body" tabIndex={0} aria-label="가치지표 본문" sx={{overflowY:'auto',minHeight:0,overscrollBehavior:'contain',display:'grid',gap:'8px'}}>
   {query.isError&&<Button role="alert" onClick={()=>void query.refetch()}>가치지표 조회 실패 · 다시 시도</Button>}
   <FairPriceCard data={data??empty} compact/>
   {data?<ValuePopupCharts rows={data.rows}/>:<Typography role="status" sx={{fontSize:12,color:colors.textMuted,p:2}}>{query.isPending?'불러오는 중…':'재무 데이터 없음'}</Typography>}
  </Box>
  <Stack direction="row" data-testid="value-popup-footer" sx={{justifyContent:'space-between',alignItems:'center',minHeight:28,flexShrink:0,gap:1}}><Typography sx={{fontSize:10,color:colors.textMuted}}>{valuePopupBasis(data)}</Typography><Button size="small" sx={{fontSize:12,p:0,minHeight:28,whiteSpace:'nowrap'}} onClick={()=>{onClose();navigate(`/stocks/${stock!.id}/value`,{state:{stockNavigation:navigationState}});}}>상세보기 ›</Button></Stack>
 </Dialog>;
}
export function PriceDialog({stock,onClose}:{stock:StockItem|null;onClose:()=>void}) {
 const[busy,setBusy]=useState(false),body=useRef<HTMLDivElement>(null);
 return <Dialog open={!!stock} onClose={()=>!busy&&onClose()} slotProps={{transition:{onEntered:()=>{const input=body.current?.querySelector<HTMLInputElement>('input');input?.focus({preventScroll:true});input?.select();}},paper:{sx:{...stockDialogPaper,maxWidth:338,p:'18px'}}}}><Box ref={body}>{stock&&<PriceEditor key={stock.id} stock={stock} onClose={onClose} onBusyChange={setBusy} dialog/>}</Box></Dialog>;
}
export function PriceEditor({stock,onClose,dialog=false,onBusyChange}:{stock:StockItem;onClose:()=>void;dialog?:boolean;onBusyChange?:(busy:boolean)=>void}) {
 const queryClient=useQueryClient(),input=useRef<HTMLInputElement>(null),lock=useRef(false),alive=useRef(true);
 const[value,setValue]=useState(Number.isFinite(stock.currentPrice)?String(stock.currentPrice):''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 const valid=value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>0;
 const save=async()=>{
  if(!valid||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await updateSecurityPrice(stock.id,value);await Promise.all(['stocks','securityAnalysis','targetArrivals','buyLots','allBuyLots','dashboard','recentBuys'].map(key=>queryClient.invalidateQueries({queryKey:[key]})));if(alive.current)onClose();}
  catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'현재가 저장 실패 · 다시 시도해 주세요.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const row=(label:string,value:string)=><Stack direction="row" sx={{height:22,justifyContent:'space-between',gap:1}}><Typography sx={{fontSize:11,lineHeight:'13px',fontWeight:600,color:colors.textMuted}}>{label}</Typography><Typography noWrap sx={{fontSize:13,textAlign:'right',color:getMarketColor(stock.priceChangeRate)}}>{value}</Typography></Stack>;
 return <Stack data-testid="stock-price-form" className="rox-home" spacing="8px" sx={{fontFamily:'RoxHomeInter, sans-serif','& .MuiFormControl-root > .MuiStack-root > .MuiBox-root':{bgcolor:colors.surface,borderColor:colors.border}}}>
  <Stack direction="row" sx={{height:28,alignItems:'center',justifyContent:'space-between'}}><Typography sx={{fontSize:17}}>{stock.name}</Typography>{dialog&&<IconButton aria-label="현재가 수정 닫기" disabled={busy} onClick={onClose} sx={{p:0,width:16,height:16}}><Box component="img" src="/stocks-v03/close.svg" alt="" sx={{width:16,height:16}}/></IconButton>}</Stack>
  <Typography sx={{fontSize:10,lineHeight:'12px',fontWeight:600,color:colors.textMuted}}>A{stock.symbol}</Typography>
  {row('자동 수집 현재가',won(stock.priceAvailable===false?Number.NaN:stock.currentPrice))}
  <Typography sx={{fontSize:11,lineHeight:'13px',fontWeight:600,color:colors.textMuted}}>변경할 현재가</Typography>
  <NumberField label="금액" value={value} onChange={setValue} suffix="원" size="small" clearIconSrc="/stocks-v03/clear.svg" autoFocus inputRef={input} onEnter={()=>void save()} disabled={busy}/>
  {row('전일 대비',`${won(dayChange(stock))}  ${stock.priceAvailable!==false&&stock.priceChangeAvailable!==false&&Number.isFinite(stock.priceChangeRate)?formatRate(stock.priceChangeRate,2):'—'}`)}
  {error&&<Typography role="alert" sx={{fontSize:12,color:colors.marketRise}}>{error}</Typography>}
  <Stack direction="row" spacing="10px"><Button fullWidth variant="outlined" disabled={busy} onClick={onClose} sx={{height:40,borderRadius:'8px',fontSize:13,color:colors.textSecondary,bgcolor:colors.surface,borderColor:colors.border}}>취소</Button><Button fullWidth variant="contained" disabled={!valid||busy} onClick={()=>void save()} sx={{height:40,borderRadius:'8px',fontSize:13,color:colors.textPrimary,bgcolor:colors.buttonPrimary,'&:hover':{bgcolor:colors.buttonPrimary}}}>변경</Button></Stack>
 </Stack>;
}
