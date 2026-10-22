import {pendingPush,clearPendingPush} from './pending';
import {useQueryClient} from '@tanstack/react-query';
import {authRequest} from '../auth/client';
import {selectedAccountStorageKey} from '../data/roxstockApi';
import {showErrorToast} from '../components/common/QueryErrorNotice';
import {useEffect} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthGate';
import {apiRequest} from '../data/apiClient';
import {nativePush,nativePushAvailable} from './native';
import {registerPush,type NotificationPreferences} from './NotificationSettings';
export function PushLifecycle(){const {user}=useAuth(),location=useLocation(),navigate=useNavigate(),client=useQueryClient();
 useEffect(()=>{if(!user||!nativePushAvailable())return;let active=true;const register=()=>{if(document.visibilityState!=='visible')return;void apiRequest<NotificationPreferences>('/notifications/settings').then(async p=>{if(active){await nativePush('preferences',{userId:user.id,tradeEnabled:String(p.tradeEnabled),targetEnabled:String(p.targetEnabled),newsEnabled:String(p.newsEnabled)});if(p.targetEnabled||p.newsEnabled)await registerPush();}}).catch(()=>{});};register();document.addEventListener('visibilitychange',register);return()=>{active=false;document.removeEventListener('visibilitychange',register);};},[user?.id]);
 useEffect(()=>{if(!user)return;const eventId=new URLSearchParams(location.search).get('pushEvent')??pendingPush();if(!eventId)return;let active=true;void apiRequest<{destination:string;accountId:string|null}>('/notifications/events/'+encodeURIComponent(eventId)).then(async r=>{if(!active||!['/','/detail/stock-news'].includes(r.destination))return;if(r.accountId){await authRequest('settings',{selectedAccountId:r.accountId});if(!active)return;localStorage.setItem(selectedAccountStorageKey,r.accountId);window.dispatchEvent(new Event('roxstock-selected-account'));}await client.invalidateQueries({predicate:q=>['homePage','targetArrivals','stockNews'].includes(String(q.queryKey[0]))});if(active){clearPendingPush();navigate(r.destination+'?readNotification='+encodeURIComponent(eventId),{replace:true});}}).catch(()=>{if(active){clearPendingPush();showErrorToast('알림의 대상 화면을 확인할 수 없습니다.');navigate('/',{replace:true});}});return()=>{active=false;};},[user?.id,location.search]);return null;}
