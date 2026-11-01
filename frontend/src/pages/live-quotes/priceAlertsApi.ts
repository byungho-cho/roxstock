import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {apiRequest} from '../../data/apiClient';
import type {QuoteMarket} from '../../../../shared/src/domain/live-quotes';
export type PriceCondition={id:string;securityId:string;name:string;symbol:string;market:QuoteMarket;direction:'BELOW'|'ABOVE';amount:string;enabled:boolean;pausedUntil:string|null;version:number;status:string};
export type PriceReach=PriceCondition&{conditionId:string;price:string;change:string;rate:string;observedAt:string;createdAt:string};
export type AlertData={conditions:PriceCondition[];events:PriceReach[];unreadCount:number;monitor:{sourceConnection?:string;activeWindow?:boolean;healthy:boolean;capacity:number;monitoring:number;systemPush:boolean;background:string}};
export function usePriceAlerts(userId:string|undefined){
 const client=useQueryClient(),key=['live-price-alerts',userId],query=useQuery({queryKey:key,enabled:!!userId,queryFn:async({signal})=>{const data=await apiRequest<AlertData>('/live-quotes/alerts',{signal});if(!Array.isArray(data.conditions)||!Array.isArray(data.events)||!Number.isSafeInteger(data.unreadCount))throw Error('알림 응답을 확인하지 못했습니다.');return data;},refetchInterval:15000,refetchOnWindowFocus:true});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),owner=useRef(userId),alive=useRef(true);owner.current=userId;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{setError('');const refresh=()=>void client.invalidateQueries({queryKey:['live-price-alerts',userId]});window.addEventListener('rox-live-price-alerts',refresh);return()=>window.removeEventListener('rox-live-price-alerts',refresh);},[client,userId]);
 const save=async(path:string,method:string,body:unknown)=>{
  if(lock.current)return false;lock.current=true;setBusy(true);setError('');const uid=userId;
  try{await apiRequest('/live-quotes/alerts'+path,{method,body:JSON.stringify(body)});if(alive.current&&owner.current===uid)await client.invalidateQueries({queryKey:['live-price-alerts',uid]});return alive.current&&owner.current===uid;}
  catch(e){if(alive.current&&owner.current===uid){setError(e instanceof Error?e.message:'알림을 저장하지 못했습니다.');void client.invalidateQueries({queryKey:['live-price-alerts',uid]});}return false;}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 return {userId,query,busy,error,save,clearError:()=>setError(''),ack:(ids:string[])=>ids.length?save('/acknowledge','POST',{eventIds:ids}):Promise.resolve(true)};
}
