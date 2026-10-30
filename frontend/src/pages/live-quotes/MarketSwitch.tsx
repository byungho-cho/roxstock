import {useId} from 'react';
import {Box,Button} from '@mui/material';
import type {QuoteMarket} from '../../../../shared/src/domain/live-quotes';
import {colors} from '../../styles/tokens';
const choices=[{value:'TOTAL',label:'통합'},{value:'NXT',label:'NXT'},{value:'KRX',label:'KRX'}] as const;
export function MarketSwitch({value,onChange,disabled=false}:{value:QuoteMarket;onChange:(value:QuoteMarket)=>void;disabled?:boolean}){
  const id=useId(),index=choices.findIndex(c=>c.value===value);
  return <Box role="radiogroup" aria-label="시세 시장" onKeyDown={event=>{
    if(disabled)return;
    const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;
    if(next<0)return;event.preventDefault();onChange(choices[next]!.value);queueMicrotask(()=>document.getElementById(id+'-'+next)?.focus());
  }} sx={{position:'relative',display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',height:28,p:'2px',borderRadius:'999px',bgcolor:colors.raised,border:`1px solid ${colors.borderStrong}`}}>
    <Box aria-hidden="true" data-testid="market-switch-thumb" sx={{position:'absolute',top:2,left:2,width:'calc((100% - 4px) / 3)',height:'calc(100% - 4px)',borderRadius:'999px',bgcolor:colors.buttonPrimary,transform:`translateX(${index*100}%)`,transition:'transform 180ms cubic-bezier(.2,.8,.2,1)','@media(prefers-reduced-motion:reduce)':{transition:'none'}}}/>
    {choices.map((choice,i)=><Button key={choice.value} id={id+'-'+i} role="radio" aria-checked={value===choice.value} tabIndex={value===choice.value?0:-1} disabled={disabled} onClick={()=>onChange(choice.value)} sx={{minWidth:0,p:0,height:22,minHeight:22,zIndex:1,borderRadius:'999px',fontSize:11,lineHeight:1,color:value===choice.value?colors.textPrimary:colors.textMuted,'&:hover':{bgcolor:'transparent'},'&.Mui-focusVisible':{outline:`1px solid ${colors.focus}`,outlineOffset:1}}}>{choice.label}</Button>)}
  </Box>;
}
