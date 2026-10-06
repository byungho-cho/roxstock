import {useRef,useState} from 'react';
import {Box,Button,Stack,Typography} from '@mui/material';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useParams} from 'react-router-dom';
import {getTradeDetail,getBuyLots,deleteTrade} from '../../data/roxstockApi';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {useListNavigation,useReturnNavigation} from '../../hooks/navigation/usePageMemory';
import {PageHeader} from '../../components/navigation/Navigation';
import {ConfirmActionDialog} from '../../components/common/ConfirmActionDialog';
import {colors} from '../../styles/tokens';
import {formatWon,getMarketColor} from '../../utils/format';
export function TradeDetailPage(){
 const {type:raw,tradeId=''}=useParams(),type=raw==='sell'?'sell':'buy';const {accountId}=useActiveAccount(),back=useReturnNavigation('/journal?view=profit'),navigate=useListNavigation(),client=useQueryClient();
 const detail=useQuery({queryKey:['tradeDetail',accountId,type,tradeId],queryFn:()=>getTradeDetail(type,tradeId,accountId),enabled:!!accountId});
 const lots=useQuery({queryKey:['allBuyLots',accountId,detail.data?.security.id],queryFn:()=>getBuyLots(accountId!,detail.data!.security.id,false),enabled:!!accountId&&!!detail.data&&type==='sell'});
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 const t=detail.data,lot=lots.data?.find(l=>l.id===t?.buyTradeId),q=Number(t?.quantity),amount=q*Number(t?.unitPrice),cost=q*Number(lot?.unitPrice),profit=amount-cost;
 const blocked=type==='buy'&&!!t?.sellTrades?.length;
 const remove=async()=>{if(!t||t.account.id!==accountId||blocked||lock.current)return;lock.current=true;setBusy(true);try{await deleteTrade(type,tradeId,false,accountId);await Promise.all(['stocks','dashboard','buyLots','allBuyLots','stockTrades','journalTrades','tradeDetail'].map(key=>client.invalidateQueries({queryKey:[key]})));back();}catch(e){setError(e instanceof Error?e.message:'삭제 실패');}finally{lock.current=false;setBusy(false);}};
 const header=<PageHeader embedded title={type==='buy'?'매수 거래 상세':'매도 거래 상세'} showAdd={false} onBack={back}/>;
 if(!t)return <>{header}{detail.isError?<Button onClick={()=>void detail.refetch()}>거래 조회 실패 · 다시 시도</Button>:<Typography>거래 정보를 불러오는 중입니다.</Typography>}</>;
 const date=new Date((t.boughtAt??t.soldAt)!).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).replaceAll('-','.');
 const panel={border:`1px solid ${colors.border}`,borderRadius:'8px',bgcolor:colors.surface};
 const row=(label:string,value:string,middle?:string,color:string=colors.textPrimary)=><Box key={label} sx={{display:'flex',alignItems:'center',gap:'4px',minHeight:32,borderBottom:`1px solid ${colors.border}`,fontSize:12}}><Typography sx={{width:64,fontSize:11,color:colors.textMuted}}>{label}</Typography>{middle&&<Typography sx={{flex:1,textAlign:'right',fontSize:10,color:colors.textMuted}}>{middle}</Typography>}<Typography sx={{flex:1,fontSize:12,textAlign:'right',color}}>{value}</Typography></Box>;
 return <>{header}<Stack spacing="8px" sx={{pb:'80px'}}><Box sx={{...panel,p:'12px 16px',minHeight:104,boxSizing:'border-box'}}><Stack direction="row" spacing={1} sx={{alignItems:'center',mb:'7px'}}><Typography sx={{fontSize:11,p:'2px 8px',border:`1px solid ${colors.borderStrong}`,color:type==='buy'?colors.textPrimary:colors.marketRise}}>{type==='buy'?'매수':'매도'}</Typography><Typography sx={{fontSize:11,color:colors.textMuted}}>{date}</Typography></Stack><Stack direction="row" sx={{justifyContent:'space-between'}}><Typography sx={{fontSize:16,fontWeight:600}}>{t.security.name}</Typography><Typography sx={{fontSize:16,fontWeight:600,color:type==='sell'?getMarketColor(profit):colors.textPrimary}}>{formatWon(type==='sell'?profit:amount)}</Typography></Stack><Stack direction="row" sx={{justifyContent:'space-between',fontSize:11,color:colors.textMuted,mt:'7px'}}><span>{t.security.symbol}</span><span>{q}주 × {formatWon(Number(t.unitPrice))}</span></Stack></Box>
 <Typography sx={{fontSize:13,fontWeight:600}}>거래 정보</Typography><Box sx={{...panel,bgcolor:colors.raised,px:'16px',py:'2px'}}>{row('거래일자',date)}{row('매수내역',formatWon(type==='buy'?amount:cost),`${q}주 × ${formatWon(type==='buy'?Number(t.unitPrice):Number(lot?.unitPrice))}`)}{type==='sell'&&<>{row('매도내역',formatWon(amount),`${q}주 × ${formatWon(Number(t.unitPrice))}`)}{row('실현손익',formatWon(profit),undefined,getMarketColor(profit))}</>}</Box>
 {lots.isError&&type==='sell'&&<Button onClick={()=>void lots.refetch()}>연결 매수 조회 실패 · 다시 시도</Button>}
 <Stack direction="row" sx={{...panel,px:'16px',py:'8px',justifyContent:'space-between',fontSize:11,color:colors.textMuted,gap:1}}><span>메모</span><span>{t.memo||'등록된 메모 없음'}</span></Stack>
 {error&&<Typography role="alert">{error}</Typography>}<Stack direction="row" spacing="12px"><Button variant="outlined" onClick={()=>setConfirm(true)} sx={{width:104,height:32,minHeight:32}}>삭제</Button><Button variant="contained" onClick={()=>navigate(`/trade?type=${type}&stock=${t.security.id}&edit=${t.id}${t.buyTradeId?`&lot=${t.buyTradeId}`:''}`)} sx={{flex:1,height:32,minHeight:32}}>거래 수정</Button></Stack>
 <ConfirmActionDialog open={confirm} title={type==='buy'?'매수 기록을 삭제할까요?':'거래내역을 삭제할까요?'} name={t.security.name} detail={`${date} · ${type==='buy'?'매수':'매도'}`} amount={formatWon(amount)} onClose={()=>setConfirm(false)} onConfirm={()=>void remove()} busy={busy} disabled={blocked}>{blocked?'연결된 매도가 있어 삭제할 수 없습니다.':'삭제한 거래내역은 복구할 수 없어요.'}<br/>예수금은 자동 변경되지 않습니다.</ConfirmActionDialog></Stack></>;
}
