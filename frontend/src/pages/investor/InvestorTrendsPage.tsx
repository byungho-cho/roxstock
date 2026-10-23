import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {Box,Button,ButtonBase,Dialog,IconButton,Stack,TextField,Tooltip,Typography} from '@mui/material';
import {AppCard} from '../../components/common/Common';
import {SnapshotChart} from '../../components/common/SnapshotChart';
import {PageHeader} from '../../components/navigation/Navigation';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {apiRequest} from '../../data/apiClient';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {colors} from '../../styles/tokens';
import {InvestorHistoryCard,investorPanel,investorValue,investorDailyValue,investorDailyUnit,investorColor} from './InvestorHistoryCard';

type Target={id:string;symbol:string;name:string;classification:string};
type FlowRow={code:string;name:string;buy:string|null;sell:string|null;net:string|null;source:string;exchangeScope:string;publicationStatus:string;reason:string|null};
type Point={date:string;values:Record<string,string|null>;close?:string|null;closeChange?:string|null};
type Report={selectedDate:string;actualFrom:string|null;actualTo:string|null;rows:FlowRow[];points:Point[];reason:string;updatedAt:string|null;partial:boolean;unit:string|null;status:string;collectionStartDate:string;historyFrom?:string|null};
const subjects=[{code:'INDIVIDUAL',name:'개인',color:'#35B8C8'},{code:'FOREIGN',name:'외국인',color:'#F39B78'},{code:'INSTITUTION',name:'기관',color:'#9575CD'}];
const periods=[['30','30일'],['60','60일'],['120','120일'],['180','180일'],['1y','1년'],['3y','3년']];
const panel=investorPanel;
const heading={fontSize:14,fontWeight:600,lineHeight:'20px'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
function amount(value:string|null|undefined){if(value==null)return '—';const [whole,fraction]=value.split('.');return BigInt(whole!).toLocaleString('ko-KR')+(fraction&&Number(fraction)?'.'+fraction.replace(/0+$/,''):'');}

export function InvestorTrendsPage(){
 const {accountId}=useActiveAccount(),[params,setParams]=useSearchParams();
 const mode=params.get('mode')==='stock'?'stock':'market',selectedDate=params.get('date')??today(),metric=params.get('metric')==='quantity'?'quantity':params.get('metric')==='amount'?'amount':mode==='stock'?'quantity':'amount',period=params.get('period')??'1y';
 const [historyDate]=useState(selectedDate);
 const location=useLocation(),navigatePage=useNavigate(),detail=params.get('chart')==='detail';
 const openDetail=()=>{const next=new URLSearchParams(params);next.set('chart','detail');navigatePage({pathname:location.pathname,search:next.toString()},{state:{...location.state,investorChartDetail:true}});};
 const closeDetail=()=>{if(location.state?.investorChartDetail)navigatePage(-1);else{const next=new URLSearchParams(params);next.delete('chart');setParams(next,{replace:true,state:location.state});}};
 const set=(values:Record<string,string>)=>setParams(previous=>{const next=new URLSearchParams(previous);for(const [key,value]of Object.entries(values))next.set(key,value);return next;},{replace:true,state:location.state});
 const targets=useQuery({queryKey:['investor-targets',accountId],queryFn:({signal})=>apiRequest<Target[]>(`/accounts/${accountId}/investor-targets`,{signal}),enabled:!!accountId,staleTime:30000});
 const list=mode==='market'?[{symbol:'KOSPI',name:'KOSPI'},{symbol:'KOSDAQ',name:'KOSDAQ'}]:targets.data??[];
 const requested=params.get(mode==='market'?'market':'symbol');
 const found=list.findIndex(t=>t.symbol===requested),index=Math.max(0,found),current=requested&&found<0?undefined:list[index];
 const query=useQuery({queryKey:['investor-trends',mode,current?.symbol,selectedDate,metric,'30'],queryFn:({signal})=>apiRequest<Report>(`/investor-trends?${new URLSearchParams({type:mode==='market'?'MARKET':'STOCK',target:current!.symbol,date:selectedDate,metric,period:'30',...(mode==='stock'?{scope:'COMBINED'}:{})})}`,{signal}),enabled:!!current,staleTime:30000,placeholderData:(previous,previousQuery)=>previousQuery?.queryKey[1]===mode&&previousQuery?.queryKey[2]===current?.symbol&&previousQuery?.queryKey[4]===metric?previous:undefined});
 const chartQuery=useQuery({queryKey:['investor-trends',mode,current?.symbol,historyDate,metric,period],queryFn:({signal})=>apiRequest<Report>("/investor-trends?"+new URLSearchParams({type:mode==='market'?'MARKET':'STOCK',target:current!.symbol,date:historyDate,metric,period,...(mode==='stock'?{scope:'COMBINED'}:{})}),{signal}),enabled:!!current,staleTime:30000});
 const report=query.data,chartReport=chartQuery.data;
 const navigate=(direction:number)=>{if(list.length<2)return;const target=list[(index+direction+list.length)%list.length]!;set({[mode==='market'?'market':'symbol']:target.symbol});};
 const touch=useRef<{x:number;y:number}|null>(null);
 const changeDay=(direction:number)=>{const date=new Date(selectedDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+direction);const value=date.toISOString().slice(0,10);if(value<=today())set({date:value});};
 const unit=metric==='quantity'?(mode==='market'?'천주':'주'):'백만원';
 const scopeNotice=mode==='stock'?(report?.status==='UNVERIFIED_OR_UNSUPPORTED'?'KRX 또는 NXT 미수집 · 통합값 대기':'KRX+NXT 합계 · 종가 KRX 기준'):'KIS 시장 집계 · NXT 미합산';
 const explanation=[scopeNotice,(report?.reason??'저장된 자료를 조회합니다. 미수집 값은 0으로 표시하지 않습니다.').split(/(?<=\.)\s+/).join('\n'),'당일 순매수: 억원·만원 또는 억주·만주 단위\n차트·거래실적 거래대금: 백만원 단위\n소수 둘째 자리까지 반올림',report?.historyFrom?'과거 수집 시작 기준: '+report.historyFrom.replaceAll('-','.')+'\n실제 저장 범위는 차트 제목 옆에서 확인할 수 있습니다.':'과거 자료는 수집 진행 상태에 따라 제공합니다.','최신 일별 수집도 유지합니다.','순매수 = 매수 − 매도\n기관 합계와 세부 항목은 중복 합산하지 않습니다.','차트·거래실적 표시 단위: '+unit];
 return <>
  <PageHeader embedded title={<Box component="span" sx={{display:'inline-flex',alignItems:'center',gap:'6px'}}>투자동향<Tooltip title={<Box data-testid="investor-source-tooltip" sx={{display:'grid',gap:'6px',fontSize:11,lineHeight:1.6,whiteSpace:'pre-line'}}>{explanation.map((text,index)=><Box key={index}>{text}</Box>)}</Box>} enterTouchDelay={0}><IconButton aria-label="투자동향 자료 기준" sx={{p:0}}><img src="/investor-v1/info.svg" alt=""/></IconButton></Tooltip></Box>} showBack={!!location.state?.returnTo} showBackTablet onBack={location.state?.returnTo?()=>navigatePage(-1):undefined} showAdd={false} action={<Box sx={{display:'flex',width:152,height:32,p:'3px',gap:'4px',bgcolor:colors.surface,boxSizing:'border-box',borderRadius:'8px'}}>{[['market','시장별'],['stock','종목별']].map(([value,label])=><ButtonBase key={value} onClick={()=>set({mode:value!,metric:value==='stock'?'quantity':'amount'})} aria-pressed={mode===value} sx={{flex:1,height:26,fontSize:12,fontWeight:mode===value?400:600,borderRadius:'8px',bgcolor:mode===value?colors.buttonPrimary:'transparent',color:mode===value?colors.textPrimary:colors.textSecondary}}>{label}</ButtonBase>)}</Box>}/>
  <Box data-testid="investor-trends" data-screen-number="3100" sx={{display:'flex',flexDirection:'column',gap:'4px',pb:'80px',minWidth:0}}>
   <QueryErrorNotice active={query.isError||chartQuery.isError||targets.isError} message="투자동향 조회에 실패했습니다." onRetry={()=>{void query.refetch();void chartQuery.refetch();void targets.refetch();}}/>
   <Box><Box data-testid="investor-navigation" onTouchStart={e=>{const t=e.touches[0];if(t)touch.current={x:t.clientX,y:t.clientY};}} onTouchEnd={e=>{const start=touch.current,t=e.changedTouches[0];touch.current=null;if(start&&t&&Math.abs(t.clientX-start.x)>50&&Math.abs(t.clientY-start.y)<30)navigate(t.clientX<start.x?1:-1);}} sx={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr',height:36,alignItems:'center',touchAction:'pan-y',minWidth:0}}>
    <ButtonBase aria-label="이전 시장 또는 종목" onClick={()=>navigate(-1)} disabled={list.length<2} sx={{justifyContent:'flex-start',fontSize:10,color:colors.textSecondary,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'block',textAlign:'left'}}>{list.length>1?list[(index-1+list.length)%list.length]?.name:''}</ButtonBase>
    <Typography noWrap sx={{fontSize:mode==='stock'?13:14,fontWeight:400,textAlign:'center',color:colors.warning}}>{current?.name??(mode==='stock'?(requested?requested+' · 대상 종목 자료 없음':'대상 종목 없음'):'—')}{current&&'classification'in current?` (${current.classification})`:''}</Typography>
    <ButtonBase aria-label="다음 시장 또는 종목" onClick={()=>navigate(1)} disabled={list.length<2} sx={{justifyContent:'flex-end',fontSize:10,color:colors.textSecondary,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'block',textAlign:'right'}}>{list.length>1?list[(index+1)%list.length]?.name:''}</ButtonBase>
   </Box>
   </Box>
   <Box data-testid="investor-card-grid" sx={{display:{xs:'flex',sm:'grid'},flexDirection:'column',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',rowGap:'4px',alignItems:{xs:'stretch',sm:'start'},width:'100%',minWidth:0}}>
    <Stack spacing="4px" sx={{minWidth:0,width:'100%'}}>
     <AppCard data-testid="investor-daily-card" aria-label="당일 순매수" sx={{...panel,p:'4px 12px 12px'}}>
      <Box sx={{display:'grid',gridTemplateColumns:'28px minmax(0,1fr) 28px 72px',alignItems:'center',gap:'4px',height:36,borderBottom:`1px solid ${colors.border}`,mb:'8px'}}>
       <IconButton aria-label="이전 날짜" onClick={()=>changeDay(-1)} sx={{fontSize:18,width:28,height:28}}>‹</IconButton>
       <Box sx={{display:'flex',alignItems:'center',justifyContent:'center',minWidth:0}}><TextField type="date" value={selectedDate} onChange={e=>{if(e.target.value&&e.target.value<=today())set({date:e.target.value});}} slotProps={{htmlInput:{max:today(),'aria-label':'투자동향 기준일'}}} sx={{width:112,'& .MuiInputBase-root':{height:28,bgcolor:'transparent',borderRadius:0},'& input':{textAlign:'center',p:0,fontSize:14,fontWeight:600},'& input::-webkit-calendar-picker-indicator':{width:14,height:14,p:0,ml:'4px',mr:0},'& fieldset':{border:0}}}/></Box>
       <IconButton aria-label="다음 날짜" onClick={()=>changeDay(1)} disabled={selectedDate>=today()} sx={{fontSize:18,width:28,height:28}}>›</IconButton>

       <ButtonBase aria-label="거래대금 또는 거래량" aria-pressed={metric==='quantity'} title="클릭하여 거래대금·거래량 전환" onClick={()=>set({metric:metric==='amount'?'quantity':'amount'})} sx={{height:24,width:72,borderRadius:'12px',bgcolor:colors.raised,color:colors.textSecondary,fontSize:11,fontWeight:600}}>{metric==='amount'?'거래대금':'거래량'}</ButtonBase>
      </Box>
      <Box sx={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}>
       {subjects.map((actor,index)=>{const row=report?.rows.find(r=>r.code===actor.code);return <Box key={actor.code} sx={{minWidth:0,px:index?'8px':0,pr:'8px',borderLeft:index?`1px solid ${colors.border}`:undefined}}>
        <Typography sx={{fontSize:11,lineHeight:'16px',color:investorColor(row?.net)}}>{actor.name}</Typography>
        <Typography sx={{fontSize:12,lineHeight:'20px',fontWeight:600,textAlign:'right',whiteSpace:'nowrap',color:investorColor(row?.net)}}><span title={row?.net==null?'미제공 또는 미수집':amount(row.net)+(metric==='amount'?' 원':' '+unit)}>{investorDailyValue(row?.net,metric,mode==='market')}{row?.net!=null&&<Box component="span" sx={{ml:'4px',fontSize:11,fontWeight:400}}>{investorDailyUnit(row.net,metric,mode==='market')}</Box>}</span></Typography>
       </Box>;})}
      </Box>
     </AppCard>
     <AppCard sx={panel}>
      <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',minHeight:24}}>
       <Typography component="h2" sx={{...heading,fontSize:12}}>누적 순매수 추이</Typography>
       <Button onClick={openDetail} sx={{fontSize:10,p:0,minWidth:0,minHeight:24,color:colors.textMuted}}>상세보기 ›</Button>
      </Box>
      <Box data-testid="investor-chart-caption" sx={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',alignItems:'center',gap:'4px',mb:'4px'}}>
       {chartReport?.actualFrom&&<Typography data-testid="investor-chart-period" title={chartReport.partial?'일부 기간 자료':''} sx={{fontSize:9,color:colors.textMuted,whiteSpace:'nowrap'}}>({chartReport.actualFrom} ~ {chartReport.actualTo})</Typography>}
       <Box sx={{display:'flex',gap:'6px'}}>{subjects.map(s=><Typography key={s.code} sx={{fontSize:9,color:s.color,whiteSpace:'nowrap'}}>● {s.name}</Typography>)}</Box>
      </Box>
      <CumulativeChart key={`${mode}:${current?.symbol}:${historyDate}:${metric}:${period}`} points={chartReport?.points??[]} market={mode==='market'} unit={unit} selectedDate={historyDate} period={period} pending={chartQuery.isFetching&&!chartReport}/>
      <Box sx={{display:'flex',gap:'4px',mt:'8px'}}>{periods.map(([key,label])=><Button key={key} onClick={()=>set({period:key!})} aria-pressed={period===key} sx={{minWidth:0,flex:1,height:28,minHeight:28,p:0,fontSize:10,fontWeight:400,bgcolor:period===key?colors.buttonPrimary:colors.raised,color:period===key?colors.textPrimary:colors.textSecondary,borderRadius:'6px'}}>{label}</Button>)}</Box>
      {!chartReport?.actualFrom&&<Typography sx={{fontSize:10,color:colors.textMuted,mt:'4px'}}>{chartQuery.isFetching?'조회 중':'저장된 자료 없음'}</Typography>}
     </AppCard>
    </Stack>
    <InvestorHistoryCard mode={mode} target={current?.symbol} date={historyDate} metric={metric}/>

   </Box>
  </Box>
  <Dialog fullScreen transitionDuration={0} open={detail} onClose={closeDetail} aria-label="누적 순매수 차트 상세보기" slotProps={{paper:{'aria-label':'누적 순매수 차트 상세보기',sx:{bgcolor:colors.canvas,backgroundImage:'none',p:'8px',display:'flex',flexDirection:'column',overflowY:'auto'}}}}>
   <Box sx={{display:'flex',alignItems:'center',height:44,gap:'8px',flexShrink:0}}><IconButton aria-label="차트 상세 뒤로가기" onClick={closeDetail}>‹</IconButton><Typography sx={{fontSize:18,fontWeight:600}}>누적 순매수 추이</Typography></Box>
   <AppCard sx={{...panel,flex:1,minHeight:0}}>
    <Typography sx={{fontSize:14,fontWeight:600,mb:'4px'}}>{current?.name} · {metric==='amount'?'거래대금':'거래량'}</Typography>
    <Box sx={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:'4px',mb:'8px'}}><Typography sx={{fontSize:10,color:colors.textMuted}}>{chartReport?.actualFrom?chartReport.actualFrom+' ~ '+chartReport.actualTo:'저장된 자료 없음'}</Typography><Box sx={{display:'flex',gap:'8px'}}>{subjects.map(s=><Typography key={s.code} sx={{fontSize:10,color:s.color}}>● {s.name}</Typography>)}</Box></Box>
    {detail&&<CumulativeChart points={chartReport?.points??[]} market={mode==='market'} unit={unit} selectedDate={historyDate} period={period} pending={chartQuery.isFetching&&!chartReport} height="max(120px, calc(100dvh - 210px))"/>}
      <Box sx={{display:'flex',gap:'4px',mt:'8px'}}>{periods.map(([key,label])=><Button key={key} onClick={()=>set({period:key!})} aria-pressed={period===key} sx={{minWidth:0,flex:1,height:28,minHeight:28,p:0,fontSize:10,fontWeight:400,bgcolor:period===key?colors.buttonPrimary:colors.raised,color:period===key?colors.textPrimary:colors.textSecondary,borderRadius:'6px'}}>{label}</Button>)}</Box>
   </AppCard>
  </Dialog>
 </>;
}
function CumulativeChart({points,market,unit,selectedDate,period,pending,height=221}:{points:Point[];market:boolean;unit:string;selectedDate:string;period:string;pending:boolean;height?:number|string}){
 const start=new Date(selectedDate+'T00:00:00Z');
 if(period==='1y'||period==='3y')start.setUTCFullYear(start.getUTCFullYear()-(period==='1y'?1:3));
 else start.setUTCDate(start.getUTCDate()-Number(period)+1);
 const hasData=points.some(point=>subjects.some(subject=>point.values[subject.code]!=null));
 const formatAxisLabel=(value:number)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(unit==='백만원'?value/1e6:unit==='주'&&Math.abs(value)>=1e4?value/1e4:value)+(unit==='주'&&Math.abs(value)>=1e4?'만':'');
 return <Box data-testid="investor-chart-frame" sx={{position:'relative',minWidth:0}}><SnapshotChart testId="investor-cumulative-chart" ariaLabel="투자자 누적 순매수 차트" from={start.toISOString().slice(0,10)} to={selectedDate} tooltipUnit={unit} height={height} leftAxisWidth={37} topGap={4} emptyFrame dottedTooltipDate formatAxisLabel={formatAxisLabel} dateLabels={[start.toISOString().slice(0,10),new Date((start.getTime()+Date.parse(selectedDate))/2).toISOString().slice(0,10),selectedDate].map(date=>({date,label:date.slice(5).replace('-','.')}))}
  series={subjects.map(subject=>({key:subject.code,label:subject.name,color:subject.color,lineTestId:'investor-line-'+subject.code}))}
  points={points.map(point=>({date:point.date,tooltipRows:[{label:'종가',text:point.close==null?'—':investorValue(point.close,'quantity'),color:investorColor(point.closeChange)}],values:Object.fromEntries(subjects.map(subject=>[subject.code,point.values[subject.code]==null?null:Number(point.values[subject.code])])),text:Object.fromEntries(subjects.map(subject=>[subject.code,investorValue(point.values[subject.code],unit==='백만원'?'amount':'quantity',true)]))}))}/>
  {!pending&&!hasData&&<Typography sx={{position:'absolute',top:8,left:40,right:0,height,display:'grid',placeItems:'center',fontSize:11,color:colors.textMuted,pointerEvents:'none'}}>저장된 누적 자료 없음</Typography>}
 </Box>;
}
