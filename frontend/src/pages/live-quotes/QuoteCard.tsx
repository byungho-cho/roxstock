import {memo,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Badge,Box,IconButton,Typography} from '@mui/material';
import type {DisplayStock,QuoteMarket} from '../../../../shared/src/domain/live-quotes';
import type {QuoteRow} from './useQuoteStream';
import {colors} from '../../styles/tokens';
export const statusText:Record<string,string>={LAST_QUOTE:'마지막 시세',IDLE:'표시 종목 추가 후 연결',QUOTE_DELAYED:'지연 시세',CONNECTED:'연결됨',LIVE:'실시간',CACHE:'저장 시세',WAITING_TRADE:'체결 수신 대기',NO_RECENT_TRADE:'최근 체결 없음',RECONNECTING:'재연결 중',CONNECTING:'연결 중',DISCONNECTED:'연결 끊김',MARKET_CLOSED:'장 운영시간 외',TRADING_HALTED:'거래정지',MARKET_UNSUPPORTED:'시장 미지원',SUBSCRIPTION_REJECTED:'구독 거절 · 제공처 확인 필요',LIMIT_EXCEEDED:'구독 한도 초과',NOT_CONFIGURED:'연결 설정 확인 필요',DISABLED:'실시간 수신 중지',SESSION_IN_USE:'다른 서버 연결 사용 중'};
const number=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('ko-KR');
const color=(n:number)=>n>0?colors.marketRise:n<0?colors.marketFall:colors.marketFlat;
export const quoteCardHeight=72;
const koreanDay=(time:number)=>{const date=new Date(time+9*3600000);return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):'';};
const tightText={lineHeight:1,textBoxTrim:'trim-both',textBoxEdge:'cap alphabetic'} as const;
type Props={stock:DisplayStock;market:QuoteMarket;row:QuoteRow;closed?:boolean;alertCount?:number;dragged?:boolean;ghost?:boolean;onOpen?:()=>void;onAlert?:()=>void;onAcknowledge?:()=>void;onDown?:(e:React.PointerEvent)=>void;onMove?:(e:React.PointerEvent)=>void;onUp?:()=>void;onCancel?:()=>void};
export const QuoteCard=memo(function QuoteCard({stock,market,row,closed=false,alertCount=0,dragged=false,ghost=false,onOpen,onAlert,onAcknowledge,onDown,onMove,onUp,onCancel}:Props){
  const q=row.quote,previous=useRef<{market:string;price:number;live:boolean}|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [flash,setFlash]=useState<'up'|'down'|'flat'|null>(null),flashMarket=useRef<QuoteMarket|null>(null);
  const priceArea=useRef<HTMLDivElement>(null),rateArea=useRef<HTMLDivElement>(null);
  const [flashPadding,setFlashPadding]=useState({left:16,right:16});
  // Only the absolute outline adapts at viewport/rate boundaries; text geometry stays fixed.
  useLayoutEffect(()=>{
    const price=priceArea.current,rate=rateArea.current;if(!price||!rate)return;
    const measure=()=>{const p=price.getBoundingClientRect(),r=rate.getBoundingClientRect();const left=Math.max(0,Math.min(16,p.left-1)),right=Math.max(0,Math.min(16,r.left-p.right-2));setFlashPadding(old=>old.left===left&&old.right===right?old:{left,right});};
    measure();const observer=new ResizeObserver(measure);observer.observe(price);observer.observe(rate);window.addEventListener('resize',measure);return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[q?.price,q?.rate,market]);
  const marketClosed=closed||row.status==='MARKET_CLOSED';
  const today=koreanDay(Date.now());
  // A connection or REST seed is not proof of receiving this symbol/market's KST-day trade.
  const received=!!q&&q.symbol===stock.symbol&&q.market===market&&q.source==='KIS'&&!row.referenceMarket&&q.receivedAt>0&&koreanDay(q.receivedAt)===today&&koreanDay(Date.parse(q.observedAt))===today;
  const valueColor=received?color(q?.change??0):colors.textMuted;
  const dayDirection=(q?.change??0)>0?'up':(q?.change??0)<0?'down':'flat';
  const visibleFlash=!marketClosed&&received&&flashMarket.current===market&&flash?dayDirection:null;
  useEffect(()=>{previous.current=null;clearTimeout(timer.current);setFlash(null);},[market]);
  useEffect(()=>{
    if(!q)return;
    const old=previous.current;
    if(!ghost&&received&&row.status==='LIVE'&&!row.retained&&old?.live&&old.market===q.market&&old.price!==q.price){
      flashMarket.current=market;setFlash(q.change>0?'up':q.change<0?'down':'flat');clearTimeout(timer.current);timer.current=setTimeout(()=>setFlash(null),1000);
    }
    previous.current={market:q.market,price:q.price,live:received&&row.status==='LIVE'&&!row.retained};
  },[q?.price,q?.market,row.status,row.retained,ghost,received]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  // Cache receivedAt can be the HTTP fetch time; preserve its original quote timestamp instead.
  const stamp=q?(marketClosed&&q.source==='KIS'?q.receivedAt:Date.parse(q.observedAt)):NaN;
  const parts=Number.isFinite(stamp)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)):[];
  const part=(name:string)=>parts.find(p=>p.type===name)?.value??'';
  const asOf=parts.length?part('hour')+':'+part('minute')+':'+part('second'):'';
  const fullStamp=parts.length?part('month')+'.'+part('day')+' '+asOf:'';
  const lag=q?Math.max(0,q.receivedAt-Date.parse(q.observedAt)):0;
  const delayed=lag>=3000||row.status==='QUOTE_DELAYED';
  const timeColor=received&&!marketClosed&&!row.retained&&row.status==='LIVE'&&!delayed?colors.focus:colors.textMuted;
  const reference=row.referenceMarket?`${row.referenceMarket} 저장 시세 · ${market==='TOTAL'?'통합 수신 전 참고':'마지막 시세'} · `:'';
  const caption=reference+(marketClosed?(q?'종가 · 최종 수신 '+fullStamp:'장 운영시간 외 · 종가 자료 없음'):(row.status==='LIVE'?'체결 ':statusText[row.status]??row.status)+(row.retained&&row.status!=='LAST_QUOTE'?' · 마지막 시세':'')+(fullStamp?' '+fullStamp:'')+(lag>=3000?' · '+Math.floor(lag/1000)+'초 수신 지연':''));
  return <Box data-quote-received={received?'true':'false'} data-quote-id={ghost?undefined:stock.id} data-no-pull-refresh role={ghost?undefined:'group'}
    aria-hidden={ghost||undefined} aria-label={`${stock.name} ${number(q?.price)} ${reference}${statusText[row.status]??row.status}${row.retained?' 마지막 시세':''}`}
    onClick={ghost?undefined:onAcknowledge} onContextMenu={e=>e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
    sx={{position:'relative',display:'flex',flexDirection:'column',gap:'8px',minWidth:0,boxSizing:'border-box',px:'12px',py:'8px',bgcolor:colors.surface,border:`0.5px ${dragged?'dashed':'solid'} ${dragged?colors.focus:colors.border}`,opacity:dragged ? .18 : 1,userSelect:'none',WebkitTouchCallout:'none'}}>
    <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',position:'relative',gap:'4px'}}><Box sx={{display:'flex',alignItems:'center',minWidth:0,gap:'5px',pr:'28px'}}><Typography component="button" type="button" tabIndex={ghost?-1:0} aria-label={`${stock.name} ${stock.held||stock.traded?'종목 요약':'가치분석 상세'} 보기`} onClick={e=>{e.stopPropagation();onOpen?.();}} noWrap title={`${stock.name}(${stock.symbol})`} sx={{fontSize:14,fontWeight:600,p:0,m:0,border:0,bgcolor:'transparent',color:'inherit',textAlign:'left',cursor:'pointer',lineHeight:1,'&:focus-visible':{outline:`2px solid ${colors.focus}`,outlineOffset:2}}}>{stock.name}</Typography>{stock.held&&<img src="/live-quotes/holding.svg" alt="보유" width={12} height={12}/>}</Box><IconButton data-price-alert-control aria-label={`${stock.name} 금액 알림 설정`} aria-description={`등록된 알림 ${alertCount}개`} tabIndex={ghost?-1:0} onClick={e=>{e.stopPropagation();onAlert?.();}} sx={{position:"absolute",right:0,top:"50%",transform:"translateY(-50%)",width:20,height:20,p:0}}><Badge badgeContent={alertCount} max={99} sx={{color:alertCount?colors.warning:colors.textSecondary,'& .MuiBadge-badge':{fontSize:9,minWidth:14,height:14,px:'3px',top:1,right:0,bgcolor:'#000000',color:'#FFFFFF',border:'1px solid #64748B',boxSizing:'border-box'}}}><Box component="span" aria-hidden="true" sx={{width:16,height:16,bgcolor:'currentColor',mask:`url(/live-quotes/${alertCount?'bell-filled':'bell'}.svg) center/contain no-repeat`,WebkitMask:`url(/live-quotes/${alertCount?'bell-filled':'bell'}.svg) center/contain no-repeat`}}/></Badge></IconButton></Box>
    <Box sx={{display:'flex',alignItems:'center',gap:'4px',color:valueColor,fontVariantNumeric:'tabular-nums'}}>
      <Box sx={{flex:'1 1 auto',minWidth:0,display:'flex'}}><Box ref={priceArea} data-testid={ghost?undefined:'live-price-area'} data-flash={visibleFlash??''} sx={{display:'inline-flex',maxWidth:'100%',minWidth:0,position:'relative',borderRadius:'4px','&:after':{content:'""',pointerEvents:'none',position:'absolute',top:'-2px',bottom:'-2px',left:-flashPadding.left,right:-flashPadding.right,borderRadius:'4px',outline:`1px solid ${valueColor}`,opacity:visibleFlash?1:0,transition:visibleFlash||flashMarket.current!==market?'none':'opacity 220ms ease'}}}>
        <Typography data-testid={ghost?undefined:'live-price'} title={number(q?.price)} sx={{fontSize:17.6,fontWeight:500,...tightText,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',overflow:'clip',overflowClipMargin:'4px',textOverflow:'ellipsis'}}>{number(q?.price)}</Typography>
      </Box></Box>
      <Box ref={rateArea} data-testid={ghost?undefined:'live-rate'} sx={{flex:'0 0 auto',fontSize:11,...tightText,textAlign:'right',whiteSpace:'nowrap'}}>{q?`${q.change>0?'▲':q.change<0?'▼':'—'} ${Math.abs(q.rate).toFixed(2)}%`:'—'}</Box>
    </Box>
    <Box sx={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'4px',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>
      <Box data-testid={ghost?undefined:'live-quote-time'} data-delayed={delayed?'true':'false'} title={`${caption} · ${statusText[row.status]??row.status}`} sx={{minWidth:0,fontSize:8,...tightText,color:timeColor,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{asOf||'—'}</Box>
      <Box data-testid={ghost?undefined:'live-change'} sx={{flexShrink:0,fontSize:12,...tightText,textAlign:'right',color:valueColor}}>{q?number(Math.abs(q.change)):'—'}</Box>
    </Box>
  </Box>;
});
