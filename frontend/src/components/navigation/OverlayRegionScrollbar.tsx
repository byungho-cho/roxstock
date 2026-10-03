import {Box} from '@mui/material';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {colors} from '../../styles/tokens';

type Metrics={top:number;left:number;height:number;page:number;position:number};
export function OverlayRegionScrollbar({scrollRef,label,offset=4}:{scrollRef:RefObject<HTMLElement|null>;label:string;offset?:number}) {
 const [metrics,setMetrics]=useState<Metrics>({top:0,left:0,height:0,page:0,position:0});
 const [visible,setVisible]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),drag=useRef(0);
 const reveal=useCallback(()=>{clearTimeout(timer.current);setVisible(true);timer.current=setTimeout(()=>setVisible(false),1000);},[]);
 useEffect(()=>{
  const region=scrollRef.current;if(!region)return;
  const measure=()=>{const rect=region.getBoundingClientRect(),next={top:rect.top,left:rect.right+offset,height:region.clientHeight,page:region.scrollHeight,position:region.scrollTop};
   setMetrics(previous=>Object.keys(next).every(key=>next[key as keyof Metrics]===previous[key as keyof Metrics])?previous:next);
  };
  const onScroll=()=>{measure();reveal();};
  const resize=new ResizeObserver(measure);resize.observe(region);if(region.firstElementChild)resize.observe(region.firstElementChild);
  const mutation=new MutationObserver(measure);mutation.observe(region,{childList:true,subtree:true,characterData:true});
  region.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',measure);
  measure();
  return()=>{clearTimeout(timer.current);resize.disconnect();mutation.disconnect();region.removeEventListener('scroll',onScroll);window.removeEventListener('resize',measure);};
 },[scrollRef,offset,reveal]);
 const maximum=Math.max(0,metrics.page-metrics.height),scrollable=maximum>1&&metrics.height>28;
 useEffect(()=>{if(scrollable)reveal();else setVisible(false);return()=>clearTimeout(timer.current);},[scrollable,reveal]);
 if(!scrollable)return null;
 const height=Math.min(metrics.height,Math.max(28,metrics.height*metrics.height/metrics.page)),travel=metrics.height-height,top=travel*Math.min(1,metrics.position/maximum);
 const move=(y:number)=>{if(travel>0)scrollRef.current?.scrollTo({top:Math.max(0,Math.min(travel,y-metrics.top-drag.current))/travel*maximum});};
 return <Box role="scrollbar" aria-label={label} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(maximum)} aria-valuenow={Math.round(metrics.position)} tabIndex={0}
  onFocus={reveal} onPointerDown={event=>{reveal();drag.current=event.clientY>=metrics.top+top&&event.clientY<=metrics.top+top+height?event.clientY-metrics.top-top:height/2;event.currentTarget.setPointerCapture(event.pointerId);move(event.clientY);}}
  onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId)){reveal();move(event.clientY);}}}
  onKeyDown={event=>{const step=event.key==='ArrowDown'?40:event.key==='ArrowUp'?-40:event.key==='PageDown'?metrics.height:event.key==='PageUp'?-metrics.height:event.key==='Home'?-metrics.page:event.key==='End'?metrics.page:0;if(step){event.preventDefault();reveal();scrollRef.current?.scrollBy({top:step});}}}
  sx={{position:'fixed',top:metrics.top,left:metrics.left,height:metrics.height,width:4,zIndex:10,opacity:visible?1:0,transition:visible?'none':'opacity 200ms ease',pointerEvents:visible?'auto':'none',touchAction:'none',cursor:'pointer','@media (prefers-reduced-motion: reduce)':{transition:'none'}}}>
  <Box sx={{position:'absolute',top,width:4,height,borderRadius:'2px',bgcolor:colors.textMuted,opacity:.65}}/>
 </Box>;
}
