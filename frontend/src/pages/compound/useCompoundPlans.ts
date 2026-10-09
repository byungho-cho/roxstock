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
export function useCompoundPlans(accountId:string|null|undefined){
 const year=useSeoulYear();
 return useQuery({queryKey:['compound-plans',accountId,year],queryFn:({signal})=>listPlans(accountId!,signal),enabled:!!accountId,
  placeholderData:(previous,previousQuery)=>previousQuery?.queryKey[1]===accountId?previous:undefined,
  retry:false,staleTime:30_000,refetchOnWindowFocus:'always',refetchInterval:60_000});
}
