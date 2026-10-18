import {Box,Button} from '@mui/material';
export type AnalysisScope='all'|'interest';
export function AnalysisScopeToggle({value,onChange}:{value:AnalysisScope;onChange:(value:AnalysisScope)=>void}){
 return <Box role="group" aria-label="분석 종목 범위" sx={{display:'flex',alignItems:'stretch',boxSizing:'border-box',height:28,border:'1px solid #273244',borderRadius:'8px',overflow:'hidden',flexShrink:0}}>{(['all','interest'] as const).map(scope=><Button key={scope} aria-pressed={value===scope} onClick={()=>onChange(scope)} sx={{minWidth:48,minHeight:0,height:'100%',display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',p:'0 10px',fontSize:12,lineHeight:1,borderRadius:0,color:value===scope?'#F8FAFC':'#94A3B8',bgcolor:value===scope?'#3378e5':'transparent','&:hover':{bgcolor:value===scope?'#3378e5':'#1e293b'}}}>{scope==='all'?'전체':'관심'}</Button>)}</Box>;
}
