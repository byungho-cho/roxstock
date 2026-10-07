import { Box, Typography, IconButton, Popover } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { useEffect,useRef,useState } from 'react';
import { format,number,type FinancialRow } from './valueApi';
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
function Chart({rows,group}:{rows:FinancialRow[];group:typeof groups[number]}) {
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(320);
 useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);setWidth(el.clientWidth);return()=>observer.disconnect();},[]);
 const values=group.metrics.map(metric=>rows.map(row=>{const raw=row[metric.key];const n=typeof raw==='string'?number(raw):null;return n===null?null:n/(metric.scale??1);}));
 const extent=(right:boolean)=>{const ns=values.flatMap((ns,i)=>Boolean(group.metrics[i].right)===right?ns.filter((n):n is number=>n!==null):[]);const min=Math.min(0,...ns),max=Math.max(0,...ns);return {min,max:max===min?min+1:max};};
 const left=extent(false),right=extent(true),x=(i:number)=>Math.min(38,width/6)+(Math.max(1,width-76))*i/Math.max(1,rows.length-1),y=(n:number,axis:typeof left)=>84-(n-axis.min)/(axis.max-axis.min)*74;
 const available=values.some(ns=>ns.some(n=>n!==null));
 return <Box ref={ref} data-no-stock-swipe data-testid={'value-chart-'+group.title}>
  <svg role="img" aria-label={group.title+' '+group.unit+(group.rightUnit?' · 우측 '+group.rightUnit:'')} width="100%" height="116" viewBox={'0 0 '+width+' 116'} style={{display:'block'}}>
   {[0,1,2].map(i=><line key={i} x1="0" x2={width} y1={10+i*37} y2={10+i*37} stroke="#334155" strokeWidth=".6"/>)}
   {group.metrics.map((metric,index)=>{let previous=false;const axis=metric.right?right:left;const d=values[index].map((n,i)=>{if(n===null){previous=false;return '';}const command=(previous?'L':'M')+x(i)+' '+y(n,axis);previous=true;return command;}).join(' ');return <g key={metric.key}><path d={d} fill="none" stroke={metric.color} strokeWidth="1.8"/>{values[index].map((n,i)=>n===null?null:<circle key={i} cx={x(i)} cy={y(n,axis)} r="2" fill={metric.color}><title>{rows[i].label+' '+metric.label+' '+format(n,2,metric.right?'%':group.unit)+(rows[i].metricDate&&['per','pbr','roe'].includes(String(metric.key))?' · 저장 기준일 '+rows[i].metricDate:'')}</title></circle>)}</g>;})}
   {rows.map((row,i)=><text key={row.key} x={x(i)} y="110" textAnchor="middle" fontSize="10" fill="#94A3B8">{row.quarter===null?row.year:rows.length>3?String(row.year).slice(2)+'.'+row.quarter+'Q':row.label}</text>)}
  </svg>
  <Box sx={{display:'flex',flexWrap:'wrap',gap:'12px',justifyContent:'flex-start',my:'4px'}}>{group.metrics.map(metric=><Typography key={metric.key} sx={{fontSize:10,color:metric.color}}><Box component="span" sx={{display:'inline-block',width:6,height:6,borderRadius:3,bgcolor:metric.color,mr:'4px',verticalAlign:'middle'}}/>{metric.label}{metric.right?' (우측 %)':''}</Typography>)}</Box>

  {!available&&<Typography sx={{fontSize:10,color:'#94A3B8',textAlign:'center'}}>표시할 지표가 없습니다. 기간별 사유를 확인하세요.</Typography>}
  <Box sx={{display:'grid',gridTemplateColumns:'94px repeat('+rows.length+', minmax(0, 1fr))',gap:'8px',fontSize:11,lineHeight:'20px',color:'#94A3B8',mt:'4px'}}>
   {group.metrics.map((metric,index)=><Box key={metric.key} sx={{display:'contents'}}><span>{metric.label}{group.title==='수익성'?`(${group.unit})`:''}</span>{values[index].map((n,i)=><span key={i} style={{textAlign:'right',overflowWrap:'anywhere'}}>{format(n,1,metric.right||group.unit==='%'?'%':'')}</span>)}</Box>)}
  </Box>
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
export function ValueFinancialCharts({rows,notes=[]}:{rows:FinancialRow[];notes?:string[]}) {return <Box sx={{display:'grid',gap:'8px'}}><Box sx={{display:'grid',gridTemplateColumns:'94px repeat('+rows.length+',minmax(0,1fr))',gap:'8px',px:'16px',fontSize:11,color:'#94a3b8'}}><span>기간</span>{rows.map(r=><span key={r.key} style={{textAlign:'right'}}>{r.label}</span>)}</Box>{groups.map(group=><Box key={group.title} sx={{bgcolor:'#111927',borderRadius:'8px',p:'8px 16px'}}><Box sx={{display:'flex',alignItems:'center'}}><Typography sx={{fontSize:13,fontWeight:600}}>{group.title}</Typography>{group.title==='가치지표'&&<MetricNotice rows={rows} notes={notes}/>}</Box><Chart rows={rows} group={currencyGroup(group,rows)}/></Box>)}</Box>;}
