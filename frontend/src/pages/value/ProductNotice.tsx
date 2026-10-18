import {useState} from 'react';
import {Box,IconButton,Popover} from '@mui/material';
import WarningAmber from '@mui/icons-material/WarningAmber';
export type ProductPolicy={type:string;label:string|null;held:boolean;reason:string|null;policy:string};
export function ProductNotice({policy,showType=true}:{policy?:ProductPolicy;showType?:boolean}){
 const[anchor,setAnchor]=useState<HTMLButtonElement|null>(null);if(!policy?.label)return null;
 return <Box component="span" sx={{display:'inline-flex',alignItems:'center',gap:'2px',color:'#FBBF24',fontSize:10,flexShrink:0,ml:showType?0.5:0}}>{showType?policy.label:null}<IconButton aria-label={policy.label+' 지표 참고 주의'} onClick={e=>{e.stopPropagation();setAnchor(e.currentTarget);}} onKeyDown={e=>e.stopPropagation()} sx={{p:0,width:24,height:24,color:'#FBBF24'}}><WarningAmber sx={{fontSize:15}}/></IconButton><span>지표 참고 주의</span><Popover open={!!anchor} anchorEl={anchor} onClose={()=>setAnchor(null)} onClick={e=>e.stopPropagation()} slotProps={{paper:{sx:{p:1.5,maxWidth:'min(340px,calc(100vw - 16px))',fontSize:11,bgcolor:'#111927'}}}}><div role="tooltip">일반 기업과 분석 기준이 달라 지표 해석에 주의가 필요합니다.<br/>{policy.reason}</div></Popover></Box>;
}
