import { Skeleton as MuiSkeleton, type SkeletonProps } from '@mui/material';
import {useEffect,useState} from 'react';

/** Delay only the indicator, never the response or the reserved layout. */
export function useDelayedIndicator(delay=200) {
  const [visible,setVisible]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setVisible(true),delay);return()=>clearTimeout(timer);},[delay]);
  return visible;
}
export function DelayedSkeleton({sx,...props}:SkeletonProps) {
  const visible=useDelayedIndicator();
  return <MuiSkeleton {...props} aria-hidden={!visible} data-loading-indicator={visible?'visible':'waiting'}
    sx={[...(Array.isArray(sx)?sx:[sx]),{visibility:visible?'visible':'hidden'}]} />;
}
