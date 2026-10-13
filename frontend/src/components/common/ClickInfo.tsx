import {InfoOutlined} from '@mui/icons-material';
import {Box,IconButton,Popover} from '@mui/material';
import {useState,type ReactNode} from 'react';
import {colors} from '../../styles/tokens';
/** Click/keyboard help; Popover's modal handles outside-click/Escape and viewport positioning. */
export function ClickInfo({label,children}:{label:string;children:ReactNode}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 return <><IconButton aria-label={label+' 설명'} aria-expanded={!!anchor} onClick={e=>{e.stopPropagation();setAnchor(e.currentTarget);}} sx={{p:0,width:24,height:24,flexShrink:0,color:colors.textMuted}}><InfoOutlined sx={{fontSize:16}}/></IconButton><Popover open={!!anchor} anchorEl={anchor} onClose={()=>setAnchor(null)} anchorOrigin={{vertical:'bottom',horizontal:'left'}} marginThreshold={8} slotProps={{paper:{sx:{p:'12px',maxWidth:'min(420px,calc(100vw - 16px))',bgcolor:colors.raised}}}}><Box role="tooltip" sx={{fontSize:12,lineHeight:'20px',overflowWrap:'anywhere',whiteSpace:'pre-line'}}>{children}</Box></Popover></>;
}
