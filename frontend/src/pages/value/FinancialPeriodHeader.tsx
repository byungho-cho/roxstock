import {Box,Button} from '@mui/material';
import type {FinancialRow} from './valueApi';

export const financialSmallButton = {height:28,minHeight:28,minWidth:0,fontSize:11,px:1,whiteSpace:'nowrap'} as const;
export function FinancialPeriodHeader({rows,centerYear,currentYear,onCenterChange}:{rows:FinancialRow[];centerYear:number;currentYear:number;onCenterChange?:(year:number)=>void}) {
 const years=Array.from({length:currentYear-2016},(_,i)=>currentYear-1-i);
 return <Box data-testid="financial-period-header" sx={{display:'grid',gridTemplateColumns:`94px repeat(${rows.length},minmax(0,1fr))`,gap:1,px:2,height:28,alignItems:'center',fontSize:11,color:'#94A3B8'}}>
  <span>기간</span>{rows.map((row,i)=>{
   const estimated=row.isEstimated===true,label=`${row.year}${estimated?'E':''}`;
   if(!onCenterChange||row.quarter!==null)return <span key={row.key} style={{textAlign:'right',color:estimated?'#FBBF24':undefined,fontWeight:estimated?700:400}}>{row.quarter===null?label:row.label}</span>;
   if(i===1)return <select key={row.key} aria-label="재무지표 중앙연도" value={centerYear} onChange={e=>onCenterChange(Number(e.target.value))} style={{height:28,width:'100%',minWidth:0,textAlign:'right',color:estimated?'#FBBF24':'#F8FAFC',fontWeight:estimated?700:400,border:'1px solid #334155',borderRadius:4,background:'#111927',fontSize:11}}>{years.map(year=><option key={year} value={year}>{year}{year===row.year&&estimated?'E':''}</option>)}</select>;
   return <Button key={row.key} aria-label={`${i===0?'이전':'다음'} 연도 ${row.year}`} disabled={row.year<=2015||row.year>=currentYear} onClick={()=>onCenterChange(centerYear+(i===0?-1:1))} sx={{...financialSmallButton,px:0,justifyContent:'flex-end',color:estimated?'#FBBF24':'#94A3B8',fontWeight:estimated?700:400,'&.Mui-disabled':{color:estimated?'#FBBF24':undefined}}}>{label}</Button>;
  })}
 </Box>;
}
