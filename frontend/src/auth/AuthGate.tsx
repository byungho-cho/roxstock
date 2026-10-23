import {rememberPush,clearPendingPush} from '../notifications/pending';
import {nativePush,nativePushAvailable} from '../notifications/native';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Box,Button} from '@mui/material';
import {useQueryClient} from '@tanstack/react-query';
import {useLocation,useNavigate} from 'react-router-dom';
import {authRequest,authBroadcastSource,setAuthIdentity,confirmedSessionFailure,type AuthUser,type UserSettings} from './client';
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
  const [checking,setChecking]=useState(false),[connectionError,setConnectionError]=useState(false),[blocked,setBlocked]=useState(false);
  const retryTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),attempts=useRef(0),alive=useRef(true),started=useRef(false);
  const stopRetry=()=>{clearTimeout(retryTimer.current);retryTimer.current=undefined;};
  const clear=async()=>{await client.cancelQueries();client.clear();clearPageMemory();};
  const reload=async(background=false,retry=false)=>{stopRetry();if(!retry)attempts.current=0;const request=++revision.current;if(background)setChecking(true);else setPending(true);try{const next=await authRequest<AuthUser>('me');if(!next||typeof next.id!=='string'||!next.id||typeof next.role!=='string'||typeof next.mustChangePassword!=='boolean')throw new Error('Invalid identity response');if(request!==revision.current||!alive.current)return;const changed=currentUser.current?.id!==next.id||currentUser.current?.role!==next.role;if(changed)setBlocked(true);if(currentUser.current&&currentUser.current.id!==next.id)clearPendingPush();if(changed&&nativePushAvailable())await nativePush('unbind',{preserveBrokerClick:'true'});if(changed){setPending(true);await clear();}if(request!==revision.current||!alive.current)return;scopeAccountSelection(next.id);setAuthIdentity(next.id);
    if(!next.mustChangePassword&&next.legacyOwner&&!next.settings?.legacyImported){
      const legacy:UserSettings={legacyImported:true};try{const favorites=JSON.parse(localStorage.getItem('roxstock:favorite-stocks-v1')??'null');if(Array.isArray(favorites))legacy.favorites=favorites;const theme=JSON.parse(localStorage.getItem('roxstock-170-demo-settings-v2')??'{}').theme;if(['dark','light','system'].includes(theme))legacy.theme=theme;}catch{/* Invalid legacy preferences are not imported. */}
      try{next.settings=await authRequest<UserSettings>('settings',legacy);}catch{/* Preferences can retry later; identity was verified. */}
    }
    if(request!==revision.current||!alive.current)return;scopePersonalSettings(next.id,next.settings?.theme);
    if(next.settings?.favorites)localStorage.setItem(`roxstock:user:${next.id}:favorite-stocks`,JSON.stringify(next.settings.favorites));
    if(next.settings?.selectedAccountId)localStorage.setItem(`roxstock:user:${next.id}:selected-account-id`,next.settings.selectedAccountId);
    if(request!==revision.current||!alive.current)return;currentUser.current=next;setUser(next);setConnectionError(false);setBlocked(false);attempts.current=0;
  }catch(error){
    if(request!==revision.current||!alive.current)return;
    if(confirmedSessionFailure(error)){
      setPending(true);await clear();if(request!==revision.current||!alive.current)return;
      if(nativePushAvailable())await nativePush('unbind',{preserveBrokerClick:'true'}).catch(()=>{});
      if(request!==revision.current||!alive.current)return;
      currentUser.current=null;setAuthIdentity();setUser(null);setConnectionError(false);setBlocked(false);stopRetry();
    }else{
      setConnectionError(true);
      if(attempts.current<3&&navigator.onLine){const delay=[2000,5000,15000][attempts.current++];retryTimer.current=setTimeout(()=>{if(alive.current)void reload(true,true);},delay);}
    }
  }finally{if(request===revision.current&&alive.current){setPending(false);setChecking(false);}}};
  const logout=async()=>{revision.current++;stopRetry();if(nativePushAvailable())await nativePush('unbind');await authRequest('logout',{});clearPendingPush();revision.current++;setConnectionError(false);setBlocked(false);await clear();currentUser.current=null;setAuthIdentity();setUser(null);setPending(false);setChecking(false);navigate('/auth/login',{replace:true});};
  useEffect(()=>{alive.current=true;if(!started.current){started.current=true;void reload();}const unauthorized=(event:Event)=>{if((event as CustomEvent).detail==='IDENTITY_CHANGED')setBlocked(true);void reload(true);};const online=()=>void reload(true);window.addEventListener('online',online);window.addEventListener('roxstock-auth-required',unauthorized);return()=>{alive.current=false;stopRetry();window.removeEventListener('online',online);window.removeEventListener('roxstock-auth-required',unauthorized);};},[]);
  useEffect(()=>{if(typeof BroadcastChannel==='undefined')return;const channel=new BroadcastChannel('roxstock-auth');channel.onmessage=event=>{if(event.data?.source!==authBroadcastSource){setBlocked(true);void reload(true);}};return()=>channel.close();},[]);
  useEffect(()=>{if(!user)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')void reload(true);},5*60000);const resume=()=>{if(document.visibilityState==='visible')void reload(true);};document.addEventListener('visibilitychange',resume);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};},[user?.id]);
  if(pending||blocked&&!connectionError)return <Box role="status" sx={{minHeight:'100dvh',bgcolor:'#080D18',display:'grid',placeItems:'center',fontSize:12,color:'#94A3B8'}}>로그인을 확인하고 있습니다.</Box>;
  const retry=()=>void reload(true);
  if((!user||blocked)&&connectionError)return <Box role="alert" sx={{minHeight:'100dvh',bgcolor:'#080D18',display:'grid',placeContent:'center',textAlign:'center',fontSize:12,color:'#94A3B8'}}>로그인 확인을 기다리고 있습니다. 연결 상태를 확인해 주세요.<Button onClick={retry}>다시 시도</Button></Box>;
  const authPath=location.pathname.startsWith('/auth/');
  return <context.Provider value={{user,reload,logout}}>{!user||user.mustChangePassword||authPath?<AuthPage key={user?.id??'signed-out'} user={user} onLogin={reload}/>:children}{connectionError&&user&&!blocked&&<Box role="alert" sx={{position:'fixed',top:0,left:0,right:0,zIndex:2147483646,bgcolor:'#172033',color:'#E5EDF7',textAlign:'center',fontSize:12}}>연결을 확인하지 못했습니다. 기존 화면을 유지합니다.<Button onClick={retry}>다시 시도</Button></Box>}{(checking||blocked)&&<Box role="status" aria-live="polite" sx={{position:'fixed',inset:0,zIndex:2147483647,bgcolor:'#080D18',display:'grid',placeItems:'center',fontSize:12,color:'#94A3B8'}}>로그인을 확인하고 있습니다.</Box>}</context.Provider>;
}
