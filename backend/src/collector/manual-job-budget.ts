import {AsyncLocalStorage} from 'node:async_hooks';

export class ManualJobTimeout extends Error {readonly code='MANUAL_JOB_TIMEOUT';}
const scope=new AsyncLocalStorage<AbortSignal>();
export function checkManualJob(){scope.getStore()?.throwIfAborted();}
/** Scope is absent for automatic collection: its schedule, retries and request budgets stay intact. */
export function manualScopedFetch(fetcher:typeof fetch):typeof fetch {
 return (input,init)=>{
  const signal=scope.getStore();
  if(!signal)return fetcher(input,init);
  signal.throwIfAborted();
  return fetcher(input,{...init,signal:AbortSignal.any([signal,AbortSignal.timeout(20_000),...(init?.signal?[init.signal]:[])])});
 };
}
export const manualFetch:typeof fetch=(input,init)=>manualScopedFetch(fetch)(input,init);
/** Cancels real I/O; a late source response cannot persist through a checked manual DB delegate. */
export async function boundedManualJob<T>(work:()=>Promise<T>,milliseconds:number,outer?:AbortSignal):Promise<T>{
 const controller=new AbortController(),timeout=new ManualJobTimeout('수집 작업 시간 제한을 초과했습니다.');
 const timer=setTimeout(()=>controller.abort(timeout),Math.max(1,milliseconds));
 const signal=outer?AbortSignal.any([controller.signal,outer]):controller.signal;
 let rejectAbort:()=>void=()=>{};
 const expired=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(signal.reason??timeout);signal.addEventListener('abort',rejectAbort,{once:true});if(signal.aborted)rejectAbort();});
 try{signal.throwIfAborted();return await scope.run(signal,()=>Promise.race([work(),expired]));}
 finally{clearTimeout(timer);signal.removeEventListener('abort',rejectAbort);controller.abort(timeout);}
}
/** Only manual workers use this proxy. Reads may complete late; every subsequent write is fenced. */
export function checkedManualDb<T extends object>(db:T):T{
 const writes=new Set(['create','createMany','update','updateMany','upsert','delete','deleteMany']);
 const delegates=new Map<PropertyKey,unknown>();
 return new Proxy(db,{get(target,key){
  const value=Reflect.get(target,key);
  if(key==='$transaction'&&typeof value==='function')return (work:unknown,...args:unknown[])=>{
   checkManualJob();
   return value.call(target,typeof work==='function'?(tx:object)=>work(checkedManualDb(tx)):work,...args);
  };
  if(typeof value==='function')return value.bind(target);
  if(!value||typeof value!=='object')return value;
  if(!delegates.has(key))delegates.set(key,new Proxy(value,{get(delegate,method){const call=Reflect.get(delegate,method);return typeof call==='function'?(...args:unknown[])=>{if(writes.has(String(method)))checkManualJob();return call.apply(delegate,args);}:call;}}));
  return delegates.get(key);
 }});
}
