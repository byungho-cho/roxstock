import {useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {Box,Button,ButtonBase,IconButton,MenuItem,Select,Stack,TextField,Tooltip,Typography} from '@mui/material';
import {AppCard} from '../../components/common/Common';
import {SnapshotChart} from '../../components/common/SnapshotChart';
import {PageHeader} from '../../components/navigation/Navigation';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {apiRequest} from '../../data/apiClient';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {colors} from '../../styles/tokens';
import {InvestorHistoryCard,investorPanel,investorValue,investorColor} from './InvestorHistoryCard';

type Target={id:string;symbol:string;name:string;classification:string};
type FlowRow={code:string;name:string;buy:string|null;sell:string|null;net:string|null;source:string;exchangeScope:string;publicationStatus:string;reason:string|null};
type Point={date:string;values:Record<string,string|null>};
type Report={selectedDate:string;actualFrom:string|null;actualTo:string|null;rows:FlowRow[];points:Point[];reason:string;updatedAt:string|null;partial:boolean;unit:string|null;status:string;collectionStartDate:string;historyFrom?:string|null};
const subjects=[{code:'INDIVIDUAL',name:'개인',color:'#A78BFA'},{code:'FOREIGN',name:'외국인',color:'#34D399'},{code:'INSTITUTION',name:'기관',color:'#FBBF24'}];
const periods=[['30','30일'],['60','60일'],['120','120일'],['180','180일'],['1y','1년'],['3y','3년']];
const panel=investorPanel;
const heading={fontSize:14,fontWeight:600,lineHeight:'20px'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
function amount(value:string|null|undefined){if(value==null)return '—';const [whole,fraction]=value.split('.');return BigInt(whole!).toLocaleString('ko-KR')+(fraction&&Number(fraction)?'.'+fraction.replace(/0+$/,''):'');}

export function InvestorTrendsPage(){
 const {accountId}=useActiveAccount(),[params,setParams]=useSearchParams();
 const mode=params.get('mode')==='stock'?'stock':'market',selectedDate=params.get('date')??today(),metric=params.get('metric')==='quantity'?'quantity':params.get('metric')==='amount'?'amount':mode==='stock'?'quantity':'amount',period=params.get('period')??'30';
 const set=(values:Record<string,string>)=>setParams(previous=>{const next=new URLSearchParams(previous);for(const [key,value]of Object.entries(values))next.set(key,value);return next;},{replace:true});
 const targets=useQuery({queryKey:['investor-targets',accountId],queryFn:({signal})=>apiRequest<Target[]>(`/accounts/${accountId}/investor-targets`,{signal}),enabled:!!accountId,staleTime:30000});
 const list=mode==='market'?[{symbol:'KOSPI',name:'KOSPI'},{symbol:'KOSDAQ',name:'KOSDAQ'}]:targets.data??[];
 const requested=params.get(mode==='market'?'market':'symbol');
 const index=Math.max(0,list.findIndex(t=>t.symbol===requested)),current=list[index];
 const query=useQuery({queryKey:['investor-trends',mode,current?.symbol,selectedDate,metric,period],queryFn:({signal})=>apiRequest<Report>(`/investor-trends?${new URLSearchParams({type:mode==='market'?'MARKET':'STOCK',target:current!.symbol,date:selectedDate,metric,period})}`,{signal}),enabled:!!current,staleTime:30000});
 const report=query.data;
 const navigate=(direction:number)=>{if(list.length<2)return;const target=list[(index+direction+list.length)%list.length]!;set({[mode==='market'?'market':'symbol']:target.symbol});};
 const touch=useRef<{x:number;y:number}|null>(null);
 const changeDay=(direction:number)=>{const date=new Date(selectedDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+direction);const value=date.toISOString().slice(0,10);if(value<=today())set({date:value});};
 const unit=metric==='quantity'?'주':'백만원';
 const explanation=(report?.reason??'저장된 자료를 조회합니다. 미수집 값은 0으로 표시하지 않습니다.')+' 거래대금 표시는 백만원 단위이며 소수 둘째 자리까지 반올림합니다. '+(report?.historyFrom?report.historyFrom.replaceAll('-','.')+'부터 과거 자료를 제공합니다. ':'과거 자료는 수집 진행 상태에 따라 제공합니다. ')+'최신 일별 수집도 유지합니다. 순매수 = 매수 − 매도이며 기관 합계와 세부 항목을 중복 합산하지 않습니다. 현재 단위: '+unit;
 return <>
  <PageHeader embedded title="투자동향" showBack={false} showAdd={false} action={<Box sx={{display:'flex',width:152,height:32,p:'3px',gap:'4px',bgcolor:colors.surface,boxSizing:'border-box',borderRadius:'8px'}}>{[['market','시장별'],['stock','종목별']].map(([value,label])=><ButtonBase key={value} onClick={()=>set({mode:value!,metric:value==='stock'?'quantity':'amount'})} aria-pressed={mode===value} sx={{flex:1,height:26,fontSize:12,fontWeight:mode===value?400:600,borderRadius:'8px',bgcolor:mode===value?colors.buttonPrimary:'transparent',color:mode===value?colors.textPrimary:colors.textSecondary}}>{label}</ButtonBase>)}</Box>}/>
  <Box data-testid="investor-trends" data-screen-number="3100" sx={{display:'flex',flexDirection:'column',gap:'4px',pb:'80px',minWidth:0}}>
   <QueryErrorNotice active={query.isError||targets.isError} message="투자동향 조회에 실패했습니다." onRetry={()=>{void query.refetch();void targets.refetch();}}/>
   <Box><Box data-testid="investor-navigation" onTouchStart={e=>{const t=e.touches[0];if(t)touch.current={x:t.clientX,y:t.clientY};}} onTouchEnd={e=>{const start=touch.current,t=e.changedTouches[0];touch.current=null;if(start&&t&&Math.abs(t.clientX-start.x)>50&&Math.abs(t.clientY-start.y)<30)navigate(t.clientX<start.x?1:-1);}} sx={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr',height:36,alignItems:'center',touchAction:'pan-y',minWidth:0}}>
    <ButtonBase aria-label="이전 시장 또는 종목" onClick={()=>navigate(-1)} disabled={list.length<2} sx={{justifyContent:'flex-start',fontSize:10,color:colors.textSecondary,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'block',textAlign:'left'}}>{list.length>1?list[(index-1+list.length)%list.length]?.name:''}</ButtonBase>
    <Typography noWrap sx={{fontSize:mode==='stock'?13:14,fontWeight:400,textAlign:'center',color:colors.warning}}>{current?.name??(mode==='stock'?'대상 종목 없음':'—')}{current&&'classification'in current?` (${current.classification})`:''}</Typography>
    <ButtonBase aria-label="다음 시장 또는 종목" onClick={()=>navigate(1)} disabled={list.length<2} sx={{justifyContent:'flex-end',fontSize:10,color:colors.textSecondary,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'block',textAlign:'right'}}>{list.length>1?list[(index+1)%list.length]?.name:''}</ButtonBase>
   </Box>
   <Box sx={{height:40,display:'flex',alignItems:'center',justifyContent:'space-between',bgcolor:colors.surface,border:`1px solid ${colors.border}`,borderRadius:'8px',px:'8px'}}><IconButton aria-label="이전 날짜" onClick={()=>changeDay(-1)} sx={{fontSize:20,width:28,height:32}}>‹</IconButton><TextField type="date" value={selectedDate} onChange={e=>{if(e.target.value&&e.target.value<=today())set({date:e.target.value});}} slotProps={{htmlInput:{max:today(),'aria-label':'투자동향 기준일'}}} sx={{width:112,'& .MuiInputBase-root':{height:28,bgcolor:'transparent',borderRadius:0},'& input':{textAlign:'center',p:0,fontSize:14},'& input::-webkit-calendar-picker-indicator':{width:14,height:14,p:0,ml:'4px',mr:0},'& fieldset':{border:0}}}/><IconButton aria-label="다음 날짜" onClick={()=>changeDay(1)} disabled={selectedDate>=today()} sx={{fontSize:20,width:28,height:32}}>›</IconButton></Box></Box>
   <Box data-testid="investor-card-grid" sx={{display:{xs:'flex',sm:'grid'},flexDirection:'column',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',rowGap:'4px',alignItems:{xs:'stretch',sm:'start'},width:'100%',minWidth:0}}>
    <Stack spacing="4px" sx={{minWidth:0,width:'100%'}}>
     <AppCard sx={panel}><Box sx={{display:'flex',alignItems:'center',height:28,mb:'4px',gap:'8px'}}><Typography component="h2" sx={heading}>당일 순매수</Typography><Tooltip title={explanation} enterTouchDelay={0}><IconButton aria-label="투자동향 자료 기준" sx={{p:0}}><img src="/investor-v1/info.svg" alt=""/></IconButton></Tooltip><Select size="small" IconComponent={SelectArrow} value={metric} onChange={e=>set({metric:e.target.value})} inputProps={{'aria-label':'거래대금 또는 거래량'}} sx={{ml:'auto',height:28,fontSize:11,width:92,borderRadius:'6px',bgcolor:colors.raised,'& .MuiSelect-select':{py:0,pl:'8px'},'& .MuiOutlinedInput-notchedOutline':{borderColor:'#273244'}}}><MenuItem value="amount">거래대금</MenuItem><MenuItem value="quantity">거래량</MenuItem></Select></Box>
      {subjects.map(actor=>{const row=report?.rows.find(r=>r.code===actor.code);return <Box key={actor.code} sx={{display:'flex',justifyContent:'space-between',alignItems:'center',height:22,mb:actor.code==='INSTITUTION'?0:'4px'}}><Typography sx={{fontSize:12}}>{actor.name}</Typography><Typography sx={{fontSize:16,lineHeight:'22px',fontWeight:600,color:investorColor(row?.net)}}><span title={row?.net==null?'미제공 또는 미수집':amount(row.net)+(metric==='amount'?' 원':' 주')}>{investorValue(row?.net,metric,true)}</span></Typography></Box>;})}
     </AppCard>
     <AppCard sx={panel}><Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',height:24,mb:'4px'}}><Typography component="h2" sx={{...heading,fontSize:12}}>누적 순매수 추이</Typography><Box sx={{display:'flex',gap:'6px'}}>{subjects.map(s=><Typography key={s.code} sx={{fontSize:9,color:s.color,whiteSpace:'nowrap'}}>● {s.name}</Typography>)}</Box></Box><CumulativeChart key={`${mode}:${current?.symbol}:${selectedDate}:${metric}:${period}`} points={report?.points??[]} unit={unit} selectedDate={selectedDate} period={period} pending={query.isFetching&&!report}/><Box sx={{display:'flex',gap:'4px',mt:'8px'}}>{periods.map(([key,label])=><Button key={key} onClick={()=>set({period:key!})} aria-pressed={period===key} sx={{minWidth:0,flex:1,height:28,minHeight:28,p:0,fontSize:10,fontWeight:400,bgcolor:period===key?colors.buttonPrimary:colors.raised,color:period===key?colors.textPrimary:colors.textSecondary,borderRadius:'6px'}}>{label}</Button>)}</Box><Typography sx={{fontSize:10,color:colors.textMuted,mt:'4px'}}> {report?.actualFrom?`자료 ${report.actualFrom} ~ ${report.actualTo}${report.partial?' · 일부 기간':''}`:query.isFetching?'조회 중':'저장된 자료 없음'}</Typography></AppCard>
    </Stack>
    <InvestorHistoryCard mode={mode} target={current?.symbol} date={selectedDate} metric={metric}/>

   </Box>
  </Box>
 </>;
}
function CumulativeChart({points,unit,selectedDate,period,pending}:{points:Point[];unit:string;selectedDate:string;period:string;pending:boolean}){
 const start=new Date(selectedDate+'T00:00:00Z');
 if(period==='1y'||period==='3y')start.setUTCFullYear(start.getUTCFullYear()-(period==='1y'?1:3));
 else start.setUTCDate(start.getUTCDate()-Number(period)+1);
 const hasData=points.some(point=>subjects.some(subject=>point.values[subject.code]!=null));
 const formatAxisLabel=(value:number)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(unit==='백만원'?value/1e6:Math.abs(value)>=1e4?value/1e4:value)+(unit==='주'&&Math.abs(value)>=1e4?'만':'');
 return <Box data-testid="investor-chart-frame" sx={{position:'relative',minWidth:0}}><SnapshotChart testId="investor-cumulative-chart" ariaLabel="투자자 누적 순매수 차트" from={start.toISOString().slice(0,10)} to={selectedDate} tooltipUnit={unit} height={124} leftAxisWidth={37} topGap={4} emptyFrame dottedTooltipDate formatAxisLabel={formatAxisLabel} dateLabels={[start.toISOString().slice(0,10),new Date((start.getTime()+Date.parse(selectedDate))/2).toISOString().slice(0,10),selectedDate].map(date=>({date,label:date.slice(5).replace('-','.')}))}
  series={subjects.map(subject=>({key:subject.code,label:subject.name,color:subject.color,strokeDasharray:subject.code==='FOREIGN'?'4 3':subject.code==='INSTITUTION'?'1 3':undefined,lineTestId:'investor-line-'+subject.code}))}
  points={points.map(point=>({date:point.date,values:Object.fromEntries(subjects.map(subject=>[subject.code,point.values[subject.code]==null?null:Number(point.values[subject.code])])),text:Object.fromEntries(subjects.map(subject=>[subject.code,investorValue(point.values[subject.code],unit==='백만원'?'amount':'quantity',true)]))}))}/>
  {!pending&&!hasData&&<Typography sx={{position:'absolute',top:8,left:40,right:0,height:124,display:'grid',placeItems:'center',fontSize:11,color:colors.textMuted,pointerEvents:'none'}}>저장된 누적 자료 없음</Typography>}
 </Box>;
}

function SelectArrow({className}:{className?:string}){return <img className={className} src="/investor-v1/select-arrow.svg" alt="" style={{right:10}}/>;}
