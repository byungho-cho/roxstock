import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {Box,Button,ButtonBase,Card,IconButton,MenuItem,Select,Stack,TextField,Tooltip,Typography} from '@mui/material';
import {PageHeader} from '../../components/navigation/Navigation';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {apiRequest} from '../../data/apiClient';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {colors} from '../../styles/tokens';

type Target={id:string;symbol:string;name:string;classification:string};
type FlowRow={code:string;name:string;buy:string|null;sell:string|null;net:string|null;source:string;exchangeScope:string;publicationStatus:string;reason:string|null};
type Point={date:string;values:Record<string,string|null>};
type Report={selectedDate:string;actualFrom:string|null;actualTo:string|null;rows:FlowRow[];points:Point[];reason:string;updatedAt:string|null;partial:boolean;unit:string|null;status:string;collectionStartDate:string};
const subjects=[{code:'INDIVIDUAL',name:'개인',color:'#A78BFA'},{code:'FOREIGN',name:'외국인',color:'#34D399'},{code:'INSTITUTION',name:'기관',color:'#FBBF24'}];
const periods=[['30','30일'],['60','60일'],['120','120일'],['180','180일'],['1y','1년'],['3y','3년']];
const panel={p:'12px 16px',borderRadius:'8px',border:`1px solid ${colors.border}`,bgcolor:colors.surface,minWidth:0,width:'100%',boxSizing:'border-box'};
const heading={fontSize:14,fontWeight:600,lineHeight:'20px'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
function amount(value:string|null|undefined){if(value==null)return '—';const [whole,fraction]=value.split('.');return BigInt(whole!).toLocaleString('ko-KR')+(fraction&&Number(fraction)?'.'+fraction.replace(/0+$/,''):'');}
function valueColor(value:string|null|undefined){return value==null?colors.textMuted:Number(value)>0?colors.marketRise:Number(value)<0?colors.marketFall:colors.textPrimary;}
const shortDate=(value:string)=>value.slice(5).replace('-','.');

export function InvestorTrendsPage(){
 const {accountId}=useActiveAccount(),[params,setParams]=useSearchParams();
 const mode=params.get('mode')==='stock'?'stock':'market',selectedDate=params.get('date')??today(),metric=params.get('metric')==='quantity'?'quantity':'amount',period=params.get('period')??'30';
 const set=(values:Record<string,string>)=>setParams(previous=>{const next=new URLSearchParams(previous);for(const [key,value]of Object.entries(values))next.set(key,value);return next;},{replace:true});
 const targets=useQuery({queryKey:['investor-targets',accountId],queryFn:({signal})=>apiRequest<Target[]>(`/accounts/${accountId}/investor-targets`,{signal}),enabled:!!accountId,staleTime:30000});
 const list=mode==='market'?[{symbol:'KOSPI',name:'코스피'},{symbol:'KOSDAQ',name:'코스닥'}]:targets.data??[];
 const requested=params.get(mode==='market'?'market':'symbol');
 const index=Math.max(0,list.findIndex(t=>t.symbol===requested)),current=list[index];
 const query=useQuery({queryKey:['investor-trends',mode,current?.symbol,selectedDate,metric,period],queryFn:({signal})=>apiRequest<Report>(`/investor-trends?${new URLSearchParams({type:mode==='market'?'MARKET':'STOCK',target:current!.symbol,date:selectedDate,metric,period})}`,{signal}),enabled:!!current,staleTime:30000});
 const report=query.data;
 const navigate=(direction:number)=>{if(list.length<2)return;const target=list[(index+direction+list.length)%list.length]!;set({[mode==='market'?'market':'symbol']:target.symbol});};
 const touch=useRef<{x:number;y:number}|null>(null);
 const changeDay=(direction:number)=>{const date=new Date(selectedDate+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+direction);const value=date.toISOString().slice(0,10);if(value<=today())set({date:value});};
 const unit=report?.unit==='SHARE'?'주':report?.unit==='KRW'?'원':'단위 미확인';
 const explanation=(report?.reason??'저장된 자료를 조회합니다. 미수집 값은 0으로 표시하지 않습니다.')+' 최근 3년 보충은 보류하고 2026.10.16부터 수집합니다. 순매수 = 매수 − 매도이며 기관 합계와 세부 항목을 중복 합산하지 않습니다. 현재 단위: '+unit;
 return <>
  <PageHeader embedded title="투자동향" showBack={false} showAdd={false} action={<Box sx={{display:'flex',width:152,height:32,p:'3px',gap:'4px',bgcolor:colors.surface,borderRadius:'8px'}}>{[['market','시장별'],['stock','종목별']].map(([value,label])=><ButtonBase key={value} onClick={()=>set({mode:value!})} aria-pressed={mode===value} sx={{flex:1,fontSize:12,borderRadius:'6px',bgcolor:mode===value?colors.buttonPrimary:'transparent',color:mode===value?colors.textPrimary:colors.textSecondary}}>{label}</ButtonBase>)}</Box>}/>
  <Box data-testid="investor-trends" data-screen-number="3100" sx={{display:'flex',flexDirection:'column',gap:'8px',pb:'8px',minWidth:0}}>
   <QueryErrorNotice active={query.isError||targets.isError} message="투자동향 조회에 실패했습니다." onRetry={()=>{void query.refetch();void targets.refetch();}}/>
   <Box><Box data-testid="investor-navigation" onTouchStart={e=>{const t=e.touches[0];if(t)touch.current={x:t.clientX,y:t.clientY};}} onTouchEnd={e=>{const start=touch.current,t=e.changedTouches[0];touch.current=null;if(start&&t&&Math.abs(t.clientX-start.x)>50&&Math.abs(t.clientY-start.y)<30)navigate(t.clientX<start.x?1:-1);}} sx={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr',height:36,alignItems:'center',touchAction:'pan-y',minWidth:0}}>
    <ButtonBase aria-label="이전 시장 또는 종목" onClick={()=>navigate(-1)} disabled={list.length<2} sx={{justifyContent:'flex-start',fontSize:10,color:colors.textSecondary,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'block',textAlign:'left'}}>{list.length>1?list[(index-1+list.length)%list.length]?.name:''}</ButtonBase>
    <Typography noWrap sx={{fontSize:13,textAlign:'center',color:colors.warning}}>{current?.name??(mode==='stock'?'대상 종목 없음':'—')}{current&&'classification'in current?` (${current.classification})`:''}</Typography>
    <ButtonBase aria-label="다음 시장 또는 종목" onClick={()=>navigate(1)} disabled={list.length<2} sx={{justifyContent:'flex-end',fontSize:10,color:colors.textSecondary,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',display:'block',textAlign:'right'}}>{list.length>1?list[(index+1)%list.length]?.name:''}</ButtonBase>
   </Box>
   <Box sx={{height:40,display:'flex',alignItems:'center',justifyContent:'space-between',bgcolor:colors.surface,border:`1px solid ${colors.border}`,borderRadius:'8px',px:'8px'}}><IconButton aria-label="이전 날짜" onClick={()=>changeDay(-1)} sx={{fontSize:20,width:28,height:32}}>‹</IconButton><TextField type="date" value={selectedDate} onChange={e=>{if(e.target.value&&e.target.value<=today())set({date:e.target.value});}} slotProps={{htmlInput:{max:today(),'aria-label':'투자동향 기준일'}}} sx={{'& input':{textAlign:'center',p:0,fontSize:14},'& fieldset':{border:0}}}/><IconButton aria-label="다음 날짜" onClick={()=>changeDay(1)} disabled={selectedDate>=today()} sx={{fontSize:20,width:28,height:32}}>›</IconButton></Box></Box>
   <Box data-testid="investor-card-grid" sx={{display:{xs:'flex',sm:'grid'},flexDirection:'column',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',alignItems:{xs:'stretch',sm:'start'},width:'100%',minWidth:0}}>
    <Stack spacing="8px" sx={{minWidth:0,width:'100%'}}>
     <Card sx={panel}><Box sx={{display:'flex',alignItems:'center',height:28,mb:'4px',gap:'8px'}}><Typography component="h2" sx={heading}>당일 순매수</Typography><Tooltip title={explanation} enterTouchDelay={0}><IconButton aria-label="투자동향 자료 기준" sx={{p:0}}><img src="/investor-v1/info.svg" alt=""/></IconButton></Tooltip><Select size="small" value={metric} onChange={e=>set({metric:e.target.value})} inputProps={{'aria-label':'거래대금 또는 거래량'}} sx={{ml:'auto',height:28,fontSize:11,minWidth:92,bgcolor:colors.raised}}><MenuItem value="amount">거래대금</MenuItem><MenuItem value="quantity">거래량</MenuItem></Select></Box>
      {subjects.map(actor=>{const row=report?.rows.find(r=>r.code===actor.code);return <Box key={actor.code} sx={{display:'flex',justifyContent:'space-between',alignItems:'center',minHeight:26}}><Typography sx={{fontSize:12}}>{actor.name}</Typography><Typography sx={{fontSize:16,fontWeight:600,color:valueColor(row?.net)}}>{amount(row?.net)}{row?.net!=null?' '+unit:''}</Typography></Box>;})}
     </Card>
     <Card sx={panel}><Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'4px',mb:'4px'}}><Typography component="h2" sx={{...heading,fontSize:12}}>누적 순매수 추이</Typography><Box sx={{display:'flex',gap:'6px'}}>{subjects.map(s=><Typography key={s.code} sx={{fontSize:9,color:s.color,whiteSpace:'nowrap'}}>● {s.name}</Typography>)}</Box></Box><CumulativeChart key={`${mode}:${current?.symbol}:${selectedDate}:${metric}:${period}`} points={report?.points??[]} unit={unit}/><Box sx={{display:'flex',gap:'4px',mt:'4px'}}>{periods.map(([key,label])=><Button key={key} onClick={()=>set({period:key!})} aria-pressed={period===key} sx={{minWidth:0,flex:1,height:28,p:0,fontSize:10,bgcolor:period===key?colors.buttonPrimary:colors.raised,color:colors.textPrimary,borderRadius:'6px'}}>{label}</Button>)}</Box><Typography sx={{fontSize:10,color:colors.textMuted,mt:'6px'}}>{report?.actualFrom?`자료 ${report.actualFrom} ~ ${report.actualTo}${report.partial?' · 일부 기간':''}`:query.isFetching?'조회 중':'저장된 자료 없음'}</Typography></Card>
    </Stack>
    <Card sx={panel}><Box sx={{display:'flex',gap:'8px',alignItems:'center',mb:'4px',flexWrap:'wrap'}}><Typography component="h2" sx={heading}>주체별 거래실적</Typography><Tooltip title={explanation} enterTouchDelay={0}><IconButton aria-label="거래실적 단위와 집계 안내" sx={{p:0}}><img src="/investor-v1/notice.svg" alt=""/></IconButton></Tooltip><Typography sx={{ml:'auto',fontSize:9,color:colors.textMuted}}>기준 {shortDate(selectedDate)} · 갱신 {report?.updatedAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(report.updatedAt)).replace('-','.'): '—'}</Typography></Box>
     <Box role="table" aria-label="주체별 거래실적" sx={{fontVariantNumeric:'tabular-nums'}}><Box role="row" sx={tableRow}>{['주체','매수','매도','순매수'].map((t,i)=><Typography role="columnheader" key={t} sx={{fontSize:11,textAlign:i?'right':'left'}}>{t}</Typography>)}</Box>{subjects.map(actor=>{const row=report?.rows.find(r=>r.code===actor.code);return <Box role="row" key={actor.code} sx={tableRow}><Typography role="cell" sx={{fontSize:11,fontWeight:700}}>{actor.code==='INSTITUTION'?'기관 합계':actor.name}</Typography>{(['buy','sell','net']as const).map(field=><Typography role="cell" key={field} sx={{fontSize:11,textAlign:'right',color:field==='net'?valueColor(row?.net):colors.textPrimary,overflowWrap:'anywhere'}}>{amount(row?.[field])}</Typography>)}</Box>;})}</Box>
     <Typography sx={{fontSize:10,color:colors.textMuted,mt:'8px',overflowWrap:'anywhere'}}>{query.isFetching&&!report?'조회 중':!current?'선택 계좌에 대상 종목이 없습니다.':report?.reason??'자료 조회 대기'}</Typography>
    </Card>
   </Box>
  </Box>
 </>;
}
const tableRow={display:'grid',gridTemplateColumns:'1.25fr repeat(3,minmax(0,1fr))',gap:'4px',py:'4px',alignItems:'center'};
function CumulativeChart({points,unit}:{points:Point[];unit:string}){
 const [active,setActive]=useState<number|null>(null);
 const values=points.flatMap(p=>Object.values(p.values).filter(v=>v!==null).map(Number)),max=Math.max(1,...values.map(Math.abs));
 const x=(i:number)=>28+(points.length===1?145:i/Math.max(1,points.length-1)*290),y=(v:string)=>62-Number(v)/max*48;
 const pointer=(event:React.PointerEvent<SVGSVGElement>)=>{if(!points.length)return;const r=event.currentTarget.getBoundingClientRect();setActive(Math.max(0,Math.min(points.length-1,Math.round(((event.clientX-r.left)/r.width*322-28)/290*(points.length-1)))));};
 return <Box sx={{position:'relative',height:124}}><svg aria-label="투자자 누적 순매수 차트" viewBox="0 0 322 124" width="100%" height="124" onPointerMove={pointer} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);pointer(e);}} onPointerLeave={()=>setActive(null)} style={{touchAction:'pan-y'}}>{[14,62,110].map(v=><line key={v} x1="28" y1={v} x2="318" y2={v} stroke={colors.borderStrong}/>)}{subjects.map(actor=>{let pen=false;const d=points.map((p,i)=>{const value=p.values[actor.code];if(value==null){pen=false;return '';}const step=`${pen?'L':'M'}${x(i)} ${y(value)}`;pen=true;return step;}).join(' ');return <path key={actor.code} d={d} fill="none" stroke={actor.color} strokeWidth="2"/>;})}{active!==null&&points[active]&&<line x1={x(active)} x2={x(active)} y1="10" y2="112" stroke={colors.textMuted} strokeDasharray="3 3"/>}{!values.length&&<text x="161" y="65" textAnchor="middle" fill={colors.textMuted} fontSize="11">저장된 누적 자료 없음</text>}</svg>{active!==null&&points[active]&&<Box role="tooltip" sx={{position:'absolute',top:2,left:32,bgcolor:colors.canvas,p:'6px 8px',border:`1px solid ${colors.borderStrong}`,borderRadius:'6px',fontSize:10,pointerEvents:'none',zIndex:1}}>{points[active]!.date}{subjects.map(s=><Box key={s.code} sx={{color:s.color}}>{s.name} 누적 {amount(points[active]!.values[s.code])} {unit}</Box>)}</Box>}</Box>;
}
