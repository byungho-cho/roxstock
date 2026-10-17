import {InfoOutlined} from '@mui/icons-material';
import {Box,IconButton,Popover,SvgIcon} from '@mui/material';
import {useState,type ReactNode} from 'react';
import {colors} from '../../styles/tokens';
/** Click/keyboard help; Popover's modal handles outside-click/Escape and viewport positioning. */
export function ClickInfo({label,children,tone='default'}:{label:string;children:ReactNode;tone?:'default'|'warning'|'muted'|'danger'}){
 const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
 return <><IconButton aria-label={label+' 설명'} aria-expanded={!!anchor} onClick={e=>{e.stopPropagation();setAnchor(e.currentTarget);}} sx={{p:0,width:24,height:24,flexShrink:0,color:tone==='danger'?'#F87171':tone==='warning'?'#FBBF24':colors.textMuted}}>{tone!=='default'?<SvgIcon sx={{fontSize:16}} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7.5v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></SvgIcon>:<InfoOutlined sx={{fontSize:16}}/>}</IconButton><Popover open={!!anchor} anchorEl={anchor} onClose={()=>setAnchor(null)} anchorOrigin={{vertical:'bottom',horizontal:'left'}} marginThreshold={8} slotProps={{paper:{sx:{p:'12px',maxWidth:'min(420px,calc(100vw - 16px))',bgcolor:colors.raised}}}}><Box role="tooltip" sx={{fontSize:12,lineHeight:'20px',overflowWrap:'anywhere',whiteSpace:'pre-line'}}>{children}</Box></Popover></>;
}
