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

/** Canonical URLs select the middle year. Legacy end/start URLs keep their visible window. */
export function useFinancialCenterYear(currentYear:number,legacyKey='startYear') {
 const location=useLocation(),navigate=useNavigate(),params=new URLSearchParams(location.search);
 const raw=params.get('centerYear'),end=params.get('endYear'),start=params.get(legacyKey);
 const requested=raw!==null?Number(raw):end!==null?Number(end)-1:start!==null?Number(start)+1:currentYear-1;
 const centerYear=Math.max(2016,Math.min(currentYear-1,Number.isInteger(requested)?requested:currentYear-1));
 const setCenterYear=(year:number)=>{const search=new URLSearchParams(location.search);search.set('centerYear',String(Math.max(2016,Math.min(currentYear-1,year))));search.delete('endYear');search.delete(legacyKey);navigate(location.pathname+'?'+search,{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 return [centerYear,setCenterYear] as const;
}
