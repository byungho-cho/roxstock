import {authRequest} from '../auth/client';
import {selectedAccountStorageKey} from '../data/roxstockApi';
import {usePopupHistory} from '../hooks/usePopupHistory';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
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
import {stockDialogPaper} from '../pages/stocks/StockDialogs';
import {seoulTradeDate} from '../utils/tradeDates';
import {getMarketColor} from '../utils/format';
import {colors} from '../styles/tokens';
import {brokerAvailable,brokerNative} from './brokerNative';
import {parseTradeNotice,matchingNoticeStocks,formatNoticeNumber,accountMatches,sortedSellCandidates,candidateAmounts,formatCandidateAmount,type TradeNotice} from './tradeNotice';
import {effectiveNotification,type NotificationPreferences} from './NotificationSettings';
import {NotificationCard,notificationLabels as labels,notificationTones as tones} from './NotificationCard';
import type {NotificationTradeEntry} from '../pages/trade/TradePage';
const LiveCashPage=lazy(()=>import('../pages/cash/LiveCashPage').then(m=>({default:m.LiveCashPage})));
import {StockInputContext} from '../pages/stocks/StockInputContext';
import {HeaderSlotContext} from '../components/navigation/Navigation';
type Event={id:string;kind:'NEWS'|'TARGET';title:string|null;detail:string|null;accountId:string|null;createdAt:string};
export function UnifiedNotifications(){
 const {user}=useAuth(),{accountId,accounts}=useActiveAccount(),client=useQueryClient(),navigate=useNavigate(),location=useLocation();
 const [pendingTrade,setPendingTrade]=useState<TradeNotice|null>(null);
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[sell,setSell]=useState<{notice:TradeNotice;stockId:string}|null>(null),[lotId,setLotId]=useState(''),[entry,setEntry]=useState<NotificationTradeEntry|null>(null),[busy,setBusy]=useState(false);
 const closePopup=usePopupHistory(open||!!sell||!!entry,()=>{if(!busy){setOpen(false);setSell(null);setEntry(null);}});
 const settings=useQuery({queryKey:['notification-settings',user?.id],queryFn:()=>apiRequest<NotificationPreferences>('/notifications/settings')});
 const inbox=useQuery({queryKey:['notification-inbox',user?.id],queryFn:()=>apiRequest<{rows:Event[];total:number}>('/notifications/inbox'),refetchInterval:15000});
 const local=useQuery({queryKey:['broker-inbox',user?.id],queryFn:async()=>{const r=await brokerNative('list',{userId:user!.id});if(r.protocolVersion!==3)throw new Error('통합 알림 지원 APK 업데이트가 필요합니다.');return r;},enabled:brokerAvailable()&&!!settings.data?.tradeEnabled,refetchInterval:3000});
 useEffect(()=>{if(local.data?.openInbox&&user&&settings.data?.tradeEnabled){setOpen(true);void brokerNative('ack-click',{id:local.data.openInbox});}},[local.data?.openInbox,user?.id,settings.data?.tradeEnabled]);
 const stocks=useStocks(undefined,{enabled:open||!!sell||!!entry||!!pendingTrade,forceFetch:true});
 const preferences=settings.data?.accounts??[];
 const notices=(local.data?.entries??[]).map(parseTradeNotice).filter((n):n is TradeNotice=>!!n).flatMap(n=>{
  const matches=preferences.filter(a=>a.brokerName.includes('미래')&&accountMatches(n.account,a.accountNumber??''));
  return matches.length===1&&effectiveNotification(matches[0],n.kind)?[{...n,accountId:matches[0].id}]:[];
 });
 const rows=[...notices.map(n=>({...n,title:n.name||'종목 확인 필요',detail:n.kind==='DIVIDEND'?`배당금 ${formatNoticeNumber(n.net||n.gross,'확인 필요')}원`:`${formatNoticeNumber(n.quantity)}주 × ${formatNoticeNumber(n.price)}원`,time:n.receivedAt})),...(inbox.data?.rows??[]).filter(n=>effectiveNotification(preferences.find(a=>a.id===n.accountId),n.kind)).map(n=>({...n,time:Date.parse(n.createdAt)}))].sort((a,b)=>b.time-a.time);
 const groups=preferences.map(account=>({account,rows:rows.filter(r=>r.accountId===account.id)})).filter(g=>g.rows.length);
 const total=rows.length;
 const refresh=async()=>{await Promise.all([local.refetch(),client.invalidateQueries({queryKey:['notification-inbox',user?.id]})]);};
 const complete=async(n:TradeNotice)=>{await brokerNative('status',{id:n.id,status:'completed'});await refresh();};
 const lots=useQuery({queryKey:['notice-sell-lots',user?.id,accountId,sell?.stockId],queryFn:()=>getBuyLots(accountId!,sell!.stockId,false),enabled:!!sell&&!!accountId});
 const candidates=sell?sortedSellCandidates((lots.data??[]).filter(l=>l.security.id===sell.stockId),sell.notice):[];
 const selectionScope=[user?.id,accountId,sell?.stockId,sell?.notice.id].join(':');
 const choice=useRef({scope:'',id:''});
 const validLotId=!lots.isError&&candidates.some(l=>l.id===lotId)?lotId:'';
 useEffect(()=>{
  if(!sell){choice.current={scope:'',id:''};setLotId('');return;}
  if(choice.current.scope!==selectionScope){choice.current={scope:selectionScope,id:''};setLotId('');}
  if(!lots.isSuccess||lots.isError)return;
  const id=candidates.some(l=>l.id===choice.current.id)?choice.current.id:candidates[0]?.id??'';
  choice.current={scope:selectionScope,id};setLotId(id);
 },[selectionScope,lots.data,lots.isSuccess,lots.isError]);
 const previousScope=useRef({userId:user?.id,accountId});
 useEffect(()=>{const previous=previousScope.current;previousScope.current={userId:user?.id,accountId};if(previous.userId===user?.id&&(!previous.accountId||previous.accountId===accountId))return;setOpen(false);setSell(null);setEntry(null);setLotId('');setError('');},[user?.id,accountId]);
 const openTrade=async(notice:TradeNotice,stockId:string,lotId?:string)=>{const returnTo=location.pathname+location.search;await closePopup();setOpen(false);setSell(null);navigate('/trade?'+new URLSearchParams({type:notice.kind==='SELL'?'sell':'buy',stock:stockId,...(lotId?{lot:lotId}:{})}),{state:{notificationTrade:{notice,stockId,lotId,accountId,userId:user?.id},notificationReturnTo:returnTo}});};
 const selectTrade=async(notice:TradeNotice)=>{
  setError('');if(accounts.isPending){setPendingTrade(notice);return;}const matching=(accounts.data??[]).filter(a=>a.isActive&&a.brokerName.includes('미래')&&accountMatches(notice.account,a.accountNumber??''));
  if(matching.length!==1){setError('알림의 계좌를 유일하게 확인할 수 없습니다. 계좌번호를 확인하고 수동 거래 입력을 이용해 주세요.');return;}
  if(matching[0].id!==accountId){setBusy(true);try{await authRequest('settings',{selectedAccountId:matching[0].id});setPendingTrade(notice);localStorage.setItem(selectedAccountStorageKey,matching[0].id);window.dispatchEvent(new Event('roxstock-selected-account'));}catch{setError('알림의 계좌를 선택하지 못했습니다.');}finally{setBusy(false);}return;}
  if(stocks.isPending){setPendingTrade(notice);return;}
  const matchingStocks=matchingNoticeStocks(stocks.data??[],notice);
  if(matchingStocks.length!==1){setError('종목을 정확히 확인할 수 없습니다. 종목을 등록하거나 수동 거래 입력을 이용해 주세요.');return;}
  if(notice.kind==='SELL'&&(!notice.date||!notice.quantity||!notice.price)){setError('매도일·수량·단가가 확인되지 않아 연결 매수를 선택할 수 없습니다. 수동 거래 입력을 이용해 주세요.');return;}
  const stockId=matchingStocks[0].id;setOpen(false);
  if(notice.kind==='SELL'){setLotId('');setSell({notice,stockId});}else if(notice.kind==='BUY')await openTrade(notice,stockId);else setEntry({notice,stockId,onClose:()=>setEntry(null),onSaved:()=>complete(notice)});
 };
 useEffect(()=>{if(pendingTrade&&stocks.data&&accounts.data?.some(a=>a.id===accountId&&accountMatches(pendingTrade.account,a.accountNumber??''))){setPendingTrade(null);void selectTrade(pendingTrade);}},[pendingTrade,accountId,stocks.data]);
 useEffect(()=>setPendingTrade(null),[user?.id]);
 const state=async(id:string,action:'read'|'dismiss')=>{await apiRequest('/notifications/events/'+id+'/state',{method:'POST',body:JSON.stringify({action})});await client.invalidateQueries({queryKey:['notification-inbox',user?.id]});};
 const click=async(row:typeof rows[number])=>{if(busy)return;if(row.kind!=='NEWS'&&row.kind!=='TARGET'){await selectTrade(row as TradeNotice);return;}setBusy(true);setError('');try{await apiRequest('/notifications/events/'+row.id);await closePopup();navigate('/?pushEvent='+encodeURIComponent(row.id));setOpen(false);}catch{setError('알림 화면으로 이동하지 못했습니다.');}finally{setBusy(false);}};
 useEffect(()=>{const id=new URLSearchParams(location.search).get('readNotification');if(!id||!(location.pathname==='/'||/^\/detail\/stock-news(?:\/[1-9][0-9]*)?$/.test(location.pathname)))return;void state(id,'read').catch(()=>setError('읽음 저장에 실패했습니다. 알림을 다시 확인해 주세요.'));},[location.pathname,location.search]);
 const paper={width:338,height:356,maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100dvh - 24px)',m:0,p:1.5,borderRadius:'12px',bgcolor:colors.surface,backgroundImage:'none'};
 const dismiss=async(row:typeof rows[number])=>{setBusy(true);try{if(row.kind==='NEWS'||row.kind==='TARGET')await state(row.id,'dismiss');else{await brokerNative('status',{id:row.id,status:'ignored'});await refresh();}}catch{setError('알림을 처리하지 못했습니다. 다시 시도해 주세요.');}finally{setBusy(false);}};
 return <>{total>0&&<IconButton aria-label={`알림 ${total}건`} onClick={()=>{setError('');setOpen(true);}} sx={{position:'fixed',left:{xs:16,sm:28},bottom:52,width:44,height:44,zIndex:12,bgcolor:colors.raised,color:colors.textPrimary}}><Badge badgeContent={total} max={99} sx={{'& .MuiBadge-badge':{height:16,minWidth:16,p:'0 2px',fontSize:9,bgcolor:'#bf404d',color:'#fff'}}}><NotificationsRounded/></Badge></IconButton>}
 <HistoryDialog historyEnabled={false} open={open} onClose={()=>!busy&&setOpen(false)} disableAutoFocus slotProps={{paper:{sx:paper}}}><DialogTitle aria-label="알림" sx={{p:0,mb:1,display:'flex',justifyContent:'space-between',fontSize:17,fontWeight:600}}>알림<Typography sx={{fontSize:12,color:colors.textMuted}}>{total}건</Typography></DialogTitle><DialogContent sx={{p:'0 !important',minHeight:0}}><Stack spacing={1}>{groups.map(group=><Stack key={group.account.id} spacing="6px"><Box data-testid="notification-account-header" sx={{display:'flex',alignItems:'center',gap:'8px',height:16,color:'#94a3ba',minWidth:0}}><Typography noWrap sx={{minWidth:0,flex:1,fontSize:11}}>{group.account.brokerName} · {group.account.name} {group.account.accountNumber}</Typography><Typography sx={{width:42,flexShrink:0,textAlign:'right',fontSize:11}}>{group.rows.length}건</Typography></Box>{group.rows.map(row=><NotificationCard key={row.id} kind={row.kind} title={row.title??''} detail={row.detail??''} busy={busy} onOpen={()=>void click(row)} onIgnore={()=>void dismiss(row)}/>)}</Stack>)}{error&&<Alert severity="error">{error}</Alert>}</Stack></DialogContent><Button variant="contained" onClick={()=>setOpen(false)} sx={{mt:1,height:36,minHeight:36,flexShrink:0,borderRadius:'12px'}}>닫기</Button></HistoryDialog>
 <HistoryDialog historyEnabled={false} open={!!sell} onClose={()=>setSell(null)} disableAutoFocus aria-labelledby="sell-lot-title" slotProps={{paper:{sx:{...stockDialogPaper,m:'16px 8px',width:'calc(100% - 16px)',p:'12px',borderRadius:'12px',bgcolor:colors.surface,overflow:'hidden'}}}}>
  <DialogTitle id="sell-lot-title" sx={{p:0,fontSize:17,fontWeight:600,flexShrink:0}}>연결 매수 선택</DialogTitle>
  <Typography sx={{my:1,fontSize:12,color:colors.positive,flexShrink:0,overflowWrap:'anywhere'}}>{sell?.notice.name} · 매도 {formatNoticeNumber(sell?.notice.quantity??'')}주 × {formatNoticeNumber(sell?.notice.price??'')}원</Typography>
  <DialogContent data-testid="sell-lot-list" sx={{p:'0 !important',minHeight:0,overflowY:'auto'}}><Stack spacing={1}>
   {lots.isPending?<Typography>매수 조회 중</Typography>:lots.isError?<Alert severity="error">매수 조회 실패<Button onClick={()=>void lots.refetch()}>다시 시도</Button></Alert>:!candidates.length?<Typography>동일 계좌·종목에 매도일 이전 매수 중 잔여수량이 충분한 매수가 없습니다.</Typography>:candidates.map(l=>{const amounts=candidateAmounts(l,sell!.notice)!,color=getMarketColor(amounts.sign);return <ButtonBase key={l.id} data-testid={'sell-candidate-'+l.id} onClick={()=>{choice.current={scope:selectionScope,id:l.id};setLotId(l.id);}} aria-pressed={validLotId===l.id} sx={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:'4px',textAlign:'left',p:'8px 10px',borderRadius:'8px',bgcolor:validLotId===l.id?'#173057':colors.raised,border:'1.5px solid '+(validLotId===l.id?'#f5c240':'transparent'),color,fontWeight:600}}>
    <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'6px',minHeight:19}}><Box sx={{display:'flex',alignItems:'center',gap:'6px',flexShrink:0}}><Box sx={{width:28,height:18,borderRadius:'4px',bgcolor:tones.BUY,color:'#fff',fontSize:9,display:'grid',placeItems:'center'}}>매수</Box><Typography sx={{fontSize:11,fontWeight:600,color:'#fff'}}>{seoulTradeDate(l.boughtAt)?.slice(5).replace('-','/')}</Typography></Box><Typography data-testid="candidate-profit" sx={{fontSize:12,fontWeight:600,textAlign:'right',overflowWrap:'anywhere',minWidth:0}}>{formatCandidateAmount(amounts.profit,true)}</Typography></Box>
    <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'6px',minHeight:19}}><Typography sx={{fontSize:11,fontWeight:600,minWidth:0,overflowWrap:'anywhere'}}>{formatNoticeNumber(l.remainingQuantity)} × {formatNoticeNumber(l.unitPrice)}원</Typography><Typography data-testid="candidate-total" sx={{fontSize:11,fontWeight:600,textAlign:'right',minWidth:0,overflowWrap:'anywhere'}}>{formatCandidateAmount(amounts.total)}</Typography></Box>
   </ButtonBase>;})}
  </Stack></DialogContent>
  <Button variant="contained" disabled={!validLotId||lots.isFetching} sx={{mt:1,height:36,minHeight:36,flexShrink:0,borderRadius:'12px'}} onClick={()=>{if(!sell||lots.isFetching||!validLotId)return;void openTrade(sell.notice,sell.stockId,validLotId);}}>선택 후 매도 등록</Button>
 </HistoryDialog>
 <HistoryDialog historyEnabled={false} open={!!entry} onClose={()=>!busy&&setEntry(null)} disableAutoFocus slotProps={{paper:{sx:{width:370,height:364,maxWidth:'100vw',maxHeight:'calc(100dvh - 16px)',m:0,borderRadius:'8px',bgcolor:colors.canvas}}}}><DialogTitle sx={{height:44,minHeight:44,boxSizing:'border-box',p:1,display:'flex',gap:1,alignItems:'center',fontSize:16,fontWeight:600}}><IconButton aria-label="알림 등록 닫기" disabled={busy} onClick={()=>setEntry(null)} sx={{width:20,height:28,p:0}}><Box component="img" src="/stocks-v03/back.svg" alt="" sx={{width:20,height:20}}/></IconButton>{entry?labels[entry.notice.kind]:''} 등록</DialogTitle><DialogContent sx={{p:'0 8px 8px !important',overflowY:'auto'}}><StockInputContext.Provider value={{inDialog:true,setTitle:()=>{},setBusy}}><HeaderSlotContext.Provider value={null}><Suspense fallback={<Typography>등록 화면 준비 중</Typography>}>{entry&&(entry.notice.kind==='DIVIDEND'?<LiveCashPage notification={entry}/>:null)}</Suspense></HeaderSlotContext.Provider></StockInputContext.Provider></DialogContent></HistoryDialog>
 </>;
}
