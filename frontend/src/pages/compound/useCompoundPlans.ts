import {storedQueryOptions} from '../../data/storedQueryOptions';
import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {listPlans} from './compoundApi';
import {seoulYear} from '../value/valueApi';

// Year is part of the account cache key. Resume/focus also checks a suspended tab's clock.
export function useSeoulYear(){
 const [year,setYear]=useState(seoulYear);
 useEffect(()=>{const check=()=>setYear(seoulYear());const timer=window.setInterval(check,1000);
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  return()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};},[]);
 return year;
}
export function useCompoundPlans(accountId:string|null|undefined,{splitLoading=false}:{splitLoading?:boolean}={}){
 const year=useSeoulYear();
 const basic=useQuery({...storedQueryOptions,queryKey:['compound-plans',accountId,year,splitLoading?'basic':'full'],queryFn:({signal})=>listPlans(accountId!,signal,splitLoading),enabled:!!accountId,retry:false});
 const assets=useQuery({...storedQueryOptions,queryKey:['compound-assets',accountId,year,JSON.stringify(basic.data?.plans??[])],queryFn:({signal})=>listPlans(accountId!,signal),enabled:splitLoading&&!!accountId&&!!basic.data,retry:false,staleTime:30_000,refetchInterval:60_000,refetchIntervalInBackground:false});
 return {...basic,data:splitLoading?(assets.data??basic.data):basic.data,assetsPending:splitLoading&&assets.isPending,assetsError:splitLoading?assets.error:null,refetch:async()=>{const result=await basic.refetch();return splitLoading?assets.refetch():result;}};
}
