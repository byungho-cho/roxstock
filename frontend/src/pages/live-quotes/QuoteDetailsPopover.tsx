import {Box,ClickAwayListener,IconButton,Paper,Popper,Typography} from '@mui/material';
import {useEffect,useLayoutEffect,useState} from 'react';
import type {DisplayStock,QuoteMarket} from '../../../../shared/src/domain/live-quotes';
import {staticViPrices} from '../../../../shared/src/domain/static-vi';
import {colors} from '../../styles/tokens';
import type {QuoteRow} from './useQuoteStream';
import {hasCurrentTrade} from './quotePresentation';

const marketNames={TOTAL:'통합',KRX:'KRX',NXT:'NXT'};
const won=(n:number|undefined)=>n===undefined||!Number.isSafeInteger(n)||n<=0?'—':n.toLocaleString('ko-KR')+'원';

export function QuoteDetailsPopover({stock,market,row,anchor,onClose}:{stock:DisplayStock;market:QuoteMarket;row:QuoteRow;anchor:HTMLElement;onClose:()=>void}) {
    const [bottomInset,setBottomInset]=useState(52);
    useLayoutEffect(()=>{const update=()=>{const nav=document.querySelector('.MuiBottomNavigation-root');setBottomInset(nav?Math.max(8,window.innerHeight-nav.getBoundingClientRect().top+4):52);};update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);},[]);
    useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[onClose]);
    const q=row.quote,received=hasCurrentTrade(q,stock.symbol,market,row.referenceMarket),vi=staticViPrices(q,stock.viEligible===true),previous=q?q.price-q.change:undefined;
    const priceColor=(value:number|undefined)=>!received||value===undefined||previous===undefined||previous<=0?colors.textMuted:value>previous?colors.marketRise:value<previous?colors.marketFall:colors.marketFlat;
    const viColor=(up:boolean)=>received&&vi?(up?colors.marketRise:colors.marketFall):colors.textMuted;
    const venue=vi?.market??(q?.sourceMarket??(q?.market!=='TOTAL'?q?.market:undefined));
    const rows:[string,number|undefined,string][]=[['상승 VI',vi?.upper,viColor(true)],['하락 VI',vi?.lower,viColor(false)],['시가',q?.open,priceColor(q?.open)],['고가',q?.high,priceColor(q?.high)],['저가',q?.low,priceColor(q?.low)]];
    return <Popper open anchorEl={anchor} placement="bottom-end" modifiers={[{name:'offset',options:{offset:[0,8]}},{name:'flip',options:{fallbackPlacements:['top-end','bottom-start','top-start'],padding:{top:8,left:8,right:8,bottom:bottomInset}}},{name:'preventOverflow',options:{padding:{top:8,left:8,right:8,bottom:bottomInset},altAxis:true}}]} sx={{zIndex:1201}}>
        <ClickAwayListener onClickAway={event=>{
            // Let a different card's own click replace this popup in the same gesture.
            const target=event.target;if(target instanceof Element&&target.closest('[data-quote-id]')&&!target.closest('button,a,[data-price-alert-control]'))return;
            onClose();
        }}>
            <Paper role="dialog" aria-label={stock.name+' 시세 정보'} data-testid="quote-details-popover" onPointerDown={event=>event.stopPropagation()} sx={{width:240,maxWidth:'calc(100vw - 16px)',boxSizing:'border-box',p:'12px',display:'flex',flexDirection:'column',gap:'8px',bgcolor:colors.raised,border:'1px solid '+colors.borderStrong,borderRadius:'8px',boxShadow:'0 8px 20px #00000059',fontVariantNumeric:'tabular-nums'}}>
                <Box sx={{display:'flex',flexDirection:'column',gap:'4px'}}>
                    <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',height:20,gap:'8px'}}>
                        <Typography noWrap title={`${stock.name}(${stock.symbol})`} sx={{fontSize:12,fontWeight:600,lineHeight:'16px',minWidth:0}}>{stock.name}({stock.symbol})</Typography>
                        <IconButton aria-label="시세 정보 닫기" onClick={onClose} sx={{width:20,height:20,p:0,flexShrink:0,color:colors.textSecondary}}><Box component="span" aria-hidden sx={{fontSize:16,fontWeight:600,lineHeight:'20px'}}>×</Box></IconButton>
                    </Box>
                    <Typography sx={{fontSize:12,lineHeight:'18px',color:colors.textMuted}}>{marketNames[market]}{venue?' · VI 기준 '+venue:''}</Typography>
                </Box>
                {[[0,2],[2,5]].map(([start,end],index)=><Box key={start} sx={{display:'flex',flexDirection:'column',gap:'4px',...(index?{borderTop:'1px solid '+colors.borderStrong,pt:'8px'}:{})}}>
                    {rows.slice(start,end).map(([name,value,color])=><Box key={name} data-testid={'quote-detail-'+name} sx={{height:24,display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}><Typography sx={{fontSize:14,lineHeight:'21px',color:colors.textSecondary,whiteSpace:'nowrap'}}>{name}</Typography><Typography data-testid="quote-detail-value" sx={{fontSize:18,fontWeight:600,lineHeight:'24px',color,whiteSpace:'nowrap'}}>{won(value)}</Typography></Box>)}
                </Box>)}
            </Paper>
        </ClickAwayListener>
    </Popper>;
}
