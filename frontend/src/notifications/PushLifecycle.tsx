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
import {registerPush,syncNativePreferences,type NotificationPreferences} from './NotificationSettings';
export function PushLifecycle(){const {user}=useAuth(),location=useLocation(),navigate=useNavigate(),client=useQueryClient();
 useEffect(()=>{if(!user||!nativePushAvailable())return;let active=true,warned=false;const register=()=>{if(document.visibilityState!=='visible')return;void apiRequest<NotificationPreferences>('/notifications/settings').then(async p=>{if(active){await syncNativePreferences(user.id,p);if(p.targetEnabled||p.newsEnabled)await registerPush();}}).catch(error=>{if(active&&!warned&&String(error?.message).includes('업데이트')){warned=true;showErrorToast(error.message);}});};register();document.addEventListener('visibilitychange',register);return()=>{active=false;document.removeEventListener('visibilitychange',register);};},[user?.id]);
 useEffect(()=>{if(!user)return;const eventId=new URLSearchParams(location.search).get('pushEvent')??pendingPush();if(!eventId)return;let active=true;void apiRequest<{destination:string;accountId:string|null;newsId?:string|null}>('/notifications/events/'+encodeURIComponent(eventId)).then(async r=>{if(!active||!['/','/detail/stock-news'].includes(r.destination))return;if(r.accountId){await authRequest('settings',{selectedAccountId:r.accountId});if(!active)return;localStorage.setItem(selectedAccountStorageKey,r.accountId);window.dispatchEvent(new Event('roxstock-selected-account'));}await client.invalidateQueries({predicate:q=>['homePage','targetArrivals','stockNews'].includes(String(q.queryKey[0]))});if(active){clearPendingPush();navigate((r.destination==='/detail/stock-news'&&r.newsId&&/^[1-9][0-9]*$/.test(r.newsId)?r.destination+'/'+r.newsId:r.destination)+'?readNotification='+encodeURIComponent(eventId),{replace:true});}}).catch(()=>{if(active){clearPendingPush();showErrorToast('알림의 대상 화면을 확인할 수 없습니다.');navigate('/',{replace:true});}});return()=>{active=false;};},[user?.id,location.search]);return null;}
