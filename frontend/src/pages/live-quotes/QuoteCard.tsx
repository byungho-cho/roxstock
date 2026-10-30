import {memo,useEffect,useRef,useState} from 'react';
import {Box,Typography} from '@mui/material';
import type {DisplayStock,QuoteMarket} from '../../../../shared/src/domain/live-quotes';
import type {QuoteRow} from './useQuoteStream';
import {colors} from '../../styles/tokens';
export const statusText:Record<string,string>={LAST_QUOTE:'마지막 시세',IDLE:'표시 종목 추가 후 연결',QUOTE_DELAYED:'지연 시세',CONNECTED:'연결됨',LIVE:'실시간',CACHE:'저장 시세',WAITING_TRADE:'체결 수신 대기',NO_RECENT_TRADE:'최근 체결 없음',RECONNECTING:'재연결 중',CONNECTING:'연결 중',DISCONNECTED:'연결 끊김',MARKET_CLOSED:'장 운영시간 외',TRADING_HALTED:'거래정지',MARKET_UNSUPPORTED:'시장 미지원',SUBSCRIPTION_REJECTED:'구독 거절 · 제공처 확인 필요',LIMIT_EXCEEDED:'구독 한도 초과',NOT_CONFIGURED:'연결 설정 확인 필요',DISABLED:'실시간 수신 중지',SESSION_IN_USE:'다른 서버 연결 사용 중'};
const number=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('ko-KR');
const color=(n:number)=>n>0?colors.marketRise:n<0?colors.marketFall:colors.marketFlat;
type Props={stock:DisplayStock;market:QuoteMarket;row:QuoteRow;dragged?:boolean;ghost?:boolean;onOpen?:()=>void;onDown?:(e:React.PointerEvent)=>void;onMove?:(e:React.PointerEvent)=>void;onUp?:()=>void;onCancel?:()=>void};
export const QuoteCard=memo(function QuoteCard({stock,market,row,dragged=false,ghost=false,onOpen,onDown,onMove,onUp,onCancel}:Props){
  const q=row.quote,previous=useRef<{market:string;price:number}|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [flash,setFlash]=useState<'up'|'down'|null>(null),tone=useRef<'up'|'down'>('up'),flashMarket=useRef<QuoteMarket|null>(null);
  const visibleFlash=flashMarket.current===market?flash:null;
  useEffect(()=>{previous.current=null;clearTimeout(timer.current);setFlash(null);},[market]);
  useEffect(()=>{
    if(!q)return;
    const old=previous.current;
    if(!ghost&&row.status==='LIVE'&&!row.retained&&old&&old.market===q.market&&old.price!==q.price){
      tone.current=q.price>old.price?'up':'down';flashMarket.current=market;setFlash(tone.current);clearTimeout(timer.current);timer.current=setTimeout(()=>setFlash(null),1000);
    }
    previous.current={market:q.market,price:q.price};
  },[q?.price,q?.market,row.status,row.retained,ghost]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const asOf=q?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(q.observedAt)):'';
  return <Box data-quote-id={ghost?undefined:stock.id} data-no-pull-refresh role={ghost?undefined:'button'} tabIndex={ghost?undefined:0}
    aria-hidden={ghost||undefined} aria-label={`${stock.name} ${number(q?.price)} ${statusText[row.status]??row.status}${row.retained?' 마지막 시세':''}`}
    onContextMenu={e=>e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onClick={onOpen}
    onKeyDown={e=>{if(e.key==='Enter')onOpen?.();}}
    sx={{position:'relative',minWidth:0,height:96,boxSizing:'border-box',px:'12px',py:'10px',bgcolor:colors.surface,border:`0.5px ${dragged?'dashed':'solid'} ${dragged?colors.focus:colors.border}`,opacity:dragged ? .18 : 1,userSelect:'none',WebkitTouchCallout:'none'}}>
    <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',height:20,gap:'4px'}}><Box sx={{display:'flex',alignItems:'center',minWidth:0,gap:'5px'}}><Typography noWrap title={`${stock.name}(${stock.symbol})`} sx={{fontSize:14,fontWeight:600}}>{stock.name}</Typography>{stock.held&&<img src="/live-quotes/holding.svg" alt="보유" width={12} height={12}/>}</Box><img src="/live-quotes/bell.svg" alt="알림 기능 준비 중" width={16} height={16}/></Box>
    <Box sx={{display:'flex',alignItems:'center',gap:'4px',height:28,color:color(q?.change??0),fontVariantNumeric:'tabular-nums'}}>
      <Box data-testid={ghost?undefined:'live-price-area'} data-flash={visibleFlash??''} sx={{flex:'1 1 auto',minWidth:0,position:'relative',borderRadius:'4px','&:after':{content:'""',pointerEvents:'none',position:'absolute',inset:'-1px',borderRadius:'4px',border:`1px solid ${tone.current==='up'?colors.marketRise:colors.marketFall}`,opacity:visibleFlash?1:0,transition:visibleFlash||flashMarket.current!==market?'none':'opacity 220ms ease'}}}>
        <Typography data-testid={ghost?undefined:'live-price'} title={number(q?.price)} sx={{fontSize:17.6,fontWeight:500,lineHeight:'26px',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{number(q?.price)}</Typography>
      </Box>
      <Box data-testid={ghost?undefined:'live-rate'} sx={{flex:'0 0 auto',fontSize:11,textAlign:'right',whiteSpace:'nowrap'}}>{q?`${q.change>0?'▲':q.change<0?'▼':'—'} ${Math.abs(q.rate).toFixed(2)}%`:'—'}</Box>
    </Box>
    <Box sx={{height:18,fontSize:12,lineHeight:'18px',textAlign:'right',color:color(q?.change??0),fontVariantNumeric:'tabular-nums'}}>{q?number(Math.abs(q.change)):'—'}</Box>
    <Box title={`${statusText[row.status]??row.status} · ${asOf}`} sx={{fontSize:8,lineHeight:'10px',color:row.status==='LIVE'?colors.textMuted:colors.warning,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.status==='LIVE'?'체결 ':statusText[row.status]??row.status}{row.retained&&row.status!=='LAST_QUOTE'?' · 마지막 시세':''}{asOf&&` ${asOf}`}</Box>
  </Box>;
});
