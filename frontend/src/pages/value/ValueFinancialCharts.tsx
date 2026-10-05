import { Box, Typography } from '@mui/material';
import { useEffect,useRef,useState } from 'react';
import { format,number,type FinancialRow } from './valueApi';
type Metric = { key:keyof FinancialRow; label:string; color:string; scale?:number; right?:boolean };
const red='#fa616e',blue='#6ba7ee',green='#48cba5';
const groups:{title:string;unit:string;rightUnit?:string;metrics:Metric[]}[]=[
 {title:'수익성',unit:'조원',metrics:[{key:'revenue',label:'매출액',color:red,scale:1e12},{key:'operatingProfit',label:'영업이익',color:blue,scale:1e12},{key:'netIncome',label:'순이익',color:green,scale:1e12}]},
 {title:'가치지표',unit:'배',rightUnit:'%',metrics:[{key:'per',label:'PER',color:red},{key:'pbr',label:'PBR',color:blue},{key:'roe',label:'ROE',color:green,right:true}]},
 {title:'안정성',unit:'%',metrics:[{key:'debtRatio',label:'부채비율',color:red},{key:'currentRatio',label:'유동비율',color:blue}]},
 {title:'성장성',unit:'%',metrics:[{key:'revenueGrowth',label:'매출 성장률',color:red},{key:'profitGrowth',label:'이익 성장률',color:blue}]},
];
function Chart({rows,group}:{rows:FinancialRow[];group:typeof groups[number]}) {
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(320);
 useEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);setWidth(el.clientWidth);return()=>observer.disconnect();},[]);
 const values=group.metrics.map(metric=>rows.map(row=>{const raw=row[metric.key];const n=typeof raw==='string'?number(raw):null;return n===null?null:n/(metric.scale??1);}));
 const extent=(right:boolean)=>{const ns=values.flatMap((ns,i)=>Boolean(group.metrics[i].right)===right?ns.filter((n):n is number=>n!==null):[]);const min=Math.min(0,...ns),max=Math.max(0,...ns);return {min,max:max===min?min+1:max};};
 const left=extent(false),right=extent(true),x=(i:number)=>38+(Math.max(1,width-78))*i/Math.max(1,rows.length-1),y=(n:number,axis:typeof left)=>116-(n-axis.min)/(axis.max-axis.min)*86;
 const available=values.some(ns=>ns.some(n=>n!==null));
 return <Box ref={ref} data-no-stock-swipe data-testid={'value-chart-'+group.title}>
  <Box sx={{display:'flex',flexWrap:'wrap',gap:'12px',justifyContent:'center',my:'8px'}}>{group.metrics.map(metric=><Typography key={metric.key} sx={{fontSize:10,color:metric.color}}><Box component="span" sx={{display:'inline-block',width:12,height:2,bgcolor:metric.color,mr:'4px',verticalAlign:'middle'}}/>{metric.label}{metric.right?' (우측 %)':''}</Typography>)}</Box>
  <svg role="img" aria-label={group.title+' '+group.unit+(group.rightUnit?' · 우측 '+group.rightUnit:'')} width="100%" height="148" viewBox={'0 0 '+width+' 148'} style={{display:'block'}}>
   <text x="2" y="11" fill="#94A3B8" fontSize="10">{group.unit}</text>{group.rightUnit&&<text x={width-4} y="11" textAnchor="end" fill="#48cba5" fontSize="10">{group.rightUnit}</text>}
   {[0,1,2,3].map(i=>{const pos=116-i*86/3;return <g key={i}><line x1="38" x2={width-40} y1={pos} y2={pos} stroke="#273244" strokeWidth=".6"/><text x="33" y={pos+3} textAnchor="end" fontSize="10" fill="#94A3B8">{format(left.min+(left.max-left.min)*i/3,1)}</text>{group.rightUnit&&<text x={width-35} y={pos+3} fontSize="10" fill="#48cba5">{format(right.min+(right.max-right.min)*i/3,1)}</text>}</g>;})}
   {group.metrics.map((metric,index)=>{let previous=false;const axis=metric.right?right:left;const d=values[index].map((n,i)=>{if(n===null){previous=false;return '';}const command=(previous?'L':'M')+x(i)+' '+y(n,axis);previous=true;return command;}).join(' ');return <g key={metric.key}><path d={d} fill="none" stroke={metric.color} strokeWidth="1.8"/>{values[index].map((n,i)=>n===null?null:<circle key={i} cx={x(i)} cy={y(n,axis)} r="2" fill={metric.color}><title>{rows[i].label+' '+metric.label+' '+format(n,2,metric.right?'%':group.unit)+(rows[i].metricDate&&['per','pbr','roe'].includes(String(metric.key))?' · 저장 기준일 '+rows[i].metricDate:'')}</title></circle>)}</g>;})}
   {rows.map((row,i)=><text key={row.key} x={x(i)} y="138" textAnchor="middle" fontSize="10" fill="#94A3B8">{row.quarter===null?row.year:rows.length>3?String(row.year).slice(2)+'.'+row.quarter+'Q':row.label}</text>)}
  </svg>
  {!available&&<Typography sx={{fontSize:10,color:'#94A3B8',textAlign:'center'}}>해당 기간의 지표가 미수집되었습니다.</Typography>}
  <Box sx={{display:'grid',gridTemplateColumns:'minmax(75px, 1fr) repeat('+rows.length+', minmax(0, 1fr))',gap:'4px',fontSize:10,color:'#94A3B8',mt:'4px'}}>
   <span>지표</span>{rows.map(row=><span key={row.key} style={{textAlign:'right'}}>{row.quarter===null?row.year:String(row.year).slice(2)+'.'+row.quarter+'Q'}</span>)}
   {group.metrics.map((metric,index)=><Box key={metric.key} sx={{display:'contents'}}><span style={{color:metric.color}}>{metric.label}</span>{values[index].map((n,i)=><span key={i} style={{textAlign:'right',overflowWrap:'anywhere'}}>{format(n,1)}</span>)}</Box>)}
  </Box>
 </Box>;
}
export function ValueFinancialCharts({rows}:{rows:FinancialRow[]}) {return <Box sx={{display:'grid',gap:'8px'}}>{groups.map(group=><Box key={group.title} sx={{bgcolor:'#111927',borderRadius:'8px',p:'8px'}}><Typography sx={{fontSize:12,fontWeight:600}}>{group.title}</Typography><Chart rows={rows} group={group}/></Box>)}</Box>;}
