import {useLayoutEffect,useRef,useState,type RefObject} from 'react';

type RegionRef=RefObject<HTMLDivElement|null>;
// Measure the actual scroll viewport: PageLayout already excludes the fixed header/menu.
export function useJournalDayPosition({tablet,enabled,accountId,leftRef,rightRef}:{tablet:boolean;enabled:boolean;accountId:string|null|undefined;leftRef:RegionRef;rightRef:RegionRef}){
 const monthlyRef=useRef<HTMLDivElement>(null),requested=useRef(false);
 const measureRef=useRef<()=>void>(()=>{});
 const [space,setSpace]=useState({day:0,calendarTail:80});
 useLayoutEffect(()=>{requested.current=false;},[accountId]);
 useLayoutEffect(()=>{
  const main=leftRef.current?.closest('main');
  if(!main)return;
  let alive=true,queued=false;
  const align=()=>{
   const monthly=monthlyRef.current;if(!enabled||!requested.current||!monthly)return;
   const host=tablet?leftRef.current:main;if(!host)return;
   const top=host.scrollTop+monthly.getBoundingClientRect().top-host.getBoundingClientRect().top;
   if(Math.abs(host.scrollTop-top)>.5)host.scrollTop=top;
   if(tablet&&rightRef.current)rightRef.current.scrollTop=0;
  };
  // Run after shared scroll restoration's mutation callback, before the next paint.
  const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(alive)align();});};
  const measure=()=>{
   const monthlyHeight=monthlyRef.current?.getBoundingClientRect().height??0;
   const day=Math.max(0,tablet?(rightRef.current?.clientHeight??main.clientHeight):main.clientHeight-monthlyHeight-8);
   const calendarTail=tablet&&requested.current?Math.max(80,(leftRef.current?.clientHeight??0)-monthlyHeight):80;
   setSpace(previous=>previous.day===day&&previous.calendarTail===calendarTail?previous:{day,calendarTail});schedule();
  };
  measureRef.current=measure;
  const cancel=()=>{requested.current=false;};
  // Delayed data may realign an explicitly navigated day; a user's new scroll takes precedence.
  for(const event of ['wheel','touchstart','pointerdown','keydown'])main.addEventListener(event,cancel,{capture:true,passive:true});
  const observer=new ResizeObserver(measure);observer.observe(main);
  for(const node of [monthlyRef.current,leftRef.current,rightRef.current])if(node)observer.observe(node);
  measure();
  return()=>{alive=false;observer.disconnect();for(const event of ['wheel','touchstart','pointerdown','keydown'])main.removeEventListener(event,cancel,true);measureRef.current=()=>{};};
 },[tablet,enabled,accountId,leftRef,rightRef]);
 useLayoutEffect(()=>{if(!enabled)requested.current=false;measureRef.current();});
 return {monthlyRef,dayMinHeight:space.day,calendarTail:space.calendarTail,request:()=>{if(enabled)requested.current=true;}};
}
