import {Box,CircularProgress} from '@mui/material';
/** Foreground requests only: hidden page prefetches must never cover the screen. */
export function ScreenLoading({active=true}:{active?:boolean}) {
 if(!active)return null;
 return <Box role="status" aria-label="자료 불러오는 중" data-testid="screen-loading" sx={{position:'fixed',inset:0,zIndex:1201,display:'grid',placeItems:'center',bgcolor:'rgba(8,13,23,.35)'}}><CircularProgress aria-hidden="true" size={32} thickness={3.5} sx={{color:'#60A5FA','@media (prefers-reduced-motion: reduce)':{animation:'none','& .MuiCircularProgress-circle':{animation:'none'}}}}/></Box>;
}
