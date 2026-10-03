import { useActiveAccount } from '../../hooks/useActiveAccount';
import {Box,Button,Dialog,IconButton,Stack,Typography} from '@mui/material';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect,useRef,useState} from 'react';
import type {StockItem} from '../../types/models';
import {getSecurityAnalysis,updateSecurityPrice} from '../../data/roxstockApi';
import {NumberField} from '../../components/forms/Fields';
import {formatRate,getMarketColor} from '../../utils/format';
import {colors} from '../../styles/tokens';
import {dayChange,won} from './stockMath';
import {useListNavigation} from '../../hooks/navigation/usePageMemory';
export const stockDialogPaper={m:'16px',width:'calc(100% - 32px)',maxWidth:354,maxHeight:'calc(100dvh - 32px)',p:'16px',borderRadius:'8px',bgcolor:'#0B1322',border:'1px solid #2E4263',backgroundImage:'none'};
export function ValueIndicatorDialog({stock,onClose}:{stock:StockItem|null;onClose:()=>void}) {
 const {accountId}=useActiveAccount();const navigate=useListNavigation();const data=useQuery({queryKey:['securityAnalysis',stock?.id,accountId],enabled:!!stock,queryFn:()=>getSecurityAnalysis(stock!.id,undefined,accountId)});
 const analysis=data.data,latest=analysis?.statements.filter(s=>s.periodType==='ANNUAL').sort((a,b)=>b.fiscalYear-a.fiscalYear)[0];
 const amount=(v:string|null|undefined)=>v==null?'—':won(Number(v));
 const rows=[['주요지표',`PER ${analysis?.valuation?.per??stock?.per??'—'} · PBR ${analysis?.valuation?.pbr??stock?.pbr??'—'} · ROE ${analysis?.valuation?.roe??stock?.roe??'—'}%`],['지배순이익',amount(analysis?.fundamentals?.controllingProfit)],['발행주식수 (자기주식수)',`${analysis?.fundamentals?.issuedShares==null?'—':Number(analysis.fundamentals.issuedShares).toLocaleString('ko-KR')} (${analysis?.fundamentals?.treasuryShares==null?'—':Number(analysis.fundamentals.treasuryShares).toLocaleString('ko-KR')})`],['자산',amount(latest?.totalAssets)],['부채',amount(latest?.totalLiabilities)],['자본 (전년도)',`${amount(latest?.totalEquity)} (${amount(analysis?.fundamentals?.previousEquity)})`],['주당배당금',amount(analysis?.valuation?.dividendPerShare)],['배당수익률',analysis?.valuation?.dividendYield==null?'—':`${analysis.valuation.dividendYield}%`]];
 return <Dialog open={!!stock} onClose={onClose} slotProps={{paper:{sx:stockDialogPaper}}}><Stack spacing={1.5}><Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center'}}><Typography sx={{fontSize:16,fontWeight:600}}>가치지표</Typography><IconButton aria-label="가치지표 닫기" onClick={onClose} sx={{p:0}}><Box component="img" src="/stocks-v03/close.svg" alt=""/></IconButton></Stack><Typography sx={{fontSize:13,fontWeight:600}}>{stock?.name}<Box component="span" sx={{fontSize:11,color:colors.textMuted}}> · A{stock?.symbol}</Box></Typography>{data.isError?<Button role="alert" onClick={()=>void data.refetch()}>가치지표 조회 실패 · 다시 시도</Button>:rows.map(([label,value])=><Stack key={label} direction="row" sx={{justifyContent:'space-between',gap:1}}><Typography sx={{fontSize:10,color:colors.textMuted}}>{label}</Typography><Typography sx={{fontSize:11,textAlign:'right'}}>{data.isPending?'—':value}</Typography></Stack>)}<Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center'}}><Typography sx={{fontSize:10,color:colors.textMuted}}>{latest?`${latest.fiscalYear}년 연결 기준`:'재무 기준 미수집'}</Typography><Button size="small" sx={{fontSize:11,p:0}} onClick={()=>{onClose();navigate(`/stocks/${stock!.id}/value`);}}>상세보기 ›</Button></Stack></Stack></Dialog>;
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
