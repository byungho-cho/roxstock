import {largeMoney} from '../../utils/largeMoney';
import {Box,Typography} from '@mui/material';
import {format,number,type ValueRow} from './valueApi';
export function ValueStockCard({row,selected,disabled,onClick}:{row:ValueRow;selected:boolean;disabled:boolean;onClick:()=>void}){
 const price=number(row.currentPrice),previous=number(row.previousClosePrice),delta=price===null||previous===null?null:price-previous;
 const color=(n:number|null)=>n===null||n===0?'#94A3B8':n>0?'#FA616E':'#5EA1F0';
 const values=[['EPS',format(row.eps,0,'원')],['초과이익',largeMoney(row.excessEarnings)],['주주가치',largeMoney(row.shareholderValue)],['자본',largeMoney(row.capital)],['기준평가율',format(row.requiredReturn,1,'%')]];
 return <Box component="button" data-scroll-item={row.id} data-testid={'value-row-'+row.symbol} disabled={disabled} onClick={onClick} aria-pressed={selected} title={row.notices?.join('\n')}
  sx={{font:'inherit',color:'#F7FAFC',textAlign:'left',cursor:'pointer',border:'1px solid '+(selected?'#FFC21A':'#334052'),bgcolor:'#101827',px:'8px',py:'4px',borderRadius:'8px',width:'100%',minWidth:0,display:'grid',gap:'2px',opacity:1,'&:focus-visible':{outline:'2px solid #FFC21A'},'&:disabled':{cursor:'progress'}}}>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',minHeight:20}}>
   <Typography sx={{fontSize:12,minWidth:0,overflowWrap:'anywhere'}}>{row.name}<Box component="span" sx={{ml:'4px',fontSize:10,color:'#94A3BA'}}>{row.symbol}</Box></Typography>
   <Box component="span" data-testid="value-current-price" sx={{fontSize:11,color:color(delta),textAlign:'right',overflowWrap:'anywhere'}}>{format(row.currentPrice,0,'원')}</Box>
  </Box>
  <Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)',gap:'4px',alignItems:'center',minHeight:20,fontWeight:700,bgcolor:'#FFD96E',px:'8px',borderRadius:0}}>
   <Box component="span" sx={{fontSize:10,color:'#144038',overflowWrap:'anywhere'}}>발행주식수 {format(row.issuedShares,0,'주')}</Box>
   <Box component="span" sx={{fontSize:11,color:'#AD1F33',textAlign:'right'}}>W {format(row.w,2)}</Box>
   <Box component="span" sx={{fontSize:10,color:'#AD1F33',textAlign:'right'}}>ROE {format(row.roe,1,'%')}</Box>
  </Box>
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:0,minHeight:32}}>
   {values.map(([label,value])=><Box key={label} sx={{display:'flex',flexDirection:'column',fontSize:10,minWidth:0}}><Box component="span" sx={{color:'#94A3BA',lineHeight:'16px'}}>{label}</Box><Box component="span" sx={{lineHeight:'16px',overflowWrap:'anywhere'}}>{value}</Box></Box>)}
  </Box>
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:0,borderTop:'1px solid rgba(89,117,143,.65)',pt:'2px',minHeight:32}}>
   {['0.7','0.8','0.9','1.0'].map(persistence=>{const fair=row.fairPrices?.find(f=>f.persistence===persistence)?.price??null,value=number(fair);return <Box key={persistence} sx={{display:'flex',flexDirection:'column',minWidth:0}}><Box component="span" sx={{fontSize:10,color:'#94A3BA',lineHeight:'16px'}}>지속계수 {persistence}</Box><Box component="span" sx={{fontSize:11,lineHeight:'16px',overflowWrap:'anywhere',color:color(price===null||value===null?null:value-price)}}>{format(fair,0,'원')}</Box></Box>;})}
  </Box>
 </Box>;
}
