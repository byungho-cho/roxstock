import {Box,IconButton} from '@mui/material';
export function ReportButton({name,onClick}:{name:string;onClick:()=>void}) {
 return <IconButton aria-label={name+' 가치지표 보고서'} onClick={e=>{e.stopPropagation();onClick();}} sx={{p:0,width:18,height:18,mr:'4px',flexShrink:0,color:'#60A5FA'}}><Box component="img" src="/stocks-v05/report.svg" alt="" sx={{display:'block'}}/></IconButton>;
}
