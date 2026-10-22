import {authRequest} from '../auth/client';
import {selectedAccountStorageKey} from '../data/roxstockApi';
import {usePopupHistory} from '../hooks/usePopupHistory';
import {lazy,Suspense,useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {NotificationsRounded} from '@mui/icons-material';
import {Alert,Badge,Box,Button,ButtonBase,DialogContent,DialogTitle,IconButton,Stack,Typography} from '@mui/material';
import {useLocation,useNavigate} from 'react-router-dom';
import {HistoryDialog} from '../components/common/HistoryDialog';
import {useAuth} from '../auth/AuthGate';
import {useActiveAccount} from '../hooks/useActiveAccount';
import {useStocks} from '../hooks/useMockData';
import {getBuyLots} from '../data/roxstockApi';
import {apiRequest} from '../data/apiClient';
import {colors} from '../styles/tokens';
import {brokerAvailable,brokerNative} from './brokerNative';
import {parseTradeNotice,accountMatches,sellCandidates,type TradeNotice} from './tradeNotice';
import type {NotificationPreferences} from './NotificationSettings';
import type {NotificationTradeEntry} from '../pages/trade/TradePage';
const NotificationTradeForm=lazy(()=>import('../pages/trade/TradePage').then(m=>({default:m.NotificationTradeForm})));
const LiveCashPage=lazy(()=>import('../pages/cash/LiveCashPage').then(m=>({default:m.LiveCashPage})));
import {StockInputContext} from '../pages/stocks/StockInputContext';
import {HeaderSlotContext} from '../components/navigation/Navigation';
type Event={id:string;kind:'NEWS'|'TARGET';title:string|null;detail:string|null;accountId:string|null;createdAt:string};
const labels={BUY:'매수',SELL:'매도',DIVIDEND:'배당',NEWS:'소식',TARGET:'목표'};
const tones={BUY:'#336ec7',SELL:'#bf404d',DIVIDEND:'#916f2b',NEWS:'#278761',TARGET:'#8055ba'};
export function UnifiedNotifications(){
 const {user}=useAuth(),{accountId,accounts}=useActiveAccount(),client=useQueryClient(),navigate=useNavigate(),location=useLocation();
 const [pendingTrade,setPendingTrade]=useState<TradeNotice|null>(null);
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[sell,setSell]=useState<{notice:TradeNotice;stockId:string}|null>(null),[lotId,setLotId]=useState(''),[entry,setEntry]=useState<NotificationTradeEntry|null>(null),[busy,setBusy]=useState(false);
 const closePopup=usePopupHistory(open||!!sell||!!entry,()=>{if(!busy){setOpen(false);setSell(null);setEntry(null);}});
 const settings=useQuery({queryKey:['notification-settings',user?.id],queryFn:()=>apiRequest<NotificationPreferences>('/notifications/settings')});
 const inbox=useQuery({queryKey:['notification-inbox',user?.id],queryFn:()=>apiRequest<{rows:Event[];total:number}>('/notifications/inbox'),refetchInterval:15000});
 const local=useQuery({queryKey:['broker-inbox',user?.id],queryFn:async()=>{const r=await brokerNative('list');if(r.protocolVersion!==2)throw new Error('통합 알림 지원 APK 업데이트가 필요합니다.');return r;},enabled:brokerAvailable()&&!!settings.data?.tradeEnabled,refetchInterval:3000});
 const stocks=useStocks(undefined,{enabled:open||!!sell||!!entry,forceFetch:true});
 const notices=(settings.data?.tradeEnabled?local.data?.entries??[]:[]).map(parseTradeNotice).filter((n):n is TradeNotice=>!!n);
 const rows=[...notices.map(n=>({...n,title:n.name||'종목 확인 필요',detail:n.kind==='DIVIDEND'?`배당금 ${n.net||n.gross||'확인 필요'}원`:`${n.quantity||'?'}주 × ${n.price||'?'}원`,time:n.receivedAt})),...(inbox.data?.rows??[]).filter(n=>n.kind==='NEWS'?settings.data?.newsEnabled:settings.data?.targetEnabled).map(n=>({...n,time:Date.parse(n.createdAt)}))].sort((a,b)=>b.time-a.time);
 const total=(settings.data?.tradeEnabled?local.data?.total??notices.length:0)+(inbox.data?.total??0);
 const refresh=async()=>{await Promise.all([local.refetch(),client.invalidateQueries({queryKey:['notification-inbox',user?.id]})]);};
 const complete=async(n:TradeNotice)=>{await brokerNative('status',{id:n.id,status:'completed'});await refresh();};
 const lots=useQuery({queryKey:['notice-sell-lots',user?.id,accountId,sell?.stockId],queryFn:()=>getBuyLots(accountId!,sell!.stockId,false),enabled:!!sell&&!!accountId});
 const candidates=sell?sellCandidates(lots.data??[],sell.notice):[];
 useEffect(()=>{setOpen(false);setSell(null);setEntry(null);setLotId('');setError('');},[user?.id,accountId]);
 const selectTrade=async(notice:TradeNotice)=>{
  setError('');const matching=(accounts.data??[]).filter(a=>a.isActive&&a.brokerName.includes('미래')&&accountMatches(notice.account,a.accountNumber??''));
  if(matching.length!==1){setError('알림의 계좌를 유일하게 확인할 수 없습니다. 계좌번호를 확인하고 수동 거래 입력을 이용해 주세요.');return;}
  if(matching[0].id!==accountId){setBusy(true);try{await authRequest('settings',{selectedAccountId:matching[0].id});setPendingTrade(notice);localStorage.setItem(selectedAccountStorageKey,matching[0].id);window.dispatchEvent(new Event('roxstock-selected-account'));}catch{setError('알림의 계좌를 선택하지 못했습니다.');}finally{setBusy(false);}return;}
  const matchingStocks=(stocks.data??[]).filter(s=>notice.symbol?s.symbol===notice.symbol:!!notice.name&&s.name===notice.name);
  if(matchingStocks.length!==1){setError('종목을 정확히 확인할 수 없습니다. 종목을 등록하거나 수동 거래 입력을 이용해 주세요.');return;}
  if(notice.kind==='SELL'&&(!notice.date||!notice.quantity||!notice.price)){setError('매도일·수량·단가가 확인되지 않아 연결 매수를 선택할 수 없습니다. 수동 거래 입력을 이용해 주세요.');return;}
  const stockId=matchingStocks[0].id;setOpen(false);
  if(notice.kind==='SELL'){setLotId('');setSell({notice,stockId});}else setEntry({notice,stockId,onClose:()=>setEntry(null),onSaved:()=>complete(notice)});
 };
 useEffect(()=>{if(pendingTrade&&stocks.data&&accounts.data?.some(a=>a.id===accountId&&accountMatches(pendingTrade.account,a.accountNumber??''))){setPendingTrade(null);void selectTrade(pendingTrade);}},[pendingTrade,accountId,stocks.data]);
 useEffect(()=>setPendingTrade(null),[user?.id]);
 const state=async(id:string,action:'read'|'dismiss')=>{await apiRequest('/notifications/events/'+id+'/state',{method:'POST',body:JSON.stringify({action})});await client.invalidateQueries({queryKey:['notification-inbox',user?.id]});};
 const click=async(row:typeof rows[number])=>{if(busy)return;if(row.kind!=='NEWS'&&row.kind!=='TARGET'){await selectTrade(row as TradeNotice);return;}setBusy(true);setError('');try{await apiRequest('/notifications/events/'+row.id);await closePopup();navigate('/?pushEvent='+encodeURIComponent(row.id));setOpen(false);}catch{setError('알림 화면으로 이동하지 못했습니다.');}finally{setBusy(false);}};
 useEffect(()=>{const id=new URLSearchParams(location.search).get('readNotification');if(!id||!['/','/detail/stock-news'].includes(location.pathname))return;void state(id,'read').catch(()=>setError('읽음 저장에 실패했습니다. 알림을 다시 확인해 주세요.'));},[location.pathname,location.search]);
 const paper={width:338,height:356,maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100dvh - 24px)',m:0,p:1.5,borderRadius:'12px',bgcolor:colors.surface,backgroundImage:'none'};
 const dismiss=async(row:typeof rows[number])=>{setBusy(true);try{if(row.kind==='NEWS'||row.kind==='TARGET')await state(row.id,'dismiss');else{await brokerNative('status',{id:row.id,status:'ignored'});await refresh();}}catch{setError('알림을 처리하지 못했습니다. 다시 시도해 주세요.');}finally{setBusy(false);}};
 return <>{total>0&&<IconButton aria-label={`알림 ${total}건`} onClick={()=>{setError('');setOpen(true);}} sx={{position:'fixed',left:{xs:16,sm:28},bottom:52,width:44,height:44,zIndex:12,bgcolor:colors.raised,color:colors.textPrimary}}><Badge badgeContent={total} max={99} sx={{'& .MuiBadge-badge':{height:16,minWidth:16,p:'0 2px',fontSize:9,bgcolor:'#bf404d',color:'#fff'}}}><NotificationsRounded/></Badge></IconButton>}
 <HistoryDialog historyEnabled={false} open={open} onClose={()=>!busy&&setOpen(false)} disableAutoFocus slotProps={{paper:{sx:paper}}}><DialogTitle aria-label="알림" sx={{p:0,mb:1,display:'flex',justifyContent:'space-between',fontSize:17,fontWeight:600}}>알림<Typography sx={{fontSize:12,color:colors.textMuted}}>{total}건</Typography></DialogTitle><DialogContent sx={{p:'0 !important',minHeight:0}}><Stack spacing={1}>{rows.map(row=><Box key={row.id} sx={{bgcolor:colors.raised,borderRadius:'8px',p:'8px 10px',height:64,boxSizing:'border-box'}}><ButtonBase onClick={()=>void click(row)} disabled={busy} sx={{width:'100%',justifyContent:'flex-start',gap:1}}><Box sx={{width:30,height:18,borderRadius:'4px',bgcolor:tones[row.kind],fontSize:9,fontWeight:600,display:'grid',placeItems:'center',flexShrink:0}}>{labels[row.kind]}</Box><Typography noWrap sx={{fontSize:13,fontWeight:600}}>{row.title||labels[row.kind]}</Typography></ButtonBase><Stack direction="row" sx={{mt:.5,alignItems:'center',gap:1}}><ButtonBase disabled={busy} onClick={()=>void click(row)} sx={{minWidth:0,flex:1,justifyContent:'flex-start'}}><Typography noWrap sx={{fontSize:12}}>{row.detail||'알림 확인'}</Typography></ButtonBase><Button disabled={busy} onClick={()=>void dismiss(row)} sx={{width:40,minWidth:40,height:22,minHeight:22,p:0,fontSize:10,borderRadius:'4px',bgcolor:'#2e3b4f',color:'#d9e0ed'}}>무시</Button></Stack></Box>)}{error&&<Alert severity="error">{error}</Alert>}</Stack></DialogContent><Button variant="contained" onClick={()=>setOpen(false)} sx={{mt:1,height:36,minHeight:36,flexShrink:0,borderRadius:'12px'}}>닫기</Button></HistoryDialog>
 <HistoryDialog historyEnabled={false} open={!!sell} onClose={()=>setSell(null)} disableAutoFocus slotProps={{paper:{sx:{...paper,height:'auto',maxHeight:'calc(100dvh - 24px)'}}}}><DialogTitle sx={{p:0,fontSize:17,fontWeight:600}}>연결 매수 선택</DialogTitle><Typography sx={{my:1,fontSize:12,color:colors.positive}}>{sell?.notice.name} · 매도 {sell?.notice.quantity}주 × {sell?.notice.price}원</Typography><DialogContent sx={{p:'0 !important'}}><Stack spacing={1}>{lots.isPending?<Typography>매수 조회 중</Typography>:lots.isError?<Alert severity="error">매수 조회 실패<Button onClick={()=>void lots.refetch()}>다시 시도</Button></Alert>:!candidates.length?<Typography>동일 계좌·종목에 매도일 이전 매수 중 잔여수량이 충분한 매수가 없습니다.</Typography>:candidates.map(l=><ButtonBase key={l.id} onClick={()=>setLotId(l.id)} aria-pressed={lotId===l.id} sx={{display:'block',textAlign:'left',p:1.25,borderRadius:'8px',bgcolor:lotId===l.id?'#1b3155':colors.raised,border:'1px solid '+(lotId===l.id?'#fbbf24':'transparent')}}><Typography sx={{fontSize:13,fontWeight:600}}>{new Date(l.boughtAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})} 매수 · {Number(l.unitPrice).toLocaleString()}원</Typography><Typography sx={{fontSize:12,mt:.5}}>잔여 {l.remainingQuantity}주 · 예상 손익 {(Number(sell?.notice.quantity)*(Number(sell?.notice.price)-Number(l.unitPrice))).toLocaleString()}원</Typography></ButtonBase>)}</Stack></DialogContent><Button variant="contained" disabled={!lotId} sx={{mt:1,height:36,borderRadius:'12px'}} onClick={()=>{if(!sell||!candidates.some(l=>l.id===lotId))return;const n=sell.notice;setEntry({notice:n,stockId:sell.stockId,lotId,onClose:()=>setEntry(null),onSaved:()=>complete(n)});setSell(null);}}>선택 후 매도 등록</Button></HistoryDialog>
 <HistoryDialog historyEnabled={false} open={!!entry} onClose={()=>!busy&&setEntry(null)} disableAutoFocus slotProps={{paper:{sx:{width:370,height:364,maxWidth:'100vw',maxHeight:'calc(100dvh - 16px)',m:0,borderRadius:'8px',bgcolor:colors.canvas}}}}><DialogTitle sx={{height:44,minHeight:44,boxSizing:'border-box',p:1,display:'flex',gap:1,alignItems:'center',fontSize:16,fontWeight:600}}><IconButton aria-label="알림 등록 닫기" disabled={busy} onClick={()=>setEntry(null)} sx={{width:20,height:28,p:0}}><Box component="img" src="/stocks-v03/back.svg" alt="" sx={{width:20,height:20}}/></IconButton>{entry?labels[entry.notice.kind]:''} 등록</DialogTitle><DialogContent sx={{p:'0 8px 8px !important',overflowY:'auto'}}><StockInputContext.Provider value={{inDialog:true,setTitle:()=>{},setBusy}}><HeaderSlotContext.Provider value={null}><Suspense fallback={<Typography>등록 화면 준비 중</Typography>}>{entry&&(entry.notice.kind==='DIVIDEND'?<LiveCashPage notification={entry}/>:<NotificationTradeForm entry={entry}/>)}</Suspense></HeaderSlotContext.Provider></StockInputContext.Provider></DialogContent></HistoryDialog>
 </>;
}
