import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {apiRequest} from '../../data/apiClient';
import type {QuoteMarket} from '../../../../shared/src/domain/live-quotes';
export type PriceCondition={id:string;securityId:string;name:string;symbol:string;market:QuoteMarket;direction:'BELOW'|'ABOVE';amount:string;enabled:boolean;pausedUntil:string|null;version:number;status:string};
export type PriceReach=PriceCondition&{conditionId:string;price:string;change:string;rate:string;observedAt:string;createdAt:string};
export type AlertData={conditions:PriceCondition[];events:PriceReach[];unreadCount:number;monitor:{sourceConnection?:string;activeWindow?:boolean;healthy:boolean;capacity:number;monitoring:number;systemPush:boolean;background:string}};
export function usePriceAlertData(userId:string|undefined){
 const key=['live-price-alerts',userId],query=useQuery({queryKey:key,enabled:!!userId,queryFn:async({signal})=>{const data=await apiRequest<AlertData>('/live-quotes/alerts',{signal});if(!Array.isArray(data.conditions)||!Array.isArray(data.events)||!Number.isSafeInteger(data.unreadCount))throw Error('알림 응답을 확인하지 못했습니다.');return data;},refetchInterval:15000,refetchOnWindowFocus:true});
 return query;
}
export function usePriceAlerts(userId:string|undefined){
 const client=useQueryClient(),query=usePriceAlertData(userId);
 const [ackCount,setAckCount]=useState(0),acks=useRef(new Map<string,Promise<boolean>>());
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),owner=useRef(userId),alive=useRef(true);owner.current=userId;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{setError('');const refresh=()=>void client.invalidateQueries({queryKey:['live-price-alerts',userId]},{cancelRefetch:false});window.addEventListener('rox-live-price-alerts',refresh);return()=>window.removeEventListener('rox-live-price-alerts',refresh);},[client,userId]);
 const save=async(path:string,method:string,body:unknown)=>{
  if(lock.current)return false;lock.current=true;setBusy(true);setError('');const uid=userId;
  try{await apiRequest('/live-quotes/alerts'+path,{method,body:JSON.stringify(body)});if(alive.current&&owner.current===uid)await client.invalidateQueries({queryKey:['live-price-alerts',uid]});return alive.current&&owner.current===uid;}
  catch(e){if(alive.current&&owner.current===uid){setError(e instanceof Error?e.message:'알림을 저장하지 못했습니다.');void client.invalidateQueries({queryKey:['live-price-alerts',uid]});}return false;}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const acknowledge=(body:unknown,tag:string):Promise<boolean>=>{
  const uid=userId,key=uid+':'+tag,existing=acks.current.get(key);if(existing)return existing;
  const request=(async()=>{setAckCount(n=>n+1);setError('');try{await apiRequest('/live-quotes/alerts/acknowledge',{method:'POST',body:JSON.stringify(body)});if(alive.current&&owner.current===uid)await client.invalidateQueries({queryKey:['live-price-alerts',uid]});return alive.current&&owner.current===uid;}catch(e){if(alive.current&&owner.current===uid){setError(e instanceof Error?e.message:'알림 확인 상태를 다시 조회해 주세요.');void client.invalidateQueries({queryKey:['live-price-alerts',uid]});}return false;}finally{if(alive.current)setAckCount(n=>Math.max(0,n-1));}})();
  acks.current.set(key,request);void request.finally(()=>acks.current.delete(key));return request;
 };
 return {userId,query,busy:busy||ackCount>0,error,save,clearError:()=>setError(''),ackStock:(securityId:string)=>acknowledge({securityId},'stock:'+securityId),ack:(ids:string[])=>ids.length?acknowledge({eventIds:ids},'events:'+ids.slice().sort().join(',')):Promise.resolve(true)};
}
