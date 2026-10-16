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
  let targetStart=Number.isFinite(value.rate)?Math.max(5,Math.floor(value.rate/5)*5):5;
  if(price<=lot.buyPrice*(1+targetStart/100))targetStart=Math.max(5,targetStart-5);
  const heldDays=Math.max(0,Math.floor((Date.now()-new Date(lot.tradeDate+'T00:00:00+09:00').getTime())/86400000));
  return <Card data-testid={`lot-${lot.id}`} data-scroll-item={lot.id} data-holding-lot sx={{p:'4px 12px',borderRadius:'8px',border:`1px solid ${colors.border}`,bgcolor:colors.surface,flexShrink:0}}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:'4px',minHeight:32}}>
      <Typography data-testid="lot-date" sx={{fontSize:14,fontWeight:700,color:'#fff',lineHeight:'20px',minWidth:0}}>{lot.tradeDate.replaceAll('-','.')} <Box component="span" sx={{fontSize:12,fontWeight:400,color:colors.textMuted,whiteSpace:'nowrap'}}>(보유 {heldDays}일)</Box></Typography>
      <Stack direction="row" data-testid="lot-actions" sx={{flexShrink:0}}>{[['수정','edit',onEdit],['삭제','delete',onDelete]].map(([label,icon,action])=><IconButton key={String(icon)} aria-label={`${lot.id} 매수 ${label}`} onClick={event=>{event.stopPropagation();(action as ()=>void)();}} sx={{width:32,height:32,p:'6px'}}><Box component="img" src={`/stocks-v03/${icon}.svg`} alt="" sx={{width:20,height:20}}/></IconButton>)}</Stack>
    </Stack>
    <Box role="button" tabIndex={0} aria-label={`${lot.tradeDate} Lot 매도`} onClick={onSell} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSell();}}} sx={{cursor:'pointer',display:'block',textAlign:'left',width:'100%',borderRadius:'4px'}}>
      <Row label="매수" formula={`${lot.remainingQuantity.toLocaleString('ko-KR')} × ${won(lot.buyPrice)}`} amount={won(lot.remainingQuantity*lot.buyPrice)}/>
      <Row label="평가" formula={`${lot.remainingQuantity.toLocaleString('ko-KR')} × ${won(price)}`} amount={won(value.amount)} color={color}/>
      <Row label="수익" formula={Number.isFinite(value.rate)?formatRate(value.rate):'—'} amount={won(value.profit)} color={color}/>
    </Box>
    {showTargets&&<ClickAwayListener mouseEvent="onMouseDown" touchEvent="onTouchStart" onClickAway={()=>setTip(null)}><Box data-no-detail-swipe data-testid="lot-targets" sx={{display:'flex',flexWrap:'wrap',gap:'4px',mt:'3px'}}>
      {[targetStart,targetStart+5,targetStart+10].map(rate=>{const reached=price>lot.buyPrice*(1+rate/100);return <ButtonBase key={rate} data-testid="lot-target" aria-label={`${rate}% 목표 총액`} aria-expanded={tip?.rate===rate} aria-describedby={tip?.rate===rate?tipId:undefined} onClick={event=>{event.stopPropagation();setTip(tip?.rate===rate?null:{rate,anchor:event.currentTarget});}} sx={{flex:'1 0 auto',minWidth:0,minHeight:28,p:'2px 4px',border:reached?'1px solid #293241':`1px solid ${colors.marketRise}55`,borderRadius:'6px',fontSize:10,color:reached?'rgba(146, 155, 168, 0.7)':colors.marketRise,bgcolor:reached?'#19212E':'transparent','&:hover':{bgcolor:reached?'#1D2735':`${colors.marketRise}0A`},'&.Mui-focusVisible':{outline:`2px solid ${colors.focus}`,outlineOffset:'2px'},whiteSpace:'nowrap',justifyContent:'space-between',gap:'3px'}}><Box component="span">{rate}%</Box><Box component="span" sx={{textAlign:'right'}}>{won(lot.buyPrice*(1+rate/100))}</Box></ButtonBase>;})}
      <Popper id={tipId} open={!!tip} anchorEl={tip?.anchor} placement="bottom" modifiers={[{name:'preventOverflow',options:{padding:8}},{name:'flip',options:{padding:8}}]} sx={{zIndex:1500}}><Paper onClick={event=>event.stopPropagation()} sx={{p:'6px 8px',maxWidth:'calc(100vw - 16px)',overflowWrap:'anywhere',fontSize:12,bgcolor:colors.raised,border:`1px solid ${colors.borderStrong}`}}>목표 총액 {tip&&won(lot.remainingQuantity*lot.buyPrice*(1+tip.rate/100))}</Paper></Popper>
    </Box></ClickAwayListener>}
  </Card>;
}
function Row({label,formula,amount,color=colors.textPrimary}:{label:string;formula:string;amount:string;color?:string}) {
  return <Box sx={{display:'grid',gridTemplateColumns:'28px minmax(0,1fr) minmax(0,1fr)',alignItems:'center',minHeight:19,gap:'4px',color,overflowWrap:'anywhere'}}><Typography sx={{fontSize:11,lineHeight:'18px'}}>{label}</Typography><Typography sx={{fontSize:12,lineHeight:'18px'}}>{formula}</Typography><Typography sx={{fontSize:12,lineHeight:'18px',textAlign:'right',fontWeight:600}}>{amount}</Typography></Box>;
}
