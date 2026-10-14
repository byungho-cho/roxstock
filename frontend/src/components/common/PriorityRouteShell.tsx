import {StockTabs} from '../../pages/stocks/StockTabs';
import {StockLoadingRows} from '../../pages/stocks/StockLoadingRows';
import {TabletStockTable} from '../../pages/stocks/TabletStockTable';
import {usePageMemory} from '../../hooks/navigation/usePageMemory';
import {StockToolbar} from '../../pages/stocks/StockToolbar';
import {stockTabs,defaultSort,type StockSort} from '../../pages/stocks/stockMath';
import type {StockListType} from '../../types/models';
import {HeaderAddButton} from '../navigation/HeaderAddButton';
import {Tabs,Tab,useMediaQuery} from '@mui/material';
import {Box,Button,Stack,Typography} from '@mui/material';
import {useLocation,useNavigate} from 'react-router-dom';
import {PageHeader} from '../navigation/Navigation';
import {AppCard} from './Common';
import {DelayedSkeleton as Skeleton} from './DelayedSkeleton';
import {colors} from '../../styles/tokens';
import {analysisPeriods,analysisRange,type AnalysisPeriod} from '../../pages/assets/analysisPeriod';
import {AssetAnalysisChart} from '../../pages/assets/AssetAnalysisChart';

/** Small code-download shell; page memory shares the existing account query. */
export function PriorityRouteShell(){
 const location=useLocation(),navigate=useNavigate(),params=new URLSearchParams(location.search),tablet=useMediaQuery('(min-width:600px)');
 const [assetPeriod,setAssetPeriod]=usePageMemory<AnalysisPeriod>('analysis-period',analysisPeriods.some(p=>p.value===params.get('period'))?params.get('period') as AnalysisPeriod:'1y',{adoptInitialAccount:true});
 const [query,setQuery]=usePageMemory('stockQuery','',{adoptInitialAccount:true}),[sorting,setSorting]=usePageMemory<Partial<Record<StockListType,{key:StockSort;descending:boolean}>>>('stockSorting',{},{adoptInitialAccount:true});
 if(location.pathname==='/stocks'){const active=stockTabs.find(t=>t.value===params.get('tab'))?.value??'holding',sort=sorting[active]??defaultSort(active);return <Stack spacing={1}><PageHeader embedded title="종목목록" showAdd={false} action={<HeaderAddButton label="종목 추가" onClick={()=>navigate('/stocks/add?type='+active)}/>}/><Stack direction={tablet?'row':'column'} spacing={1}><StockTabs active={active} tablet={tablet} changeTab={tab=>{params.set('tab',tab);navigate({search:params.toString()},{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});}}/><Box sx={{flex:1,minWidth:0}}><StockToolbar query={query} onQuery={setQuery} sort={sort.key} descending={sort.descending} tab={active} onSort={key=>setSorting({...sorting,[active]:{...sort,key}})} onDirection={()=>setSorting({...sorting,[active]:{...sort,descending:!sort.descending}})} compact={tablet}/></Box></Stack><Box sx={{height:26}}><Skeleton width={64} height={18}/></Box>{tablet?<TabletStockTable stocks={[]} activeTab={active} loading favoriteIds={new Set()} onSelect={()=>{}}/>:<StockLoadingRows active={active}/>}</Stack>;}
 if(location.pathname==='/assets'){
  const title={fontSize:16,fontWeight:600,lineHeight:'23px'},today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const labels=['기간 시작자산','기간 종료자산','기간 투자손익','투자수익률','총입금','총출금','순입출금','평가손익','실현손익','배당수익','수수료·세금'];
  return <><PageHeader embedded title="자산분석" variant="detail" showAdd={false} showBackTablet assetOverview backPath="/" backIcon={<Box component="span" sx={{fontSize:30}}>‹</Box>}/>
   <Box data-testid="analysis-download-shell" aria-busy sx={{height:{sm:'100%'},minHeight:0,display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:'8px'}}>
    <Stack spacing="8px" sx={{minWidth:0,minHeight:0,overflowY:{xs:'visible',sm:'auto'},pb:{xs:0,sm:'80px'},scrollbarWidth:'none'}}>
     <AppCard sx={{border:0,borderRadius:"8px",p:'8px 16px',height:92,flexShrink:0}}><Typography sx={title}>총자산 <Box component="span" sx={{fontSize:10,color:colors.textMuted,fontWeight:400}}>(상세보기)</Box></Typography></AppCard>
     <AppCard sx={{border:0,borderRadius:"8px",p:'8px 16px',height:91,flexShrink:0}}><Typography sx={title}>자산구성</Typography></AppCard>
     <AppCard data-testid="analysis-download-trend" sx={{border:0,borderRadius:"8px",p:'8px 16px 2px',flexShrink:0}}><Stack direction="row" sx={{gap:"4px",alignItems:"center",minHeight:23}}><Typography sx={title}>자산추이</Typography><Typography sx={{fontSize:10,color:colors.textMuted,fontWeight:400}}>(상세보기)</Typography></Stack>
      <Box data-testid="analysis-download-chart" sx={{height:224,display:'flow-root'}}><AssetAnalysisChart points={[]} period={assetPeriod} range={analysisRange(assetPeriod,today)}/></Box>
      <Stack direction="row" spacing="4px" sx={{my:'8px'}}>{analysisPeriods.map(period=><Button key={period.value} aria-pressed={assetPeriod===period.value} onClick={()=>{setAssetPeriod(period.value);params.set('period',period.value);navigate({search:params.toString()},{replace:true,state:location.state});}} sx={{flex:1,minWidth:0,height:24,minHeight:24,p:0,borderRadius:'4px',fontSize:10,bgcolor:assetPeriod===period.value?colors.buttonPrimary:colors.raised,color:assetPeriod===period.value?colors.textPrimary:colors.textSecondary}}>{period.label}</Button>)}</Stack>
     </AppCard>
    </Stack>
    <Stack spacing="8px" sx={{minWidth:0,minHeight:0,overflowY:{xs:'visible',sm:'auto'},pb:{xs:0,sm:'80px'},scrollbarWidth:'none'}}>
     <AppCard sx={{border:0,borderRadius:"8px",p:'0 16px 14px',flexShrink:0}}><Box sx={{pt:'14px',pb:'4px',borderBottom:'1px solid '+colors.border}}><Typography sx={title}>기간 성과 구성</Typography></Box>
      <Stack spacing="4px" sx={{mt:'4px',minHeight:270}}>{labels.map((label,index)=><Box key={label}>{[4,7].includes(index)&&<Box sx={{borderTop:'1px solid '+colors.border,mb:'4px'}}/>}<Stack direction="row" sx={{height:20,justifyContent:'space-between',alignItems:'center'}}><Typography sx={{fontSize:12,color:colors.textSecondary}}>{label}</Typography><Box sx={{width:90,height:12}}/></Stack></Box>)}</Stack>
      <Typography sx={{mt:'8px',fontSize:10,color:colors.textMuted,lineHeight:'14px'}}>평가손익은 기초 대비 증감, 배당은 세전, 수수료·세금은 차감 기준입니다.</Typography>
     </AppCard>
     <AppCard sx={{border:0,borderRadius:"8px",p:'8px 16px',minHeight:114,flexShrink:0}}><Typography sx={title}>복리계획</Typography>{['현재 자산','올해 목표','목표 자산'].map(label=><Typography key={label} sx={{fontSize:12,color:colors.textMuted,height:20}}>{label}</Typography>)}</AppCard>
    </Stack>
   </Box></>;
 }
 if(location.pathname==='/journal'){
 const date=params.get('date')??new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
 const move=(offset:number)=>{const next=new Date(year,month-1+offset,1);params.set('date',`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`);navigate({search:params.toString()},{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 const controls=<Box sx={{height:46,display:'grid',gridTemplateColumns:'28px minmax(0,1fr) 28px',alignItems:'center'}}><Button aria-label="이전 달" onClick={()=>move(-1)} sx={{minWidth:28,p:0}}>‹</Button><Box sx={{textAlign:'center'}}><Typography sx={{fontSize:14,lineHeight:'22px',fontWeight:600}}>{year}년 {month}월</Typography><Box sx={{height:14,fontSize:10}}>월손익 <Skeleton component="span" width={60} height={10} sx={{display:'inline-block',transform:'none'}}/></Box></Box><Button aria-label="다음 달" onClick={()=>move(1)} sx={{minWidth:28,p:0}}>›</Button></Box>;
 return <><PageHeader embedded title="매매일지" variant="home" showAdd={false} maxWidth={1100} center={controls} action={<Button onClick={()=>navigate('/journal')} aria-label="오늘 날짜로 이동" sx={{minWidth:40,minHeight:32,height:32,p:0,fontSize:10,border:'1px solid '+colors.borderStrong,borderRadius:'8px'}}>오늘</Button>}/><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:'8px'}}><Stack spacing="8px">{!tablet&&<AppCard sx={{px:'8px',height:46}}>{controls}</AppCard>}<AppCard sx={{height:302,p:'4px 7px 10px',boxSizing:'border-box'}}><Box sx={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',height:22}}>{['일','월','화','수','목','금','토'].map(d=><Typography key={d} sx={{fontSize:10,textAlign:'center'}}>{d}</Typography>)}</Box><Box sx={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gridTemplateRows:'repeat(6,44px)'}}>{Array.from({length:42},(_,i)=>{const d=new Date(year,month-1,i-new Date(year,month-1,1).getDay()+1);return <Box key={i} sx={{textAlign:'center',fontSize:10,lineHeight:'14px'}}>{d.getDate()}</Box>;})}</Box></AppCard></Stack><AppCard sx={{p:'8px 14px'}}><Typography sx={{fontSize:14}}>{year}년 {month}월 {Number(date.slice(8))}일</Typography><Typography sx={{mt:2,fontSize:14}}>거래현황</Typography>{['매수','매도'].map(label=><Box key={label}><Typography sx={{textAlign:'center',fontSize:10,borderTop:'1px solid '+colors.border,py:'4px'}}>{label}</Typography><Skeleton height={14}/></Box>)}</AppCard></Box></>;
 }
 return null;
}
