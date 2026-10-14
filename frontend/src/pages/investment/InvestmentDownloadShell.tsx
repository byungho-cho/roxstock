import {Box,Button,ButtonBase,Stack,Typography} from '@mui/material';
import {AppCard} from '../../components/common/Common';
import {PageHeader} from '../../components/navigation/Navigation';
import {usePageMemory} from '../../hooks/navigation/usePageMemory';
import {InvestmentChart} from './InvestmentChart';
import {periodRange,quarters,quarterAvailable,seoulToday,type Quarter} from './investmentData';
import {colors} from '../../styles/tokens';
const card={border:0,borderRadius:'8px',bgcolor:'#0F1726',p:'12px 16px',minWidth:0,flexShrink:0};
const small={fontSize:10,lineHeight:'14px',color:colors.textMuted};
export function InvestmentDownloadShell(){
 const today=seoulToday(),currentYear=Number(today.slice(0,4));
 const [year,setYear]=usePageMemory('investment-year',currentYear,{adoptInitialAccount:true});
 const [quarter,setQuarter]=usePageMemory<Quarter>('investment-quarter',0,{adoptInitialAccount:true});
 const selected=quarterAvailable(year,quarter,today)?quarter:0;
 const changeYear=(step:number)=>{const n=year+step<2010?currentYear:year+step>currentYear?2010:year+step;if(!quarterAvailable(n,selected,today))setQuarter(0);setYear(n);};
 return <><PageHeader embedded title="투자금" showAdd={false}/><Box data-testid="investment-download-shell" className="rox-home" aria-busy sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:'8px',height:{sm:'100%'},minHeight:0}}>
  <Stack spacing="8px" sx={{minWidth:0,minHeight:0,overflowY:{xs:'visible',sm:'auto'},pb:{sm:'80px'},scrollbarWidth:'none'}}>
   <Box sx={{height:34,flexShrink:0,display:'grid',gridTemplateColumns:'32px minmax(0,1fr) 32px',alignItems:'center',px:'12px',borderRadius:'8px',bgcolor:'#151E2F'}}><ButtonBase aria-label="이전 연도" onClick={()=>changeYear(-1)} sx={{width:32,height:32}}><Box component="img" src="/investment-prev.svg" alt=""/></ButtonBase><Typography sx={{textAlign:'center',fontSize:14,fontWeight:600}}>{year}년</Typography><ButtonBase aria-label="다음 연도" onClick={()=>changeYear(1)} sx={{width:32,height:32}}><Box component="img" src="/investment-next.svg" alt=""/></ButtonBase></Box>
   <AppCard sx={{...card,py:'8px'}}><Typography sx={small}>현재 평가금액 ·</Typography><Box sx={{height:30,my:'6px'}}/><Typography sx={{fontSize:11,lineHeight:'18px'}}>{year===currentYear?'올해 평가손익':`${year}년 누적 매매손익`}</Typography>{year===currentYear&&<Typography sx={{...small,mt:'4px'}}>올해 실현손익 + 현재가 기준 잔여 Lot 평가손익 · 예수금·배당 제외</Typography>}</AppCard>
   <AppCard sx={card}><Box sx={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'8px'}}>{['초기투자금','누적투자금','배당'].map((label,i)=><Box key={label} sx={{minWidth:0,pl:i?'8px':0,borderLeft:i?'1px solid '+colors.border:undefined,color:i===2?colors.marketRise:undefined}}><Typography sx={{fontSize:12,fontWeight:600}}>{label}</Typography><Box sx={{mt:'3px',height:15}}/></Box>)}</Box></AppCard>
   <AppCard sx={{...card,bgcolor:'#111927',pt:'6px',pb:'8px'}}><Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center'}}><Typography sx={{fontSize:12,fontWeight:600}}>일별 평가금액 · 추이</Typography><Button disabled sx={{fontSize:10,minHeight:28}}>상세보기 ›</Button></Stack><Box data-testid="investment-chart-region" sx={{height:188,display:'flow-root'}}><InvestmentChart points={[]} {...periodRange(year,selected,today)}/></Box><Stack direction="row" spacing="4px" sx={{mt:'8px'}}>{quarters.map(value=><Button key={value} aria-pressed={selected===value} disabled={!quarterAvailable(year,value,today)} onClick={()=>setQuarter(value)} sx={{flex:1,minWidth:0,p:0,height:28,minHeight:28,borderRadius:'8px',fontSize:11,fontWeight:600,bgcolor:selected===value?'#337DF5':'#1A2433',color:selected===value?'white':'#A6B2C4'}}>{value?`${value}분기`:'전체'}</Button>)}</Stack></AppCard>
  </Stack>
  <Stack sx={{minWidth:0,minHeight:0,pb:{sm:'80px'},overflowY:{sm:'auto'},scrollbarWidth:'none'}}><AppCard sx={card}><Typography sx={{fontSize:16,fontWeight:600,mb:'8px'}}>투자내역</Typography><Box sx={{display:'grid',gridTemplateColumns:'48px repeat(3,minmax(0,1fr))',gap:'4px',minHeight:20,alignItems:'center'}}>{['날짜','투자금','평가금액','일별손익'].map((label,i)=><Typography key={label} sx={{...small,textAlign:i?'right':'left'}}>{label}</Typography>)}</Box><Box sx={{minHeight:84}}/><Typography sx={{...small,mt:'8px'}}>초기투자금 기준: · 배당은 선택 연도 세후 금액</Typography></AppCard></Stack>
 </Box></>;
}
