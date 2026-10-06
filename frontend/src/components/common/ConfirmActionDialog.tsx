import {Box, Button, Dialog, Stack, Typography} from '@mui/material';
import type {ReactNode} from 'react';
import {colors} from '../../styles/tokens';
export function ConfirmActionDialog({open,title,name,detail,amount,children,onClose,onConfirm,busy=false,disabled=false,confirmLabel='삭제',danger=true,width=338}:{open:boolean;title:string;name?:string;detail?:string;amount?:string;children?:ReactNode;onClose:()=>void;onConfirm:()=>void;busy?:boolean;disabled?:boolean;confirmLabel?:string;danger?:boolean;width?:number}) {
 return <Dialog open={open} onClose={()=>!busy&&onClose()} aria-labelledby="confirm-action-title" slotProps={{paper:{sx:{m:2,width:'calc(100% - 32px)',maxWidth:width,p:'20px',borderRadius:'8px',bgcolor:colors.surface,border:`1px solid ${colors.border}`,backgroundImage:'none'}}}}>
 <Stack spacing="14px"><Typography id="confirm-action-title" sx={{fontSize:18,fontWeight:600}}>{title}</Typography>
 {(name||detail||amount)&&<Box>{name&&<Typography sx={{fontSize:15,fontWeight:600,mb:'4px'}}>{name}</Typography>}<Stack direction="row" sx={{justifyContent:'space-between',gap:1,fontSize:12,color:colors.textSecondary}}><span>{detail}</span><span>{amount}</span></Stack></Box>}
 <Box sx={{fontSize:12,color:colors.textSecondary}}>{children}</Box>
 <Stack direction="row" spacing="10px"><Button variant="outlined" disabled={busy} onClick={onClose} sx={{flex:1,height:44,minHeight:44,borderRadius:'8px',borderColor:colors.border,color:colors.textSecondary}}>취소</Button><Button variant="contained" disabled={busy||disabled} onClick={onConfirm} sx={{flex:1,height:44,minHeight:44,borderRadius:'8px',color:'#fff',bgcolor:danger?'#f87171':colors.buttonPrimary,'&:hover':{bgcolor:danger?'#ef6464':colors.buttonPrimary}}}>{busy?'처리 중…':confirmLabel}</Button></Stack></Stack></Dialog>;
}
