import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import {useQuery} from '@tanstack/react-query';
import {useLocation,useNavigate} from 'react-router-dom';
import {FinancialPeriodHeader} from './FinancialPeriodHeader';
import { Box, Typography, IconButton, Popover, Button, Dialog, CircularProgress } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { useEffect,useRef,useState } from 'react';
import { format,number,allFinancialRows,type FinancialRow } from './valueApi';
type Metric = { key:keyof FinancialRow; label:string; color:string; scale?:number; right?:boolean };
const red='#fa616e',blue='#6ba7ee',green='#48cba5';
const groups:{title:string;unit:string;rightUnit?:string;metrics:Metric[]}[]=[
 {title:'수익성',unit:'조원',metrics:[{key:'revenue',label:'매출액',color:red,scale:1e12},{key:'operatingProfit',label:'영업이익',color:blue,scale:1e12},{key:'netIncome',label:'순이익',color:green,scale:1e12}]},
 {title:'가치지표',unit:'배',rightUnit:'%',metrics:[{key:'per',label:'PER',color:red},{key:'pbr',label:'PBR',color:blue},{key:'roe',label:'ROE',color:green,right:true}]},
 {title:'안정성',unit:'%',metrics:[{key:'debtRatio',label:'부채비율',color:red}]},
 {title:'성장성',unit:'%',metrics:[{key:'revenueGrowth',label:'매출 성장률',color:red},{key:'profitGrowth',label:'이익 성장률',color:blue}]},
];
function currencyGroup(group:typeof groups[number],rows:FinancialRow[]):typeof groups[number] {
 if(group.title!=='수익성')return group;
 const maximum=Math.max(0,...group.metrics.flatMap(metric=>rows.map(row=>Math.abs(number(typeof row[metric.key]==='string'?row[metric.key] as string:null)??0))));
 const [scale,unit]=maximum>=1e12?[1e12,'조원']:maximum>=1e8?[1e8,'억원']:maximum>=1e4?[1e4,'만원']:[1,'원'];
 return {...group,unit:String(unit),metrics:group.metrics.map(metric=>({...metric,scale:Number(scale)}))};
}
function Chart({rows,group,expanded=false}:{rows:FinancialRow[];group:typeof groups[number];expanded?:boolean}) {
 const ref=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:320,height:116}),[active,setActive]=useState<number|null>(null);
 useEffect(()=>{setActive(null);},[rows,group.title]);
 useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setSize({width:el.clientWidth,height:expanded?Math.max(120,el.clientHeight):116});const observer=new ResizeObserver(update);observer.observe(el);update();return()=>observer.disconnect();},[expanded]);
 const {width,height}=size,top=12,bottom=height-30,leftPadding=38,plotWidth=Math.max(1,width-76);
 const rawValues=group.metrics.map(metric=>rows.map(row=>{const raw=row[metric.key];return typeof raw==='string'?number(raw):null;}));
 const first=rawValues.map(ns=>ns.findIndex(n=>n!==null));
 // Leading gaps only: original rows/API values are never mutated, and interior gaps stay null.
 const synthetic=(metric:number,index:number)=>expanded&&first[metric]>index&&first[metric]>=0;
 const values=rawValues.map((ns,metric)=>ns.map((n,i)=>synthetic(metric,i)?0:n===null?null:n/(group.metrics[metric].scale??1)));
 const extent=(right:boolean)=>{const ns=values.flatMap((ns,i)=>Boolean(group.metrics[i].right)===right?ns.filter((n):n is number=>n!==null):[]);const min=Math.min(0,...ns),max=Math.max(0,...ns);return {min,max:max===min?min+1:max};};
 const left=extent(false),right=extent(true),x=(i:number)=>leftPadding+plotWidth*i/Math.max(1,rows.length-1),y=(n:number,axis:typeof left)=>bottom-(n-axis.min)/(axis.max-axis.min)*(bottom-top);
 const available=rawValues.some(ns=>ns.some(n=>n!==null));
 const drag=(clientX:number)=>{if(!ref.current||!rows.length)return;const index=Math.round((clientX-ref.current.getBoundingClientRect().left-leftPadding)/plotWidth*(rows.length-1));setActive(Math.max(0,Math.min(rows.length-1,index)));};
 const valueText=(metric:number,index:number)=>synthetic(metric,index)||values[metric][index]===null?'데이터 없음':format(values[metric][index],2,group.metrics[metric].right?'%':group.unit);
 return <Box sx={{display:'flex',flexDirection:'column',minHeight:0,...(expanded?{flex:1}:{})}} data-no-stock-swipe data-testid={'value-chart-'+group.title}>
  {available?<><Box ref={ref} sx={{position:'relative',minHeight:120,...(expanded?{flex:1}:{height:116}),touchAction:'pan-y'}}>
   <svg role="img" aria-label={group.title+' '+group.unit+(group.rightUnit?' · 우측 '+group.rightUnit:'')} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{display:'block',touchAction:expanded?'none':'pan-y'}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag(e.clientX);}} onPointerMove={e=>{if(e.buttons||e.pointerType==='touch')drag(e.clientX);}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setActive(i=>Math.max(0,Math.min(rows.length-1,(i??0)+(e.key==='ArrowRight'?1:-1))));}}} tabIndex={0}>
    {[0,1,2].map(i=><g key={i}><line x1={leftPadding} x2={width-leftPadding} y1={top+i*(bottom-top)/2} y2={top+i*(bottom-top)/2} stroke="#334155" strokeWidth=".6"/>{expanded&&<text x="2" y={top+i*(bottom-top)/2+4} fontSize="10" fill="#94A3B8">{format(left.max-i*(left.max-left.min)/2,1)}</text>}{expanded&&group.rightUnit&&<text x={width-2} y={top+i*(bottom-top)/2+4} textAnchor="end" fontSize="10" fill="#94A3B8">{format(right.max-i*(right.max-right.min)/2,1,'%')}</text>}</g>)}
    {group.metrics.map((metric,index)=>{let previous=false;const axis=metric.right?right:left;const d=values[index].map((n,i)=>{if(n===null){previous=false;return '';}const command=(previous?'L':'M')+x(i)+' '+y(n,axis);previous=true;return command;}).join(' ');return <g key={metric.key}><path d={d} fill="none" stroke={metric.color} strokeWidth="1.8"/>{values[index].map((n,i)=>n===null?null:<circle key={i} cx={x(i)} cy={y(n,axis)} r="2" fill={metric.color}><title>{rows[i].label+' '+metric.label+' '+valueText(index,i)}</title></circle>)}</g>;})}
    {rows.map((row,i)=>(!expanded||i===0||i===rows.length-1||i%Math.max(1,Math.ceil(rows.length/(width/55)))===0&&x(rows.length-1)-x(i)>48)&&<text key={row.key} x={x(i)} y={height-7} textAnchor="middle" fontSize="10" fill={row.isEstimated?'#FBBF24':'#94A3B8'} fontWeight={row.isEstimated?700:400}>{row.quarter===null?`${row.year}${row.isEstimated?'E':''}`:String(row.year).slice(2)+'.'+row.quarter+'Q'}</text>)}
    {active!==null&&rows[active]&&<line data-testid="financial-drag-guide" x1={x(active)} x2={x(active)} y1={top} y2={bottom} stroke="#FBBF24" strokeDasharray="3 3"/>}
   </svg>
   {active!==null&&rows[active]&&<Box role="status" data-testid="financial-chart-tooltip" sx={{position:'absolute',top:4,left:Math.max(0,Math.min(width-190,x(active)-95)),width:190,maxWidth:'100%',pointerEvents:'none',bgcolor:'#182232',border:'1px solid #334155',borderRadius:1,p:.75,fontSize:11}}><b>{rows[active].label}{rows[active].isEstimated&&!rows[active].label.endsWith('E')?'E':''}</b>{group.metrics.map((metric,i)=><Box key={metric.key} sx={{color:metric.color}}>{metric.label} {valueText(i,active)}</Box>)}</Box>}
  </Box>
  <Box sx={{display:'flex',flexWrap:'wrap',gap:1.5,justifyContent:'flex-start',my:.5}}>{group.metrics.map(metric=><Typography key={metric.key} sx={{fontSize:10,color:metric.color}}><Box component="span" sx={{display:'inline-block',width:6,height:6,borderRadius:3,bgcolor:metric.color,mr:.5}}/>{metric.label}{metric.right?' (우측 %)':''}</Typography>)}</Box>
  {expanded?group.metrics.map((metric,index)=>first[index]>0?<Typography key={metric.key} sx={{fontSize:11,color:'#FBBF24'}}>{metric.label}: {rows[first[index]].year}년도부터 데이터가 제공됩니다.</Typography>:null):<Box sx={{display:'grid',gridTemplateColumns:`94px repeat(${rows.length}, minmax(0, 1fr))`,gap:1,fontSize:11,lineHeight:'20px',color:'#94A3B8',mt:.5}}>{group.metrics.map((metric,index)=><Box key={metric.key} sx={{display:'contents'}}><span>{metric.label}{group.title==='수익성'?`(${group.unit})`:''}</span>{values[index].map((n,i)=><span key={i} style={{textAlign:'right',overflowWrap:'anywhere'}}>{format(n,1,metric.right||group.unit==='%'?'%':'')}</span>)}</Box>)}</Box>}
  </>:<Typography role="status" sx={{fontSize:12,color:'#94A3B8',textAlign:'center',py:3,...(expanded?{flex:1,display:'grid',placeItems:'center'}:{})}}>내용이 없습니다.</Typography>}
 </Box>;
}
function MetricNotice({rows,notes=[]}:{rows:FinancialRow[];notes?:string[]}) {
 const [anchor,setAnchor]=useState<HTMLElement|null>(null);
 const notices=rows.flatMap(row=>{
  const reasons=[...new Set(Object.values(row.metricReasons??{}))];
  const availability=row.availability==='NO_FILING'?'미공시':row.availability==='PRE_LISTING'?'상장 전':row.availability==='FAILED'?'재무자료 수집 실패':!row.source?'미수집':row.metricStatus==='NOT_COLLECTED'?'가치지표 미수집':null;
  if(availability)reasons.unshift(availability);
  if(row.metricProvenance?.roeBasis==='TOTAL_SAME_DIVISION')reasons.push('ROE: 전체 연결/별도 자본 기준');
  if(row.metricProvenance?.flow==='YTD_ANNUALIZED_NOT_TTM')reasons.push('누적 실적 연환산(TTM 아님)');
  if(row.metricProvenance?.fsDivision)reasons.push('재무제표 기준: '+row.metricProvenance.fsDivision);
  if(row.metricProvenance?.priceDate)reasons.push('종가 기준일: '+row.metricProvenance.priceDate);
  return reasons.length?[{key:row.key,label:row.label,reasons:[...new Set(reasons)]}]:[];
 });
 if(!notices.length&&!notes.length)return null;
 return <><IconButton size="small" aria-label="가치지표 미산출 사유와 계산 기준" aria-expanded={Boolean(anchor)} aria-controls={anchor?'metric-notice-tooltip':undefined} onClick={e=>setAnchor(anchor?null:e.currentTarget)} sx={{color:'#FBBF24',p:'2px',ml:'4px'}}><WarningAmberRoundedIcon sx={{fontSize:18}}/></IconButton>
 <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={()=>setAnchor(null)} anchorOrigin={{vertical:'bottom',horizontal:'left'}} marginThreshold={8} slotProps={{paper:{sx:{width:320,maxWidth:'calc(100vw - 16px)',maxHeight:'min(280px, calc(100dvh - 32px))',overflowY:'auto',p:1.5,bgcolor:'#182232',border:'1px solid #334155'}}}}>
 <Box id="metric-notice-tooltip" role="dialog" aria-label="가치지표 안내" tabIndex={0} onKeyDown={e=>{if(e.key==='Escape')setAnchor(null);}}>{[...new Set(notes)].map(note=><Typography key={note} sx={{fontSize:11,mb:1}}>{note}</Typography>)}{notices.map(n=><Box key={n.key} sx={{mb:1}}><Typography sx={{fontSize:12,fontWeight:600}}>{n.label}</Typography>{n.reasons.map(reason=><Typography key={reason} sx={{fontSize:11,color:'#CBD5E1',overflowWrap:'anywhere'}}>{reason}</Typography>)}</Box>)}</Box>
 </Popover></>;
}
export function ValueFinancialCharts({rows,notes=[],stockId,mode='annual',currentYear=new Date().getFullYear(),centerYear=currentYear-1,onCenterChange}:{rows:FinancialRow[];notes?:string[];stockId?:string;mode?:'annual'|'quarter';currentYear?:number;centerYear?:number;onCenterChange?:(year:number)=>void}) {
 const location=useLocation(),navigate=useNavigate(),params=new URLSearchParams(location.search),selected=params.get('chartDetail'),group=groups.find(g=>g.title===selected);
 const all=useQuery({queryKey:['financialChartAll',stockId,mode,currentYear],queryFn:({signal})=>allFinancialRows(stockId!,currentYear,mode,signal),enabled:!!group&&!!stockId,staleTime:30000});
 const open=(title:string)=>{const search=new URLSearchParams(location.search);search.set('chartDetail',title);navigate(location.pathname+'?'+search,{state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key,financialChartOrigin:true}});};
 const close=()=>{if(location.state?.financialChartOrigin&&Number(window.history.state?.idx)>0)navigate(-1);else {const search=new URLSearchParams(location.search);search.delete('chartDetail');navigate(location.pathname+'?'+search,{replace:true,state:location.state});}};
 return <Box sx={{display:'grid',gap:1}}>
  <FinancialPeriodHeader rows={rows} centerYear={centerYear} currentYear={currentYear} onCenterChange={onCenterChange}/>
  {groups.map(g=><Box key={g.title} sx={{bgcolor:'#111927',borderRadius:1,p:'8px 16px'}}><Box sx={{display:'flex',alignItems:'center'}}><Typography sx={{fontSize:13,fontWeight:600}}>{g.title}</Typography>{g.title==='가치지표'&&<MetricNotice rows={rows} notes={notes}/>}<Button size="small" disabled={!stockId} onClick={()=>open(g.title)} sx={{ml:'auto',p:0,minWidth:0,fontSize:10,color:'#94A3B8'}}>상세보기</Button></Box><Chart rows={rows} group={currencyGroup(g,rows)}/></Box>)}
  <Dialog fullScreen transitionDuration={0} open={!!group} onClose={close} aria-label="재무지표 차트 상세보기" slotProps={{paper:{'aria-label':'재무지표 차트 상세보기',sx:{bgcolor:'#080F1C',backgroundImage:'none',p:1,overflow:'hidden',display:'flex',flexDirection:'column'}}}}>
   <Box sx={{display:'flex',alignItems:'center',gap:1,minHeight:36,flexShrink:0}}><IconButton aria-label="차트 상세보기 뒤로가기" onClick={close} size="small"><ArrowBackRoundedIcon/></IconButton><Typography sx={{fontSize:14,fontWeight:600}}>{group?.title}</Typography><Typography sx={{ml:'auto',fontSize:11,color:'#94A3B8'}}>2015–{currentYear} · {mode==='annual'?'연간':'분기'}</Typography></Box>
   {all.isPending?<Box sx={{flex:1,display:'grid',placeItems:'center'}}><CircularProgress size={24}/></Box>:all.isError?<Box role="alert" sx={{p:2}}>전체 기간 조회에 실패했습니다.<Button onClick={()=>void all.refetch()}>다시 조회</Button></Box>:group&&<Chart key={group.title+mode+stockId} rows={all.data??[]} group={currencyGroup(group,all.data??[])} expanded/>}
  </Dialog>
 </Box>;
}
