import {originalAmount} from '../../utils/financialCurrency';
import {ProductNotice} from './ProductNotice';
import {formatShareCount} from '../../utils/shareCount';
import {AnalysisBasisInfo} from './AnalysisBasisInfo';
import {largeMoney} from '../../utils/largeMoney';
import {useState} from 'react';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import {usePopupHistory} from '../../hooks/usePopupHistory';
import {Box,Typography,Dialog,DialogTitle,DialogContent,IconButton} from '@mui/material';
import {format,number,type ValueRow} from './valueApi';
const reasonLabels:Record<string,string>={NOT_PROVIDED:'해당 값이 제공되지 않았습니다.',NOT_COLLECTED:'자료가 수집되지 않았습니다.',RIM_BASIS_UNCONFIRMED:'RIM 계산 기준이 확인되지 않았습니다.',EPS_MISSING:'EPS가 누락되었습니다.',CURRENT_PRICE_MISSING:'기준 주가가 없습니다.',VALUATION_MISSING:'적정주가 계산 근거가 없습니다.',ESTIMATE_SOURCE_MISMATCH:'추정 값과 출처의 값이 일치하지 않습니다.',ESTIMATE_BASIS_UNCONFIRMED:'연간 추정 기준이 확인되지 않았습니다.'};
export function ValueStockCard({row,held=false,selected,disabled,onClick}:{row:ValueRow;held?:boolean;selected:boolean;disabled:boolean;onClick:()=>void}){
 const price=number(row.currentPrice),previous=number(row.previousClosePrice),delta=price===null||previous===null?null:price-previous;
 const color=(n:number|null)=>n===null||n===0?'#94A3B8':n>0?'#FA616E':'#5EA1F0';
 const values=[['EPS',row.currency&&row.currency!=='KRW'?originalAmount(row.eps,row.currency):format(row.eps,0,'원')],['EPS 수익률',format(row.epsYield,1,'%')],['순이익',row.netIncomeBasis?.unit&&row.netIncomeBasis.unit!=='KRW'?originalAmount(row.netIncome,row.netIncomeBasis.unit):largeMoney(row.netIncome)],['초과이익',largeMoney(row.excessEarnings)],['주주가치',largeMoney(row.shareholderValue)],['자본',row.capitalBasis?.unit&&row.capitalBasis.unit!=='KRW'?originalAmount(row.capital,row.capitalBasis.unit):largeMoney(row.capital)],['기준평가율',format(row.requiredReturn,1,'%')]];
 return <><Box component="div" role="button" tabIndex={disabled?-1:0} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(!disabled)onClick();}}} data-scroll-item={row.id} data-testid={'value-row-'+row.symbol} aria-disabled={disabled} onClick={()=>{if(!disabled)onClick();}} aria-pressed={selected} title={row.notices?.join('\n')}
  sx={{font:'inherit',color:'#F7FAFC',textAlign:'left',cursor:'pointer',border:held?'1px solid #FBBF24':'1px solid #334052',bgcolor:row.productPolicy?.label?'rgba(153,109,37,.16)':'#101827',px:'8px',py:'4px',borderRadius:'8px',width:'100%',minWidth:0,display:'grid',gap:'2px',opacity:1,'&:focus-visible':{outline:'2px solid #FFC21A'},'&:disabled':{cursor:'progress'}}}>
  {row.notices?.filter(n=>n.startsWith('투자 주의 · ROE')).map(n=><Typography key={n} data-testid="roe-caution-flag" title={n} sx={{fontSize:10,color:'#FBBF24'}}>투자 주의 · ROE 기준 변경</Typography>)}<Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto auto',alignItems:'center',gap:'4px',minHeight:20}}>
   <Typography component="div" sx={{fontSize:12,minWidth:0,display:'flex',alignItems:'center',whiteSpace:'nowrap'}}><Box component="span" title={row.name} sx={{color:held?'#60A5FA':undefined,minWidth:0,overflow:'hidden',textOverflow:'ellipsis'}}>{row.name}</Box>{row.productPolicy?.label&&<Box component="span" sx={{color:'#FBBF24',fontSize:10,ml:.5}}>{row.productPolicy.label}</Box>}<Box component="span" sx={{ml:'4px',fontSize:10,color:'#94A3BA',flexShrink:0}}>{row.symbol}</Box><AnalysisBasisInfo row={row}/></Typography>
   <Box component="span" data-testid="value-market" sx={{fontSize:10,color:row.marketType==='KOSPI'?'#FBBF24':row.marketType==='KOSDAQ'?'#34D399':'#94A3B8',textAlign:'center',whiteSpace:'nowrap'}}>{row.marketType??'—'}</Box>
   <Box component="span" data-testid="value-current-price" sx={{fontSize:11,color:color(delta),textAlign:'right',overflowWrap:'anywhere'}}>{format(row.currentPrice,0,'원')}</Box>
  </Box>
  <ProductNotice policy={row.productPolicy} showType={false}/>
  <Box data-testid="value-classification" sx={{display:'grid',gridTemplateColumns:'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)',gap:'4px',alignItems:'center',minHeight:20,fontWeight:700,bgcolor:row.dataColor??'#FFD96E',px:'8px',borderRadius:0}}>
   <Box component="span" sx={{fontSize:10,color:'#144038',overflowWrap:'anywhere'}}>발행주식수 {formatShareCount(row.issuedShares)}</Box>
   <Box component="span" sx={{fontSize:11,color:'#AD1F33',textAlign:'right'}}>W {format(row.w,2)}</Box>
   <Box component="span" sx={{fontSize:10,color:'#AD1F33',textAlign:'right'}}>ROE {format(row.roe,2,'%')}</Box>
  </Box>
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:0,minHeight:32}}>
   {values.map(([label,value])=><Box key={label} sx={{display:'flex',flexDirection:'column',fontSize:10,minWidth:0}}><Box component="span" sx={{color:'#94A3BA',lineHeight:'16px'}}>{label}</Box><Box component="span" sx={{lineHeight:'16px',overflowWrap:'anywhere'}}>{value}</Box></Box>)}
  </Box>
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'4px',borderTop:'1px solid rgba(89,117,143,.65)',pt:'4px',minHeight:32}}>
   {['0.7','0.8','0.9','1.0'].map(persistence=>{const fair=row.fairPrices?.find(f=>f.persistence===persistence)?.price??null,value=number(fair);return <Box key={persistence} data-testid={'value-fair-'+persistence} sx={{display:'flex',flexDirection:'column',justifyContent:'center',textAlign:'center',minWidth:0,bgcolor:price===null||value===null||price===value?'#273244':value>price?'rgba(250,97,110,.7)':'rgba(96,165,250,.7)',borderRadius:'6px',py:'2px',px:'2px'}}><Box component="span" sx={{fontSize:10,color:'#FBBF24',lineHeight:'16px'}}>W {persistence}</Box><Box component="span" sx={{fontSize:11,lineHeight:'16px',overflowWrap:'anywhere',color:'#F7FAFC'}}>{format(fair,0,'원')}</Box></Box>;})}
  </Box>
 </Box></>;
}
