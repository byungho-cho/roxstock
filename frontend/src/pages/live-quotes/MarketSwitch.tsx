import {Box,Button} from '@mui/material';
import type {QuoteMarket} from '../../../../shared/src/domain/live-quotes';
import {colors} from '../../styles/tokens';
const choices=[{value:'TOTAL',label:'통합'},{value:'NXT',label:'NXT'},{value:'KRX',label:'KRX'}] as const;
export function MarketSwitch({value,onChange,disabled=false}:{value:QuoteMarket;onChange:(value:QuoteMarket)=>void;disabled?:boolean}){
  const index=choices.findIndex(c=>c.value===value),next=(index+1)%3;
  return <Button aria-label={'시세 시장: '+choices[index]!.label+', 다음 '+choices[next]!.label} data-market={value} title="통합 → NXT → KRX 순서로 전환" disabled={disabled} onClick={()=>onChange(choices[next]!.value)} onKeyDown={event=>{
    const target=event.key==='ArrowRight'?next:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;
    if(disabled||target<0)return;event.preventDefault();onChange(choices[target]!.value);
  }} sx={{minWidth:0,height:28,p:'0 2px',gap:'7px',fontSize:13,fontWeight:700,color:colors.textPrimary,bgcolor:'transparent','&:hover':{bgcolor:colors.raised}}}>
    {choices[index]!.label}<Box aria-hidden="true" sx={{display:'flex',flexDirection:'column',gap:'2px'}}>{choices.map((c,i)=><Box key={c.value} sx={{width:4,height:4,borderRadius:'50%',bgcolor:i===index?colors.marketRise:colors.disabled}}/>)}</Box>
  </Button>;
}
