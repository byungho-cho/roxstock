import {Box} from '@mui/material';
import {useState} from 'react';
import {colors} from '../../styles/tokens';
import {format,number} from '../value/valueApi';
import type {Goal} from './compoundApi';

export function GrowthChart({goal,currentYear,assets}:{goal:Goal;currentYear:number;assets:string|null}){
 const [selected,setSelected]=useState<number|null>(null);
 // One source for SVG, tooltip and table. A stale current-year row cannot override current assets.
 const rows=goal.rows.map(row=>({...row,realizedAsset:row.year>currentYear?null:row.year===currentYear?assets:row.realizedAsset??null}));
 const points=rows.map(row=>({year:row.year,value:number(row.asset),contributed:number(row.contributed),realized:number(row.realizedAsset)}));
 const all=points.flatMap(p=>[p.value,p.contributed,p.realized]).filter((v):v is number=>v!==null);
 const max=Math.max(1,...all),min=Math.min(0,...all),span=max-min;
 const scale=max>=1e12?1e12:max>=1e8?1e8:max>=1e4?1e4:1,unit=scale===1e12?'조':scale===1e8?'억':scale===1e4?'만':'원';
 const x=(index:number)=>32+(index/Math.max(1,points.length-1))*272,y=(value:number)=>118-(value-min)/span*100;
 const path=(key:'value'|'contributed'|'realized')=>{let started=false;return points.map((p,i)=>{const value=p[key];if(value===null){started=false;return '';}const command=(started?'L':'M')+x(i)+','+y(value);started=true;return command;}).join(' ');};
 const currentIndex=points.findIndex(p=>p.year===currentYear),chosen=selected===null?null:rows[selected];
 return <Box sx={{bgcolor:'#0E1729',borderRadius:'8px',p:'10px 16px',minWidth:0}}>
  <Box sx={{fontSize:12,mb:'8px'}}>연도별 예상 자산</Box>
  <Box sx={{fontSize:10,color:colors.textMuted,display:'flex',flexWrap:'wrap',gap:'12px',mb:'4px'}}><span style={{color:goal.displayColor}}>예상 자산</span><span>누적 투입금</span><span style={{color:colors.marketRise}}>실현금액</span></Box>
  <Box sx={{position:'relative',minWidth:0}}>
   <svg role="img" aria-label="연도별 예상 자산과 누적 투입금 · 원" viewBox="0 0 320 150" width="100%" style={{display:'block',touchAction:'pan-y'}} onPointerMove={event=>{
    if(event.pointerType==='touch')return;
    const rect=event.currentTarget.getBoundingClientRect();setSelected(Math.max(0,Math.min(points.length-1,Math.round(((event.clientX-rect.left)/rect.width*320-32)/272*Math.max(1,points.length-1)))));
   }} onPointerLeave={event=>{if(event.pointerType==='mouse')setSelected(null);}}>
    {[0,0.5,1].map(f=><g key={f}><line x1="32" x2="304" y1={y(min+span*f)} y2={y(min+span*f)} stroke="#26354A"/><text x="0" y={y(min+span*f)+3} fill={colors.textMuted} fontSize="10">{format((min+span*f)/scale,1)}{unit}</text></g>)}
    <path d={path('contributed')} fill="none" stroke={colors.textMuted} strokeWidth="1.5" strokeDasharray="3 3"/>
    <path d={path('value')} fill="none" stroke={goal.displayColor} strokeWidth="2"/>
    <path data-testid="compound-realized-line" d={path('realized')} fill="none" stroke={colors.marketRise} strokeWidth="2"/>
    {points.map((p,i)=><g key={p.year}>
     {p.realized!==null&&<circle data-testid={'compound-realized-'+p.year} cx={x(i)} cy={y(p.realized)} r="3" fill={colors.marketRise}/>}
     <rect role="button" tabIndex={0} aria-label={p.year+'년 자산 조회'} aria-describedby={selected===i?'compound-chart-tooltip':undefined} x={x(i)-Math.min(12,136/Math.max(1,points.length-1))} y="16" width={Math.min(24,272/Math.max(1,points.length-1))} height="110" fill="transparent" style={{cursor:'pointer',outline:selected===i?'1px solid #60A5FA':undefined}} onPointerDown={()=>setSelected(i)} onFocus={()=>setSelected(i)} onKeyDown={event=>{
      if(['ArrowLeft','ArrowRight','Home','End','Enter',' ','Escape'].includes(event.key)){event.preventDefault();if(event.key==='Escape')setSelected(null);else setSelected(current=>event.key==='Home'?0:event.key==='End'?points.length-1:event.key==='ArrowLeft'?Math.max(0,(current??i)-1):event.key==='ArrowRight'?Math.min(points.length-1,(current??i)+1):i);}
     }}/>
    </g>)}
    {points.filter((_,i)=>i===0||i===points.length-1||i===currentIndex).map(p=><text key={p.year} x={x(points.indexOf(p))} y="144" textAnchor="middle" fontSize="10" fill={colors.textMuted}>{p.year}</text>)}
   </svg>
   {chosen&&<Box id="compound-chart-tooltip" role="tooltip" sx={{position:'absolute',left:0,right:0,top:0,mx:'8px',p:'6px 8px',bgcolor:'#111827',border:'1px solid #334155',borderRadius:'4px',fontSize:10,pointerEvents:'none',overflowWrap:'anywhere',zIndex:1}}>
    <Box>{chosen.year}년</Box>{[{label:'목표금액',value:chosen.asset},{label:'누적 투입금',value:chosen.contributed},{label:'실현금액',value:chosen.realizedAsset}].map(row=><Box key={row.label} sx={{display:'flex',justifyContent:'space-between',gap:'8px'}}><span>{row.label}</span><Box sx={{minWidth:0,textAlign:'right'}}>{row.value==null?'데이터 없음':format(row.value,0,'원')}</Box></Box>)}
   </Box>}
  </Box>
  <Box role="table" aria-label="연도별 실현금액과 목표금액" sx={{mt:'8px',fontSize:11}}>
   <Box role="row" sx={{display:'grid',gridTemplateColumns:'44px minmax(0,1fr) minmax(0,1fr)',gap:'8px',color:colors.textMuted,mb:'8px'}}>{['연도','실현금액','목표금액'].map((label,i)=><Box key={label} role="columnheader" sx={{textAlign:i?'right':'left'}}>{label}</Box>)}</Box>
   {rows.map(row=>{const realized=row.realizedAsset,met=row.realizedTargetMet??(number(realized)!==null&&number(row.asset)!==null?number(realized)!>=number(row.asset)!:null),color=realized==null?colors.textMuted:row.year<currentYear?(met?'#FA616E':'#60A5FA'):colors.textPrimary;
    return <Box key={row.year} role="row" data-testid={'compound-year-'+row.year} sx={{display:'grid',gridTemplateColumns:'44px minmax(0,1fr) minmax(0,1fr)',gap:'8px',mb:'8px',alignItems:'start'}}>
     <Box role="cell" sx={{color:colors.textMuted}}>{row.year}</Box><Box role="cell" sx={{textAlign:'right',overflowWrap:'anywhere',minWidth:0,color}}>{format(realized,0,'원')}</Box><Box role="cell" sx={{textAlign:'right',overflowWrap:'anywhere',minWidth:0,color:row.year<currentYear?colors.textMuted:colors.textPrimary}}>{format(row.asset,0,'원')}</Box>
    </Box>;
   })}
  </Box>
 </Box>;
}
