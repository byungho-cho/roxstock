import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useEffect} from 'react';
import {apiRequest} from '../../data/apiClient';
import {useSelectedAccountId} from '../../hooks/useActiveAccount';
import {chooseAccount,listAccounts} from '../../data/roxstockApi';
import {storedQueryOptions} from '../../data/storedQueryOptions';
import {useLocation} from 'react-router-dom';
import {liveApiEnabled} from '../../data/liveData';
import {usePriceAlertData} from '../../pages/live-quotes/priceAlertsApi';

export function useMenuNotifications(userId:string|undefined){
 const client=useQueryClient(),selected=useSelectedAccountId(),{pathname}=useLocation();
 // Home/stocks bootstrap already supplies accounts: observe that cache without another page fetch.
 const accounts=useQuery({...storedQueryOptions,queryKey:['accounts','api'],queryFn:({signal})=>listAccounts(signal),enabled:liveApiEnabled&&!!userId&&pathname!=='/'&&pathname!=='/stocks'});
 const accountId=accounts.data?chooseAccount(accounts.data)?.id:selected??undefined;
 const alerts=usePriceAlertData(userId);
 const news=useQuery({queryKey:['stockNewsUnread',userId,accountId],enabled:liveApiEnabled&&!!userId&&!!accountId,
  queryFn:async({signal})=>{const data=await apiRequest<{accountId:string;hasUnread:boolean}>(`/accounts/${accountId}/stock-news/unread`,{signal});if(data.accountId!==accountId||typeof data.hasUnread!=='boolean')throw Error('소식 알림 상태를 확인하지 못했습니다.');return data;},
  staleTime:60_000,refetchInterval:60_000,refetchIntervalInBackground:false,refetchOnWindowFocus:true,retry:false});
 useEffect(()=>{const refresh=()=>void client.invalidateQueries({queryKey:['live-price-alerts',userId]},{cancelRefetch:false});window.addEventListener('rox-live-price-alerts',refresh);return()=>window.removeEventListener('rox-live-price-alerts',refresh);},[client,userId]);
 return {live:!!userId&&(alerts.data?.unreadCount??0)>0,news:!!userId&&!!accountId&&news.data?.hasUnread===true};
}
