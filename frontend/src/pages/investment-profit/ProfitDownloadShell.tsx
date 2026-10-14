import {Box,Button,Stack} from '@mui/material';
import {useLocation} from 'react-router-dom';
import {PageHeader} from '../../components/navigation/Navigation';
import {usePageMemory,useReturnNavigation} from '../../hooks/navigation/usePageMemory';
import {seoulToday} from '../investment/investmentData';
import {ProfitEmptyList,ProfitEmptyDetail} from './ProfitEmptyFrame';
import {colors} from '../../styles/tokens';
export function ProfitDownloadShell(){
 const back=useReturnNavigation('/assets'),location=useLocation(),params=new URLSearchParams(location.search),scope=params.get('securityId');
 const [savedTab,setTab]=usePageMemory<'year'|'stock'>('profit-tab:'+(scope??'all'),params.get('profitDetail')==='stock'?'stock':'year',{adoptInitialAccount:true});
 const [year]=usePageMemory('profit-year:'+(scope??'all'),params.get('year')??seoulToday().slice(0,4),{adoptInitialAccount:true});
 const [ascending,setAscending]=usePageMemory('profit-sort-ascending',false,{adoptInitialAccount:true});
 const toggle=<Button aria-label={ascending?'손익액 내림차순 정렬':'손익액 오름차순 정렬'} onClick={()=>setAscending(!ascending)} sx={{minWidth:32,p:0,fontSize:11}}>{ascending?'↑':'↓'}</Button>;
 const tab=scope?'year':savedTab,detail=params.has('profitDetail');
 const column={minWidth:0,minHeight:0,overflowY:{xs:'visible',sm:'auto'},pb:{sm:'80px'},scrollbarWidth:'none'};
 return <><PageHeader embedded title="투자손익" showAdd={false} onBack={back} showBack={!!(location.state?.profitEntryFromStock||location.state?.profitLinkedEntry||location.state?.analysisContext)} showBackTablet={!!(location.state?.profitEntryFromStock||location.state?.profitLinkedEntry)} backIcon={<Box component="span" sx={{fontSize:28}}>‹</Box>}/><Box data-testid="profit-download-shell" className="rox-home" aria-busy sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:'8px',height:{sm:'100%'},minHeight:0}}>
  <Stack spacing="8px" useFlexGap sx={{...column,display:{xs:detail?'none':'flex',sm:'flex'}}}><Stack direction="row" spacing="8px" sx={{height:32,flexShrink:0}}>{(scope?(['year'] as const):(['year','stock'] as const)).map(value=><Button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)} sx={{flex:1,minWidth:0,minHeight:32,height:32,p:0,borderRadius:'10px',bgcolor:tab===value?'#151E2F':'#111927',color:tab===value?'#FAC71F':colors.textMuted,fontSize:12,fontWeight:600}}>{value==='year'?'연도별':'종목별'}</Button>)}</Stack><ProfitEmptyList stock={tab==='stock'} scoped={!!scope} toggle={toggle}/></Stack>
  <Stack spacing="8px" useFlexGap sx={{...column,display:{xs:detail?'flex':'none',sm:'flex'}}}><ProfitEmptyDetail stock={tab==='stock'} scoped={!!scope} year={year}/></Stack>
 </Box></>;
}
