import {useLocation} from 'react-router-dom';
import {Box,Button,Stack,Typography,useMediaQuery} from '@mui/material';
import {useListNavigation,usePageMemory} from '../../hooks/navigation/usePageMemory';
import {PageHeader} from '../../components/navigation/Navigation';
import {AppCard} from '../../components/common/Common';
import {CompositionCard} from './CompositionCard';
import {DashboardTrend} from './DashboardTrend';
import {AssetAnalysisChart} from './AssetAnalysisChart';
import {analysisPeriods,analysisRange,type AnalysisPeriod} from './analysisPeriod';
import {unavailableSummary} from '../dashboard/HomeSummaryCards';
import {colors} from '../../styles/tokens';
export function AssetOverviewDownloadShell(){const tablet=useMediaQuery('(min-width:600px)'),navigate=useListNavigation();
 const [mode,setMode]=usePageMemory<'ranked'|'cumulative'>('asset-weight-mode','ranked',{adoptInitialAccount:true});
 const supplied=new URLSearchParams(useLocation().search).get('period');
 const [period,setPeriod]=usePageMemory<AnalysisPeriod>('dashboard-analysis-period-ytd',analysisPeriods.some(item=>item.value===supplied)?supplied as AnalysisPeriod:'ytd',{adoptInitialAccount:true});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 return <><PageHeader title="대시보드" variant="detail" backPath="/" showBackTablet showAdd={false} assetOverview embedded backIcon={<Box component="span" sx={{fontSize:30,lineHeight:'30px'}}>‹</Box>} action={<Box sx={{width:44,flexShrink:0}}/>}/>
 <Box data-testid="asset-overview" data-code-loading className="rox-home" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:'8px',alignItems:'stretch'}}>
 <CompositionCard summary={unavailableSummary} items={[]} mode={mode} onToggle={()=>setMode(v=>v==='ranked'?'cumulative':'ranked')} loading updating={false} allocationAvailable={false} retry={()=>{}} onHome={()=>navigate('/')} onStocks={()=>navigate('/stocks?tab=holding')} onStock={()=>{}} trend={tablet?null:<DashboardTrend points={[]} pending failed={false} retry={()=>{}}/>}/>
 {tablet&&<Stack data-testid="dashboard-analysis-panel" spacing="8px" sx={{minWidth:0}}>
 <AppCard data-testid="analysis-performance" sx={{border:0,borderRadius:'8px',px:'16px',py:'8px',minWidth:0,flexShrink:0}}><Box sx={{pt:0,pb:'4px',borderBottom:'1px solid '+colors.border}}><Typography sx={{fontSize:16,fontWeight:600,lineHeight:'23px'}}>기간 성과 구성</Typography></Box><Stack spacing="4px" sx={{mt:'4px',minHeight:92}}>{['기간 시작자산','기간 종료자산','기간 투자손익','투자수익률'].map(label=><Typography key={label} sx={{height:20,fontSize:12,lineHeight:'20px',color:colors.textSecondary}}>{label}</Typography>)}</Stack></AppCard>
 <AppCard data-testid="analysis-trend" sx={{border:0,borderRadius:'8px',px:'16px',py:'8px',minWidth:0,flexShrink:0}}><Stack direction="row" sx={{minHeight:23,gap:'4px',alignItems:'center'}}><Typography sx={{fontSize:16,fontWeight:600,lineHeight:'23px'}}>자산추이</Typography><Typography sx={{fontSize:10,color:colors.textMuted}}>(상세보기)</Typography></Stack><Box data-testid="analysis-chart-region" sx={{height:224,display:'flow-root'}}><AssetAnalysisChart points={[]} period={period} range={analysisRange(period,today)}/></Box><Stack direction="row" sx={{gap:'4px',mt:'8px'}}>{analysisPeriods.map(item=><Button key={item.value} aria-pressed={period===item.value} onClick={()=>setPeriod(item.value)} sx={{flex:1,minWidth:0,height:24,minHeight:24,p:0,borderRadius:'4px',fontSize:10,bgcolor:period===item.value?colors.buttonPrimary:colors.raised,color:period===item.value?colors.textPrimary:colors.textSecondary}}>{item.label}</Button>)}</Stack></AppCard>
 </Stack>}</Box></>;
}
