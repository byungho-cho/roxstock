import {useEffect} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthGate';
import {apiRequest} from '../data/apiClient';
import {nativePush,nativePushAvailable} from './native';
import {registerPush,type NotificationPreferences} from './NotificationSettings';
export function PushLifecycle(){const {user}=useAuth(),location=useLocation(),navigate=useNavigate();
 useEffect(()=>{if(!user||!nativePushAvailable())return;let active=true;const register=()=>{if(document.visibilityState!=='visible')return;void apiRequest<NotificationPreferences>('/notifications/settings').then(async p=>{if(active){await nativePush('preferences',{targetEnabled:String(p.targetEnabled),newsEnabled:String(p.newsEnabled)});if(p.targetEnabled||p.newsEnabled)await registerPush();}}).catch(()=>{});};register();document.addEventListener('visibilitychange',register);return()=>{active=false;document.removeEventListener('visibilitychange',register);};},[user?.id]);
 useEffect(()=>{if(!user)return;const eventId=new URLSearchParams(location.search).get('pushEvent');if(!eventId)return;let active=true;void apiRequest<{destination:string}>('/notifications/events/'+encodeURIComponent(eventId)).then(r=>{if(active&&['/','/detail/stock-news'].includes(r.destination))navigate(r.destination,{replace:true});}).catch(()=>{if(active)navigate('/',{replace:true});});return()=>{active=false;};},[user?.id,location.search]);return null;}
