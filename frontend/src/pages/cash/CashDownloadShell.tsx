import {Box,Button,IconButton,Stack,Typography} from '@mui/material';
import {ChevronLeftRounded,ChevronRightRounded} from '@mui/icons-material';
import {AppCard} from '../../components/common/Common';
import {PageHeader} from '../../components/navigation/Navigation';
import {usePageMemory} from '../../hooks/navigation/usePageMemory';
import {colors} from '../../styles/tokens';
import {CashTrendFrame} from './CashTrendFrame';
import {cashRange,cashToday,monthShift} from './cashData';

export function CashDownloadShell(){
 const initialMonth=cashToday().slice(0,7);
 const [mode,setMode]=usePageMemory<'month'|'year'>('cashMode','month',{adoptInitialAccount:true});
 const [month,setMonth]=usePageMemory('cashMonth',initialMonth,{adoptInitialAccount:true});
 const [year,setYear]=usePageMemory('cashYear',Number(initialMonth.slice(0,4)),{adoptInitialAccount:true});
 const move=(step:number)=>mode==='month'?setMonth(monthShift(month,step)):setYear(year+step);
 return <Box data-testid="cash-download-shell" aria-busy className="rox-home" sx={{height:'100%',minHeight:0,fontFamily:'RoxHomeInter, sans-serif','& .MuiButton-root':{minHeight:0}}}>
  <PageHeader embedded title="예수금" showBack={false} action={<IconButton aria-label="예수금 등록" disabled sx={{width:32,height:32,p:0,bgcolor:colors.raised,fontSize:22}}>+</IconButton>}/>
  <Box sx={{height:'100%',minHeight:0,overflowY:{xs:'auto',sm:'hidden'},pb:{xs:'80px',sm:0},boxSizing:'border-box'}}>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:'8px',height:{sm:'100%'},minHeight:0}}>
    <Stack spacing="8px" sx={{minWidth:0,minHeight:0,overflowY:{sm:'auto'},pb:{sm:'80px'},height:{sm:'100%'},boxSizing:'border-box',scrollbarWidth:'none'}}>
     <AppCard sx={{height:96,flexShrink:0,p:'10px 16px 6px',borderRadius:'8px',display:'flex',flexDirection:'column',gap:'3px'}}>
      <Stack direction="row" sx={{height:22,alignItems:'center',justifyContent:'space-between'}}><Typography sx={{fontSize:12,color:colors.textSecondary}}>현재 예수금</Typography><Box component="img" src="/cash-v04/edit.svg" alt="" sx={{width:16,height:16}}/></Stack>
      <Box sx={{minHeight:34}}/><Typography sx={{fontSize:10,lineHeight:'15px',color:colors.marketFall}}>올해 제세금</Typography>
     </AppCard>
     <AppCard sx={{minHeight:102,flexShrink:0,px:'14px',pt:'12px',pb:'11px',borderRadius:'8px'}}>
      <Stack direction="row" sx={{height:24,alignItems:'center'}}>
       <IconButton aria-label="이전 기간" onClick={()=>move(-1)} sx={{width:24,height:24,p:0}}><ChevronLeftRounded sx={{fontSize:16}}/></IconButton>
       <Button aria-label="기간 직접 선택" disabled sx={{flex:1,minWidth:0,p:0,fontSize:15,fontWeight:600,'&.Mui-disabled':{color:colors.textPrimary}}}>{mode==='month'?month.replace('-','.'):`${year}년`}</Button>
       <IconButton aria-label="다음 기간" disabled={mode==='month'?month>=initialMonth:year>=Number(initialMonth.slice(0,4))} onClick={()=>move(1)} sx={{width:24,height:24,p:0}}><ChevronRightRounded sx={{fontSize:16}}/></IconButton>
       <Button aria-label="월간 연간 전환" onClick={()=>setMode(mode==='month'?'year':'month')} sx={{ml:'8px',width:54,minWidth:54,height:22,p:0,borderRadius:'11px',bgcolor:colors.raised,color:colors.focus,fontSize:10}}>{mode==='month'?'월간':'연간'}</Button>
      </Stack>
      <Box sx={{height:'1px',bgcolor:colors.border,my:'7px'}}/>
      <Stack direction="row" spacing="8px" sx={{height:38}}>{['출금','입금','배당'].map((label,index)=><Box key={label} sx={{flex:1,minWidth:0,pr:index<2?'8px':0,borderRight:index<2?'1px solid '+colors.border:undefined}}><Typography sx={{fontSize:11,lineHeight:'15px',color:index===0?colors.marketFall:colors.marketRise}}>{label}</Typography></Box>)}</Stack>
     </AppCard>
     <CashTrendFrame range={cashRange(mode,month,year)} pending/>
    </Stack>
    <Box sx={{minWidth:0,minHeight:0,overflowY:{sm:'auto'},pb:{sm:'80px'},height:{sm:'100%'},boxSizing:'border-box'}}>
     <AppCard sx={{borderRadius:'8px',p:'13px 14px',minWidth:0,display:'flex',flexDirection:'column',gap:'6px'}}>
      <Stack direction="row" sx={{height:22,alignItems:'center'}}><Typography sx={{fontSize:16,fontWeight:600}}>변경내역</Typography></Stack>
      <Box sx={{display:'grid',gridTemplateColumns:'36px 36px minmax(0,.7fr) minmax(0,1.3fr)',gap:'4px',height:16,color:colors.textMuted,fontSize:10}}>{['구분','날짜','제세금','잔액(세후)'].map((label,i)=><Box key={label} sx={{textAlign:i>1?'right':'left'}}>{label}</Box>)}</Box>
      <Box sx={{height:84,flexShrink:0}}/><Button disabled sx={{height:36,flexShrink:0,minWidth:0,p:0,fontSize:11}}>이전 1개월 불러오기</Button>
     </AppCard>
    </Box>
   </Box>
  </Box>
 </Box>;
}
