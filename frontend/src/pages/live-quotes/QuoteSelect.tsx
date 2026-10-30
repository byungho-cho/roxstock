import {useState} from 'react';
import {Select,MenuItem} from '@mui/material';
import {KeyboardArrowDownRounded} from '@mui/icons-material';
import {usePopupHistory} from '../../hooks/usePopupHistory';
import {colors} from '../../styles/tokens';

/** Same MUI select/theme as forms and StockToolbar; never a native mobile picker. */
export function QuoteSelect({label,value,options,onChange,disabled=false,plain=false}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void;disabled?:boolean;plain?:boolean}){
  const [open,setOpen]=useState(false);
  const consume=usePopupHistory(open,()=>setOpen(false));
  const close=()=>{setOpen(false);void consume();};
  return <Select size="small" open={open} onOpen={()=>setOpen(true)} onClose={close} value={value} disabled={disabled}
    inputProps={{'aria-label':label}} IconComponent={KeyboardArrowDownRounded}
    onChange={e=>{close();onChange(e.target.value);}}
    sx={{height:28,minWidth:0,width:'100%',fontSize:12,bgcolor:plain?'transparent':colors.raised,borderRadius:'8px','& fieldset':plain?{border:0}:{},'& .MuiSelect-select':{py:0,pl:'8px',pr:'22px !important'},'& .MuiSelect-icon':{right:3,fontSize:16}}}
    MenuProps={{variant:'menu',anchorOrigin:{vertical:'bottom',horizontal:'right'},transformOrigin:{vertical:'top',horizontal:'right'},marginThreshold:8,disableScrollLock:true,
      slotProps:{paper:{sx:{mt:'4px',maxHeight:'min(240px, calc(100dvh - 130px))',maxWidth:'calc(100vw - 16px)',border:`1px solid ${colors.border}`,bgcolor:colors.raised,'& li':{minHeight:36,fontSize:12,px:'12px'}}}}}}>
    {options.map(o=><MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
  </Select>;
}
