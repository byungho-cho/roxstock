import {rememberPush,clearPendingPush} from '../notifications/pending';
import {nativePush,nativePushAvailable} from '../notifications/native';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Box} from '@mui/material';
import {useQueryClient} from '@tanstack/react-query';
import {useLocation,useNavigate} from 'react-router-dom';
import {authRequest,authBroadcastSource,setAuthIdentity,type AuthUser,type UserSettings} from './client';
import {AuthPage} from './AuthPage';
import {clearPageMemory} from '../hooks/navigation/pageMemory';
import {scopePersonalSettings} from '../data/mockMoreSettings';
import {scopeAccountSelection} from '../data/roxstockApi';
const context=createContext<{user:AuthUser|null;reload:()=>Promise<void>;logout:()=>Promise<void>}>({user:null,reload:async()=>{},logout:async()=>{}});
export const useAuth=()=>useContext(context);
export function AuthGate({children}:{children:ReactNode}){
  const [user,setUser]=useState<AuthUser|null>(null),[pending,setPending]=useState(true),client=useQueryClient(),location=useLocation(),navigate=useNavigate();
  useEffect(()=>rememberPush(location.search),[location.search]);
  const currentUser=useRef<AuthUser|null>(null),revision=useRef(0);
  const [checking,setChecking]=useState(false);
  const clear=async()=>{await client.cancelQueries();client.clear();clearPageMemory();};
  const reload=async(background=false)=>{const request=++revision.current;if(background)setChecking(true);else setPending(true);try{const next=await authRequest<AuthUser>('me');if(request!==revision.current)return;const changed=currentUser.current?.id!==next.id||currentUser.current?.role!==next.role;if(currentUser.current&&currentUser.current.id!==next.id)clearPendingPush();if(changed&&nativePushAvailable())await nativePush('unbind');if(changed){setPending(true);await clear();}if(request!==revision.current)return;scopeAccountSelection(next.id);setAuthIdentity(next.id);
    if(!next.mustChangePassword&&next.legacyOwner&&!next.settings?.legacyImported){
      const legacy:UserSettings={legacyImported:true};try{const favorites=JSON.parse(localStorage.getItem('roxstock:favorite-stocks-v1')??'null');if(Array.isArray(favorites))legacy.favorites=favorites;const theme=JSON.parse(localStorage.getItem('roxstock-170-demo-settings-v2')??'{}').theme;if(['dark','light','system'].includes(theme))legacy.theme=theme;}catch{/* Invalid legacy preferences are not imported. */}
      next.settings=await authRequest<UserSettings>('settings',legacy);
    }
    if(request!==revision.current)return;scopePersonalSettings(next.id,next.settings?.theme);
    if(next.settings?.favorites)localStorage.setItem(`roxstock:user:${next.id}:favorite-stocks`,JSON.stringify(next.settings.favorites));
    if(next.settings?.selectedAccountId)localStorage.setItem(`roxstock:user:${next.id}:selected-account-id`,next.settings.selectedAccountId);
    if(request!==revision.current)return;currentUser.current=next;setUser(next);}catch{if(request!==revision.current)return;setPending(true);await clear();if(nativePushAvailable())await nativePush('unbind').catch(()=>{});currentUser.current=null;setAuthIdentity();setUser(null);}finally{if(request===revision.current){setPending(false);setChecking(false);}}};
  const logout=async()=>{if(nativePushAvailable())await nativePush('unbind');clearPendingPush();await authRequest('logout',{});revision.current++;await clear();currentUser.current=null;setAuthIdentity();setUser(null);setPending(false);setChecking(false);navigate('/auth/login',{replace:true});};
  useEffect(()=>{void reload();const unauthorized=()=>{void reload();};window.addEventListener('roxstock-auth-required',unauthorized);return()=>window.removeEventListener('roxstock-auth-required',unauthorized);},[]);
  useEffect(()=>{if(typeof BroadcastChannel==='undefined')return;const channel=new BroadcastChannel('roxstock-auth');channel.onmessage=event=>{if(event.data?.source!==authBroadcastSource)void reload();};return()=>channel.close();},[]);
  useEffect(()=>{if(!user)return;const timer=setInterval(()=>void authRequest('refresh',{}).catch(()=>reload(true)),5*60000);const resume=()=>{if(document.visibilityState==='visible')void reload(true);};document.addEventListener('visibilitychange',resume);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};},[user?.id]);
  if(pending)return <Box role="status" sx={{minHeight:'100dvh',bgcolor:'#080D18',display:'grid',placeItems:'center',fontSize:12,color:'#94A3B8'}}>로그인을 확인하고 있습니다.</Box>;
  const authPath=location.pathname.startsWith('/auth/');
  return <context.Provider value={{user,reload,logout}}>{!user||user.mustChangePassword||authPath?<AuthPage user={user} onLogin={reload}/>:children}{checking&&<Box role="status" aria-live="polite" sx={{position:'fixed',inset:0,zIndex:2147483647,bgcolor:'#080D18',display:'grid',placeItems:'center',fontSize:12,color:'#94A3B8'}}>로그인을 확인하고 있습니다.</Box>}</context.Provider>;
}
