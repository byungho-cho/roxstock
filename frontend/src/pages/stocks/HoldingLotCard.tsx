import {Box,ButtonBase,Card,ClickAwayListener,IconButton,Paper,Popper,Stack,Typography} from '@mui/material';
import {useEffect,useId,useState} from 'react';
import type {BuyLot} from '../../types/models';
import {colors} from '../../styles/tokens';
import {formatRate,getMarketColor} from '../../utils/format';
import {lotValue,won} from './stockMath';

export function HoldingLotCard({lot,price,onSell,onEdit,onDelete}:{lot:BuyLot;price:number;onSell:()=>void;onEdit:()=>void;onDelete:()=>void}) {
  const value=lotValue(lot,price),color=getMarketColor(value.profit),showTargets=Number.isFinite(value.profit)&&value.profit>0;
  const [tip,setTip]=useState<{rate:number;anchor:HTMLElement}|null>(null),tipId=useId();
  useEffect(()=>{if(!showTargets)setTip(null);},[showTargets]);
  useEffect(()=>{if(!tip)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setTip(null);tip.anchor.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[tip]);
  const heldDays=Math.max(0,Math.floor((Date.now()-new Date(lot.tradeDate+'T00:00:00+09:00').getTime())/86400000));
  return <Card data-testid={`lot-${lot.id}`} data-scroll-item={lot.id} data-holding-lot sx={{p:'6px 12px',borderRadius:'8px',border:`1px solid ${colors.border}`,bgcolor:colors.surface,flexShrink:0}}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:'4px',minHeight:32}}>
      <Typography data-testid="lot-date" sx={{fontSize:14,fontWeight:700,color:'#fff',lineHeight:'20px',minWidth:0}}>{lot.tradeDate.replaceAll('-','.')} <Box component="span" sx={{fontSize:12,fontWeight:400,color:colors.textMuted,whiteSpace:'nowrap'}}>(보유 {heldDays}일)</Box></Typography>
      <Stack direction="row" data-testid="lot-actions" sx={{flexShrink:0}}>{[['수정','edit',onEdit],['삭제','delete',onDelete]].map(([label,icon,action])=><IconButton key={String(icon)} aria-label={`${lot.id} 매수 ${label}`} onClick={event=>{event.stopPropagation();(action as ()=>void)();}} sx={{width:32,height:32,p:'6px'}}><Box component="img" src={`/stocks-v03/${icon}.svg`} alt="" sx={{width:20,height:20}}/></IconButton>)}</Stack>
    </Stack>
    <ButtonBase data-scroll-item={`lot-body-${lot.id}`} aria-label={`${lot.tradeDate} Lot 매도`} onClick={onSell} sx={{display:'block',textAlign:'left',width:'100%',borderRadius:'4px'}}>
      <Row label="매수" formula={`${lot.remainingQuantity.toLocaleString('ko-KR')} × ${won(lot.buyPrice)}`} amount={won(lot.remainingQuantity*lot.buyPrice)}/>
      <Row label="평가" formula={`${lot.remainingQuantity.toLocaleString('ko-KR')} × ${won(price)}`} amount={won(value.amount)} color={color}/>
      <Row label="수익" formula={Number.isFinite(value.rate)?formatRate(value.rate):'—'} amount={won(value.profit)} color={color}/>
    </ButtonBase>
    {showTargets&&<ClickAwayListener onClickAway={()=>setTip(null)}><Box data-no-detail-swipe data-testid="lot-targets" sx={{display:'flex',flexWrap:'wrap',gap:'4px',mt:'4px'}}>
      {[5,10,15].map(rate=><ButtonBase key={rate} data-testid="lot-target" aria-label={`${rate}% 목표 총액`} aria-expanded={tip?.rate===rate} aria-describedby={tip?.rate===rate?tipId:undefined} onClick={event=>{event.stopPropagation();setTip(tip?.rate===rate?null:{rate,anchor:event.currentTarget});}} sx={{flex:'1 0 auto',minWidth:0,minHeight:28,p:'2px 4px',border:`1px solid ${colors.marketRise}55`,borderRadius:'6px',fontSize:10,whiteSpace:'nowrap',gap:'3px'}}><Box component="span" sx={{color:colors.marketRise}}>{rate}%</Box> · {won(lot.buyPrice*(1+rate/100))}</ButtonBase>)}
      <Popper open={!!tip} anchorEl={tip?.anchor} placement="bottom" modifiers={[{name:'preventOverflow',options:{padding:8}},{name:'flip',options:{padding:8}}]} sx={{zIndex:1500}}><Paper id={tipId} role="tooltip" onClick={event=>event.stopPropagation()} sx={{p:'6px 8px',maxWidth:'calc(100vw - 16px)',overflowWrap:'anywhere',fontSize:12,bgcolor:colors.raised,border:`1px solid ${colors.borderStrong}`}}>목표 총액 {tip&&won(lot.remainingQuantity*lot.buyPrice*(1+tip.rate/100))}</Paper></Popper>
    </Box></ClickAwayListener>}
  </Card>;
}
function Row({label,formula,amount,color=colors.textPrimary}:{label:string;formula:string;amount:string;color?:string}) {
  return <Box sx={{display:'grid',gridTemplateColumns:'28px minmax(0,1fr) minmax(0,1fr)',alignItems:'center',minHeight:20,gap:'4px',color,overflowWrap:'anywhere'}}><Typography sx={{fontSize:11,lineHeight:'18px'}}>{label}</Typography><Typography sx={{fontSize:12,lineHeight:'18px'}}>{formula}</Typography><Typography sx={{fontSize:12,lineHeight:'18px',textAlign:'right',fontWeight:600}}>{amount}</Typography></Box>;
}
