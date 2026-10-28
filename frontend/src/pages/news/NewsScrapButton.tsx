import {useRef,useState} from 'react';
import {IconButton} from '@mui/material';
import {useQueryClient} from '@tanstack/react-query';
import {apiEnvelope} from '../../data/apiClient';
import {identityHeaders} from '../../auth/client';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import type {StockNews} from '../../data/stockNewsApi';
export function NewsScrapButton({item,accountId}:{item:StockNews;accountId:string}){
 const client=useQueryClient(),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),lock=useRef(false);
 const toggle=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setFailed(false);
  const owner=identityHeaders()['X-Auth-User'],previous=!!item.isScrapped,next=!previous;
  const sameOwner=()=>identityHeaders()['X-Auth-User']===owner;
  const patch=(saved:boolean)=>{if(!sameOwner())return;client.setQueriesData({predicate:q=>['stockNews','stockNewsDetail'].includes(String(q.queryKey[0]))},(old:any)=>{
   const row=(r:any)=>r?.id===item.id?{...r,isScrapped:saved}:r;
   if(old?.pages)return {...old,pages:old.pages.map((p:any)=>({...p,data:p.data.map(row)}))};
   return old?.data?{...old,data:row(old.data)}:old;
  });};
  try{await client.cancelQueries({predicate:q=>['stockNews','stockNewsDetail'].includes(String(q.queryKey[0]))});patch(next);
  await apiEnvelope(`/accounts/${accountId}/stock-news/${item.id}/scrap`,{method:'PUT',body:JSON.stringify({saved:next})});if(sameOwner())await client.invalidateQueries({predicate:q=>['stockNews','stockNewsDetail'].includes(String(q.queryKey[0]))});}
  catch{patch(previous);if(sameOwner())setFailed(true);}finally{lock.current=false;setBusy(false);}
 };
 return <><IconButton aria-label={item.isScrapped?'스크랩 해제':'스크랩하기'} aria-pressed={!!item.isScrapped} disabled={busy} onClick={e=>{e.stopPropagation();void toggle();}} sx={{p:0,width:20,height:20,flexShrink:0}}><picture>{item.isScrapped&&<source media="(min-width:600px)" srcSet="/figma/news-scrap/selected-tablet.svg"/>}<img src={'/figma/news-scrap/'+(item.isScrapped?'selected-cover.svg':'unselected.svg')} alt="" width={20} height={20} style={{display:'block'}}/></picture></IconButton>{failed&&<QueryErrorNotice message="스크랩 저장에 실패했습니다. 이전 상태로 복원했습니다." onRetry={()=>void toggle()}/>}</>;
}
