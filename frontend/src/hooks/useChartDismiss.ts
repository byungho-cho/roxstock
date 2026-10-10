import {useEffect, useRef, type RefObject} from 'react';

/** Capture only observes outside presses: the same press still activates its button/link. */
export function useChartDismiss({boundary,clear,resetKey,isInside}:{
 boundary:RefObject<HTMLElement|null>; clear:()=>void; resetKey:string;
 isInside?:(event:PointerEvent|MouseEvent)=>boolean;
}) {
 const callbacks=useRef({clear,isInside});callbacks.current={clear,isInside};
 useEffect(()=>{callbacks.current.clear();},[resetKey]);
 useEffect(()=>{
  const dismiss=(event:PointerEvent|MouseEvent)=>{
   const element=boundary.current;
   const inside=element?.contains(event.target as Node)&&
    (Boolean((event.target as Element).closest?.('[data-chart-tooltip]'))||!callbacks.current.isInside||callbacks.current.isInside(event));
   if(!inside)callbacks.current.clear();
  };
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')callbacks.current.clear();};
  document.addEventListener('pointerdown',dismiss,true);
  document.addEventListener('click',dismiss,true);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('click',dismiss,true);document.removeEventListener('keydown',escape);};
 },[boundary]);
}
