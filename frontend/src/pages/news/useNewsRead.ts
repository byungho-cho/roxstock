import {useCallback,useEffect,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {apiEnvelope} from '../../data/apiClient';
import {identityHeaders} from '../../auth/client';
import type {NewsFilter} from '../../data/stockNewsApi';

export type ReadScope={type?:NewsFilter;snapshot?:string;held?:string};
export function useNewsRead(accountId:string|undefined){
 const client=useQueryClient(),pending=useRef(new Set<string>()),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const last=useRef<{accountId:string;newsId:string|null;scope:ReadScope}|null>(null);
 const currentAccount=useRef(accountId);currentAccount.current=accountId;
 useEffect(()=>{setFailed(false);last.current=null;},[accountId]);
 const save=useCallback(async(newsId:string|null,scope:ReadScope={})=>{
  const requestKey=accountId+':'+(newsId??'all');
  if(!accountId||pending.current.has(requestKey)||!newsId&&pending.current.size)return false;
  pending.current.add(requestKey);setBusy(true);setFailed(false);
  const owner=identityHeaders()['X-Auth-User'];
  const sameOwner=()=>identityHeaders()['X-Auth-User']===owner&&currentAccount.current===accountId;
  const predicate=(q:{queryKey:readonly unknown[]})=>['stockNews','stockNewsDetail'].includes(String(q.queryKey[0]));
  try{
   await apiEnvelope(`/accounts/${accountId}/stock-news/${newsId?`${newsId}/read`:'read-all'}`,{method:'PUT',keepalive:true,body:JSON.stringify(scope)});
   if(sameOwner()){
    // Only a confirmed single-item write is safe to patch across account/list caches.
    if(newsId)client.setQueriesData({predicate},(old:any)=>{
     const row=(r:any)=>r?.id===newsId?{...r,isRead:true}:r;
     if(old?.pages)return {...old,pages:old.pages.map((p:any)=>({...p,data:p.data.map(row)}))};
     return old?.data?{...old,data:row(old.data)}:old;
    });
    await client.invalidateQueries({predicate});
   }
   return true;
  }catch{if(sameOwner()){last.current={accountId,newsId,scope};setFailed(true);}return false;}
  finally{pending.current.delete(requestKey);setBusy(pending.current.size>0);}
 },[accountId,client]);
 const retry=()=>{const request=last.current;return request&&request.accountId===accountId?save(request.newsId,request.scope):Promise.resolve(false);};
 return {save,retry,busy,failed};
}
