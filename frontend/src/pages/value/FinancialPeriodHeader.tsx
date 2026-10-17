import {Box,Button,Menu,MenuItem} from '@mui/material';
import {useState} from 'react';
import {colors} from '../../styles/tokens';
import type {FinancialRow} from './valueApi';
import {collectionColor} from './collectionColor';

type PeriodRow = Pick<FinancialRow,'key'|'year'|'quarter'|'label'|'isEstimated'|'collectionState'>;
const yearText = {height:28,minHeight:28,minWidth:0,p:0,fontSize:11,fontWeight:400,justifyContent:'center',color:colors.textMuted,bgcolor:'transparent',border:0,borderRadius:0,'&:hover':{bgcolor:'transparent'},'&.Mui-disabled':{color:colors.disabled},'&.Mui-focusVisible':{outline:`1px solid ${colors.focus}`,outlineOffset:1}} as const;
export function FinancialPeriodHeader({rows,centerYear,currentYear,onCenterChange,onQuarterCenterChange}:{rows:PeriodRow[];centerYear:number;currentYear:number;onCenterChange?:(year:number)=>void;onQuarterCenterChange?:(year:number,quarter:number)=>void}) {
 const [anchor,setAnchor]=useState<HTMLElement|null>(null);
 const quarterly=rows[1]?.quarter!=null,changeable=quarterly?Boolean(onQuarterCenterChange):Boolean(onCenterChange);
 const middle=rows[1],centerOffset=middle?middle.year*4+(middle.quarter??1)-1:0;
 const quarters=Array.from({length:(currentYear-2015+1)*4-2},(_,i)=>{const offset=currentYear*4+2-i;return {year:Math.floor(offset/4),quarter:offset%4+1,offset};});
 const years=Array.from({length:currentYear-2016},(_,i)=>currentYear-1-i);
 return <Box data-testid="financial-period-header" sx={{display:'grid',gridTemplateColumns:`94px repeat(${rows.length},minmax(0,1fr))`,columnGap:.5,px:2,height:28,alignItems:'center',fontSize:11,color:colors.textMuted}}>
  <span>기간</span>{rows.map((row,i)=>{
   const estimated=row.isEstimated===true,label=row.quarter===null?`${row.year}${estimated?'E':''}`:`${row.year} ${row.quarter}Q`;
   const color=collectionColor(row.collectionState),sx={...yearText,color,fontWeight:estimated?700:400,'&.Mui-disabled':{color}};
   if(!changeable)return <span key={row.key} style={{textAlign:'center',color,fontWeight:estimated?700:400}}>{row.quarter===null?label:row.label}</span>;
   if(i===1)return <Button key={i} aria-label={quarterly?"재무지표 중앙분기":"재무지표 중앙연도"} aria-haspopup="listbox" aria-expanded={Boolean(anchor)} aria-controls={anchor?'financial-year-options':undefined} onClick={e=>setAnchor(e.currentTarget)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setAnchor(e.currentTarget);}}} sx={sx}>{label}</Button>;
   return <Button key={i} aria-label={`${i===0?'이전':'다음'} ${quarterly?'분기':'연도'} ${label}`} disabled={quarterly?(i===0?centerOffset<=2015*4+1:centerOffset>=currentYear*4+2):row.year<=2015||row.year>=currentYear} onClick={()=>{if(quarterly){const offset=centerOffset+(i===0?-1:1);onQuarterCenterChange?.(Math.floor(offset/4),offset%4+1);}else onCenterChange?.(centerYear+(i===0?-1:1));}} sx={sx}>{label}</Button>;
  })}
  <Menu anchorEl={anchor} open={Boolean(anchor)&&changeable} onClose={()=>setAnchor(null)} marginThreshold={8} slotProps={{list:{id:'financial-year-options',role:'listbox','aria-label':quarterly?'재무지표 분기 선택':'재무지표 연도 선택'},paper:{sx:{maxHeight:'min(280px, calc(100dvh - 16px))',minWidth:100,bgcolor:colors.surface,border:`1px solid ${colors.borderStrong}`}}}}>
   {quarterly?quarters.map(({year,quarter,offset})=><MenuItem key={offset} role="option" aria-selected={offset===centerOffset} selected={offset===centerOffset} onClick={()=>{setAnchor(null);onQuarterCenterChange?.(year,quarter);}} sx={{fontSize:12,minHeight:32,'&.Mui-selected':{bgcolor:colors.buttonPrimary,color:colors.textPrimary}}}>{year} {quarter}Q</MenuItem>):years.map(year=><MenuItem key={year} role="option" aria-selected={year===centerYear} selected={year===centerYear} onClick={()=>{setAnchor(null);onCenterChange?.(year);}} sx={{fontSize:12,minHeight:32,'&.Mui-selected':{bgcolor:colors.buttonPrimary,color:colors.textPrimary}}}>{year}</MenuItem>)}
  </Menu>
 </Box>;
}
