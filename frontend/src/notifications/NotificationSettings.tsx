import {brokerAvailable,brokerNative} from './brokerNative';
import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Alert,Box,Button,ButtonBase,Stack,Typography} from '@mui/material';
import {useAuth} from '../auth/AuthGate';
import {apiRequest} from '../data/apiClient';
import {showSuccessToast,QueryErrorNotice} from '../components/common/QueryErrorNotice';
import {nativePush,nativePushAvailable} from './native';
export const notificationKinds=[['buyEnabled','매수'],['sellEnabled','매도'],['dividendEnabled','배당'],['newsEnabled','종목 소식'],['targetEnabled','목표 도래']] as const;
export type NotificationField='enabled'|typeof notificationKinds[number][0];
export type AccountNotificationSettings={id:string;name:string;brokerName:string;accountNumber:string|null;isDefault:boolean}&Record<NotificationField,boolean>;
export type NotificationPreferences={policyRevision:number;tradeEnabled:boolean;targetEnabled:boolean;newsEnabled:boolean;pushConfigured:boolean;accounts:AccountNotificationSettings[]};
export const effectiveNotification=(p:AccountNotificationSettings|undefined,kind:string)=>!!p?.enabled&&!!p[({BUY:'buyEnabled',SELL:'sellEnabled',DIVIDEND:'dividendEnabled',NEWS:'newsEnabled',TARGET:'targetEnabled'} as const)[kind as 'BUY']];
export async function syncNativePreferences(userId:string,p:NotificationPreferences){
 if(!nativePushAvailable())return;
 const result=await nativePush('preferences',{userId,policyRevision:String(p.policyRevision),tradeEnabled:String(p.tradeEnabled),targetEnabled:String(p.targetEnabled),newsEnabled:String(p.newsEnabled),accounts:JSON.stringify(p.accounts)});
 if(result.protocolVersion!==3){await nativePush('preferences',{userId,tradeEnabled:'false',targetEnabled:'false',newsEnabled:'false'});throw new Error('계좌별 알림을 사용하려면 최신 APK로 업데이트해 주세요.');}
}
export async function registerPush(){
 const result=await nativePush('token');if(!result.granted)throw new Error('시스템 알림 권한이 꺼져 있습니다. 시스템 설정에서 허용해 주세요.');if(!result.configured||!result.token||!result.installationId)throw new Error('FCM 앱 설정이 필요합니다. 알림 지원 APK와 서버 설정을 확인해 주세요.');
 if(result.protocolVersion!==3)throw new Error('최신 APK로 업데이트해 주세요.');
 const device=await apiRequest<{binding:string}>('/notifications/devices',{method:'POST',body:JSON.stringify({installationId:result.installationId,token:result.token,policyVersion:3})});await nativePush('bind',{binding:device.binding,revision:result.revision??''});
}
function SettingSwitch({checked,disabled,label,onChange}:{checked:boolean;disabled?:boolean;label:string;onChange:()=>void}){
 return <ButtonBase role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={e=>{e.stopPropagation();onChange();}} sx={{width:42,height:24,flexShrink:0,borderRadius:'12px',opacity:disabled?.45:1}}><img src={'/notifications-v14/switch-'+(checked?'on':'off')+'.svg'} alt=""/></ButtonBase>;
}
export function NotificationSettings(){
 const {user}=useAuth(),client=useQueryClient(),[error,setError]=useState(''),[expanded,setExpanded]=useState<Record<string,boolean>>({});
 const q=useQuery({queryKey:['notification-settings',user?.id],queryFn:()=>apiRequest<NotificationPreferences>('/notifications/settings'),staleTime:0});
 const [optimistic,setOptimistic]=useState<NotificationPreferences|null>(null);
 const current=useRef<NotificationPreferences|null>(null),confirmed=useRef<NotificationPreferences|null>(null),queue=useRef<Array<{id:string;key:NotificationField;checked:boolean}>>([]),running=useRef(false),scope=useRef(user?.id);
 useEffect(()=>{if(!running.current&&q.data){confirmed.current=q.data;current.current=q.data;setOptimistic(q.data);}},[q.data]);
 useEffect(()=>{scope.current=user?.id;return()=>{scope.current=undefined;};},[user?.id]);
 const apply=(p:NotificationPreferences,job:{id:string;key:NotificationField;checked:boolean}):NotificationPreferences=>{
  const accounts=p.accounts.map(a=>a.id===job.id?{...a,[job.key]:job.checked}:a);
  return {...p,accounts,tradeEnabled:accounts.some(a=>['BUY','SELL','DIVIDEND'].some(k=>effectiveNotification(a,k))),newsEnabled:accounts.some(a=>effectiveNotification(a,'NEWS')),targetEnabled:accounts.some(a=>effectiveNotification(a,'TARGET'))};
 };
 const publish=(p:NotificationPreferences)=>{current.current=p;setOptimistic(p);client.setQueryData(['notification-settings',user?.id],p);};
 const flush=async()=>{
  if(running.current)return;running.current=true;const owner=user!.id;
  try{while(queue.current.length&&scope.current===owner){const job=queue.current[0];try{
    const saved=await apiRequest<{policyRevision:number}>('/notifications/settings/accounts/'+job.id,{method:'PATCH',body:JSON.stringify({[job.key]:job.checked})});
    confirmed.current={...apply(confirmed.current!,job),policyRevision:saved.policyRevision};queue.current.shift();
   }catch{queue.current.shift();setError('알림 설정 저장에 실패했습니다. 이전 설정으로 되돌렸습니다. 다시 시도해 주세요.');}
   if(scope.current!==owner)break;
   const next=queue.current.reduce(apply,confirmed.current!);publish(next);
   // Native sync uses only confirmed values; queued newer intents remain on screen.
   try{await syncNativePreferences(owner,confirmed.current!);}catch{setError('계좌 설정은 저장됐지만 앱 반영을 확인하지 못했습니다. 앱을 다시 열어 주세요.');}
  }}finally{running.current=false;if(scope.current===owner){await client.invalidateQueries({queryKey:['notification-inbox',owner]});await client.invalidateQueries({queryKey:['broker-inbox',owner]});}}
 };
 const change=(id:string,key:NotificationField,checked:boolean)=>{if(!current.current)return;setError('');const job={id,key,checked};queue.current.push(job);publish(apply(current.current,job));void flush();};
 const permission=async()=>{try{setError('');if(brokerAvailable())await brokerNative('permission');if(nativePushAvailable()){await nativePush('permission');if(optimistic?.pushConfigured)await registerPush();}showSuccessToast('앱 알림 권한을 확인했습니다.');}catch(e){setError((e as Error).message);}};
 return <Stack spacing="8px" sx={{px:'8px'}}><Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',height:24,gap:1}}><Typography sx={{fontSize:14,fontWeight:600}}>계좌별 알림</Typography><Typography sx={{fontSize:10,color:'#94a3b8',textAlign:'right'}}>계좌를 펼쳐 알림을 설정하세요.</Typography></Box>
  <QueryErrorNotice active={q.isError} message="알림 설정을 불러오지 못했습니다." onRetry={()=>void q.refetch()}/>{q.isPending&&<Typography role="status">설정 조회 중</Typography>}
  <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,338px))'},gap:'12px',alignItems:'start'}}>{optimistic?.accounts.map(a=><Box key={a.id} data-testid={'account-notifications-'+a.id} sx={{bgcolor:'#111b2b',borderRadius:'10px',p:'8px 12px',minWidth:0}}>
   <Box sx={{display:'flex',height:32,alignItems:'center',gap:'12px'}}><ButtonBase aria-expanded={!!expanded[a.id]} aria-controls={'notification-types-'+a.id} onClick={()=>setExpanded(p=>({...p,[a.id]:!p[a.id]}))} sx={{minWidth:0,flex:1,display:'flex',gap:'6px',justifyContent:'flex-start',height:32}}><img src={'/notifications-v14/chevron-'+(expanded[a.id]?'down':'right')+'.svg'} alt=""/><Typography noWrap sx={{fontSize:12,fontWeight:600,minWidth:0}}>{a.brokerName} · {a.name}</Typography><Typography noWrap sx={{fontSize:10,color:'#94a3b8',minWidth:0}}>{a.accountNumber}</Typography></ButtonBase><SettingSwitch label={`${a.name} 계좌 알림`} checked={a.enabled} onChange={()=>change(a.id,'enabled',!a.enabled)}/></Box>
   {expanded[a.id]&&<Box id={'notification-types-'+a.id} sx={{borderTop:'1px solid #334054',mt:'4px',pt:'4px'}}>{notificationKinds.map(([key,label])=><Box key={key} sx={{display:'flex',height:36,alignItems:'center',justifyContent:'space-between',gap:1}}><Typography sx={{fontSize:12}}>{label}</Typography><SettingSwitch label={`${a.name} ${label}`} checked={a[key]} disabled={!a.enabled} onChange={()=>change(a.id,key,!a[key])}/></Box>)}</Box>}
  </Box>)}</Box>
  {optimistic&&!optimistic.accounts.length&&<Typography sx={{fontSize:12,textAlign:'center'}}>등록된 계좌가 없습니다.</Typography>}{error&&<Alert severity="error">{error}</Alert>}
  {nativePushAvailable()&&<Button onClick={()=>void permission()}>앱 알림 권한 설정</Button>}
 </Stack>;
}
