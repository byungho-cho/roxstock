import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {Box} from '@mui/material';
import {useQueryClient} from '@tanstack/react-query';
import {useLocation,useNavigate} from 'react-router-dom';
import {authRequest,type AuthUser,type UserSettings} from './client';
import {AuthPage} from './AuthPage';
import {clearPageMemory} from '../hooks/navigation/pageMemory';
import {scopeAccountSelection} from '../data/roxstockApi';
const context=createContext<{user:AuthUser|null;reload:()=>Promise<void>;logout:()=>Promise<void>}>({user:null,reload:async()=>{},logout:async()=>{}});
export const useAuth=()=>useContext(context);
export function AuthGate({children}:{children:ReactNode}){
  const [user,setUser]=useState<AuthUser|null>(null),[pending,setPending]=useState(true),client=useQueryClient(),location=useLocation(),navigate=useNavigate();
  const clear=async()=>{await client.cancelQueries();client.clear();clearPageMemory();};
  const reload=async()=>{setPending(true);try{const next=await authRequest<AuthUser>('me');await clear();scopeAccountSelection(next.id);
    if(!next.mustChangePassword&&next.legacyOwner&&!next.settings?.legacyImported){
      const legacy:UserSettings={legacyImported:true};try{const favorites=JSON.parse(localStorage.getItem('roxstock:favorite-stocks-v1')??'null');if(Array.isArray(favorites))legacy.favorites=favorites;const theme=JSON.parse(localStorage.getItem('roxstock-170-demo-settings-v2')??'{}').theme;if(['dark','light','system'].includes(theme))legacy.theme=theme;}catch{/* Invalid legacy preferences are not imported. */}
      next.settings=await authRequest<UserSettings>('settings',legacy);
    }
    if(next.settings?.favorites)localStorage.setItem(`roxstock:user:${next.id}:favorite-stocks`,JSON.stringify(next.settings.favorites));
    if(next.settings?.selectedAccountId)localStorage.setItem(`roxstock:user:${next.id}:selected-account-id`,next.settings.selectedAccountId);
    setUser(next);}catch{await clear();setUser(null);}finally{setPending(false);}};
  const logout=async()=>{await authRequest('logout',{});await clear();setUser(null);navigate('/auth/login',{replace:true});};
  useEffect(()=>{void reload();const unauthorized=()=>{void reload();};window.addEventListener('roxstock-auth-required',unauthorized);return()=>window.removeEventListener('roxstock-auth-required',unauthorized);},[]);
  useEffect(()=>{if(typeof BroadcastChannel==='undefined')return;const channel=new BroadcastChannel('roxstock-auth');channel.onmessage=()=>void reload();return()=>channel.close();},[]);
  useEffect(()=>{if(!user)return;const timer=setInterval(()=>void authRequest('refresh',{}).catch(()=>reload()),5*60000);const resume=()=>{if(document.visibilityState==='visible')void reload();};document.addEventListener('visibilitychange',resume);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};},[user?.id]);
  if(pending)return <Box role="status" sx={{minHeight:'100dvh',bgcolor:'#080D18',display:'grid',placeItems:'center',fontSize:12,color:'#94A3B8'}}>로그인을 확인하고 있습니다.</Box>;
  const authPath=location.pathname.startsWith('/auth/');
  return <context.Provider value={{user,reload,logout}}>{!user||user.mustChangePassword||authPath?<AuthPage user={user} onLogin={reload}/>:children}</context.Provider>;
}
