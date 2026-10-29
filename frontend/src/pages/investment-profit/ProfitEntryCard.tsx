import {Box,Card,Typography} from '@mui/material';
import {amount,rate,won} from './profitData';
import {seoulTradeDate,tradeHoldingDays} from '../../utils/tradeDates';
import type {ProfitEntries} from './profitDetailApi';

type Entry=ProfitEntries['rows'][number];
export function ProfitEntryCard({entry,showSecurity}:{entry:Entry;showSecurity:boolean}){
 const t=entry.trade,dividend=entry.kind==='DIVIDEND',color=Number(entry.amount)===0?'#F0F2F7':entry.amount.startsWith('-')?'#60A5FA':'#FB7185';
 const days=t?tradeHoldingDays(t.boughtAt,entry.at):null;
 const date=(s:string)=>seoulTradeDate(s)?.replaceAll('-','.')??'—';
 const line=(label:string,formula:string,at:string,value:string|null,tint='#F0F2F7')=><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr) 68px auto',sm:'minmax(0,1fr) 105px minmax(0,1fr)'},alignItems:'baseline',gap:'4px 8px',py:'2px',color:tint}}><Box sx={{fontSize:12,overflowWrap:'anywhere'}}>{label}　{formula}</Box><Typography sx={{fontSize:{xs:9,sm:10},color:'#9CA3AF'}}>[{date(at)}]</Typography><Typography sx={{fontSize:{xs:12,sm:14},fontWeight:600,textAlign:'right',overflowWrap:'anywhere'}}>{won(amount(value))}</Typography></Box>;
 return <Card data-testid="profit-entry-card" data-entry-id={entry.key} data-focus-month={entry.date.slice(0,7)} data-entry-kind={entry.kind} sx={{p:'8px 12px',borderRadius:'8px',bgcolor:'#101725',border:'1px solid #2E384A',minWidth:0}}>
  {showSecurity&&<Typography sx={{fontSize:12,fontWeight:600,mb:'4px'}}>{entry.security.name}({entry.security.symbol})</Typography>}
  <Box sx={{display:'flex',gap:'16px',alignItems:'baseline',flexWrap:'wrap',pb:'4px',mb:'4px',borderBottom:'1px solid #2E384A'}}>
   <Typography sx={{fontSize:16,fontWeight:600,color}}>{won(amount(entry.amount),true)}</Typography><Typography sx={{fontSize:16,fontWeight:600,color}}>{rate(amount(entry.amount),amount(entry.rateDenominator))}</Typography>
   {dividend?<Typography sx={{fontSize:11,color:'#F7C44A'}}>배당</Typography>:days!==null&&<Typography sx={{fontSize:10,color:'#fff'}}>보유 {days}일</Typography>}
  </Box>
  {t?<>{line('매수',`${Number(t.quantity).toLocaleString('ko-KR',{maximumFractionDigits:4})} × ${won(amount(t.buyUnitPrice))}`,t.boughtAt,t.buyAmount)}{line('매도',`${Number(t.quantity).toLocaleString('ko-KR',{maximumFractionDigits:4})} × ${won(amount(t.sellUnitPrice))}`,entry.at,t.sellAmount,color)}</>:dividend?<>{entry.dividend&&line('세전 배당','',entry.at,entry.dividend.grossAmount)}{line('입금 배당','',entry.at,entry.amount,color)}</>:<Typography sx={{fontSize:12,color:'#9CA3AF'}}>거래 상세 근거를 확인할 수 없습니다.</Typography>}
 </Card>;
}
