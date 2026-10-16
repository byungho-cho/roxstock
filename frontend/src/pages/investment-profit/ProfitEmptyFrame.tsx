import type {ReactNode} from 'react';
import {Box,Stack,Typography} from '@mui/material';
import {AppCard} from '../../components/common/Common';
import {colors} from '../../styles/tokens';
const card={border:0,borderRadius:'8px',bgcolor:'#111927',p:'8px 15px',minWidth:0,flexShrink:0};
export function ProfitEmptyList({stock=false,scoped=false,toggle}:{stock?:boolean;scoped?:boolean;toggle?:ReactNode}){
 return <><AppCard data-testid="profit-cumulative" sx={{...card,p:'8px 15px',minHeight:72}}><Typography sx={{fontSize:12,lineHeight:'18px',color:colors.textMuted}}>누적 투자손익</Typography><Box data-testid="profit-total" sx={{height:27}}/><Typography sx={{fontSize:10,lineHeight:'12px',mt:'1px',textAlign:'right',color:colors.textMuted}}>누적 수익률</Typography></AppCard>
 <AppCard data-testid="profit-list" sx={card}>
  {stock?<Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center'}}><Typography sx={{fontSize:12,fontWeight:600,lineHeight:'24px'}}>종목별 누적 수익</Typography>{toggle}</Stack>:<Box sx={{display:'grid',gridTemplateColumns:'40px minmax(0,1fr) minmax(60px,21%) minmax(0,34%)',gap:'4px',minHeight:24,mb:'4px',alignItems:'center'}}>{['연도',scoped?'매수총액':'투자금','손익률','손익총액'].map((label,i)=><Typography key={label} sx={{fontSize:i?10:12,lineHeight:'14px',fontWeight:500,textAlign:i?'right':'left',color:colors.textMuted}}>{label}</Typography>)}</Box>}
  <Box sx={{minHeight:84}}/>
 </AppCard></>;
}
export function ProfitEmptyDetail({stock=false,scoped=false,year=''}:{stock?:boolean;scoped?:boolean;year?:string}){
 const labels=stock||scoped?['매수총액','매도총액','매매손익','배당포함 총손익']:['투자금','손익총액','배당','배당포함'];
 return <><Box sx={{minHeight:32,display:'grid',placeItems:'center'}}><Typography sx={{fontSize:18,lineHeight:'24px',fontWeight:700}}>{stock?'':year?year+'년':''}</Typography></Box>
 <AppCard data-testid="profit-detail-summary" sx={{...card,py:'8px'}}>{stock&&<Typography sx={{fontSize:12,fontWeight:600,lineHeight:'24px'}}>전체 거래 요약</Typography>}{labels.map((label,i)=><Box key={label}><Typography sx={{fontSize:12,lineHeight:'20px',minHeight:24}}>{label}</Typography>{!stock&&!scoped&&i===0&&<Typography sx={{fontSize:10,lineHeight:'14px',color:colors.textMuted}}>기준일:</Typography>}</Box>)}</AppCard>
 {[stock?'연도별 손익':'종목별 손익',stock?'월별 손익 · 배당 내역':'월별 손익'].map(label=><AppCard key={label} sx={card}><Typography sx={{fontSize:12,fontWeight:600,lineHeight:'24px'}}>{label}</Typography><Box sx={{minHeight:72}}/></AppCard>)}</>;
}
