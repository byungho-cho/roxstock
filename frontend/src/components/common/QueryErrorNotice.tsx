import {useEffect,useRef,useSyncExternalStore} from 'react';
import {Alert,Button,Snackbar} from '@mui/material';
import {useLocation} from 'react-router-dom';

type Entry={id:number;scope:string;message:string;retry?:()=>void};
let sequence=0,entries:Entry[]=[];
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
function enqueue(message:string,retry?:()=>void){
 const scope=window.location.pathname+window.location.search;
 if(entries.some(entry=>entry.scope===scope&&entry.message===message))return;
 entries=[...entries,{id:++sequence,scope,message,retry}];notify();
}
function dismiss(id:number){entries=entries.filter(entry=>entry.id!==id);notify();}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};

/** Mount once per failed state; keep a small local retry without an inline failure alert. */
export function QueryErrorNotice({message,onRetry,active=true,inlineRetry=true}:{message:string;onRetry?:()=>void;active?:boolean;inlineRetry?:boolean}){
 const latest=useRef(onRetry);latest.current=onRetry;
 const emitted=useRef<string|null>(null);
 useEffect(()=>{
  if(!active){emitted.current=null;return;}
  if(emitted.current!==message){emitted.current=message;enqueue(message,onRetry?()=>latest.current?.():undefined);}
 },[active,message]);
 return active&&inlineRetry&&onRetry?<Button size="small" onClick={()=>onRetry()} sx={{fontSize:11,minHeight:24}}>다시 시도</Button>:null;
}

/** One queue for page, card and dialog failures; never stack overlapping Snackbars. */
export function ErrorToastHost(){
 const location=useLocation(),scope=location.pathname+location.search,queue=useSyncExternalStore(subscribe,()=>entries),current=queue.find(entry=>entry.scope===scope);
 useEffect(()=>{const filtered=entries.filter(entry=>entry.scope===scope);if(filtered.length!==entries.length){entries=filtered;notify();}},[scope]);
 return <Snackbar key={current?.id??'empty'} open={!!current} autoHideDuration={6000} anchorOrigin={{vertical:'top',horizontal:'center'}} onClose={(_event,reason)=>{if(current&&reason!=='clickaway')dismiss(current.id);}} sx={{zIndex:2000,top:'52px !important',width:'calc(100% - 32px)',maxWidth:600}}>
  <Alert severity="error" variant="filled" onClose={()=>current&&dismiss(current.id)} action={current?.retry?<><Button color="inherit" size="small" onClick={()=>{const retry=current.retry;dismiss(current.id);retry?.();}}>재시도</Button><Button color="inherit" size="small" aria-label="오류 알림 닫기" onClick={()=>dismiss(current.id)}>닫기</Button></>:undefined} sx={{width:'100%',alignItems:'center',fontSize:12,overflowWrap:'anywhere'}}>{current?.message}</Alert>
 </Snackbar>;
}
