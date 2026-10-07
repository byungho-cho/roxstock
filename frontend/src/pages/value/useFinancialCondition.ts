import {useLocation,useNavigate} from 'react-router-dom';
/** URL is authoritative across stock paths, refresh and browser history. */
export function useFinancialCondition<T extends string|number>(key:string,fallback:T,currentYear:number):[T,(value:T)=>void] {
 const location=useLocation(),navigate=useNavigate(),params=new URLSearchParams(location.search),raw=params.get(key);
 let value:string|number=raw??fallback;
 if(typeof fallback==='number'){const n=Number(value);value=Number.isInteger(n)?key==='quarter'?Math.max(1,Math.min(4,n)):key==='count'?Math.max(1,Math.min(10,n)):Math.max(2015,Math.min(currentYear,n)):fallback;}
 else if(key==='mode')value=value==='quarter'?'quarter':'annual';
 else if(key==='quarterStart'){const [y,q]=String(value).split(':').map(Number);value=Number.isInteger(y)&&Number.isInteger(q)?`${Math.max(2015,Math.min(currentYear,y))}:${Math.max(1,Math.min(4,q))}`:fallback;}
 return [value as T,(next:T)=>{const search=new URLSearchParams(location.search);search.set(key,String(next));navigate(location.pathname+'?'+search,{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});}];
}
