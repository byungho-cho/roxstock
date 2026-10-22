import {brokerAvailable,brokerNative} from './brokerNative';
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Alert,Box,Button,FormControlLabel,Stack,Switch,Typography} from '@mui/material';
import {useAuth} from '../auth/AuthGate';
import {apiRequest} from '../data/apiClient';
import {showSuccessToast,QueryErrorNotice} from '../components/common/QueryErrorNotice';
import {nativePush,nativePushAvailable} from './native';
export type NotificationPreferences={tradeEnabled:boolean;targetEnabled:boolean;newsEnabled:boolean;pushConfigured:boolean};
export async function registerPush(){
 const result=await nativePush('token');if(!result.granted)throw new Error('시스템 알림 권한이 꺼져 있습니다. 시스템 설정에서 허용해 주세요.');if(!result.configured||!result.token||!result.installationId)throw new Error('FCM 앱 설정이 필요합니다. 알림 지원 APK와 서버 설정을 확인해 주세요.');
 const device=await apiRequest<{binding:string}>('/notifications/devices',{method:'POST',body:JSON.stringify({installationId:result.installationId,token:result.token})});await nativePush('bind',{binding:device.binding,revision:result.revision??''});
}
export function NotificationSettings(){
 const {user}=useAuth(),client=useQueryClient(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const q=useQuery({queryKey:['notification-settings',user?.id],queryFn:()=>apiRequest<NotificationPreferences>('/notifications/settings'),staleTime:0});
 const os=useQuery({queryKey:['push-os-status',user?.id],queryFn:()=>nativePush('push-status'),enabled:nativePushAvailable(),staleTime:0});
 const broker=useQuery({queryKey:['broker-os-status',user?.id],queryFn:()=>brokerNative('list'),enabled:brokerAvailable(),staleTime:0,refetchOnWindowFocus:true});
 const change=async(key:'tradeEnabled'|'targetEnabled'|'newsEnabled',checked:boolean)=>{if(!q.data||busy)return;setBusy(true);setError('');try{
  if(checked&&key==='tradeEnabled'){if(!brokerAvailable())throw new Error('거래 알림은 Android 알림 지원 APK에서 사용할 수 있습니다.');const status=await brokerNative('list');if(status.protocolVersion!==2)throw new Error('통합 알림 지원 APK 업데이트가 필요합니다.');if(!status.permission)await brokerNative('permission');}
  if(checked&&key!=='tradeEnabled'){if(!q.data.pushConfigured)throw new Error('서버 푸시 설정이 아직 준비되지 않았습니다.');await nativePush('permission');await registerPush();}
  const saved=await apiRequest<NotificationPreferences>('/notifications/settings',{method:'PUT',body:JSON.stringify({tradeEnabled:q.data.tradeEnabled,targetEnabled:q.data.targetEnabled,newsEnabled:q.data.newsEnabled,[key]:checked})});client.setQueryData(['notification-settings',user?.id],saved);if(nativePushAvailable())await nativePush('preferences',{userId:user!.id,tradeEnabled:String(saved.tradeEnabled),targetEnabled:String(saved.targetEnabled),newsEnabled:String(saved.newsEnabled)});await client.invalidateQueries({queryKey:['notification-inbox',user?.id]});showSuccessToast('알림 설정을 저장했습니다.');
 }catch(e){setError((e as Error).message);void q.refetch();}finally{setBusy(false);if(nativePushAvailable())void os.refetch();if(brokerAvailable())void broker.refetch();}};
 return <Stack spacing={1}><Typography component="h2" sx={{fontSize:16,fontWeight:600}}>알림 설정</Typography><Typography sx={{fontSize:12}}>OS 알림 권한과 사용자별 수신 설정은 각각 관리됩니다. 새 설정은 OFF입니다.</Typography>{nativePushAvailable()&&<Typography sx={{fontSize:12}}>시스템 알림: {os.data?.granted?'허용':os.isPending?'확인 중':'꺼짐 또는 확인 필요'} · 앱 FCM: {os.data?.configured?'설정됨':'설정 필요'}</Typography>}{brokerAvailable()&&<Typography sx={{fontSize:12}}>거래 알림 접근: {broker.data?.permission?'허용':'확인 필요'} · 미래에셋증권 전량체결·배당 형식 지원</Typography>}{brokerAvailable()&&<Button onClick={()=>void brokerNative('permission').catch(e=>setError(e.message))}>카카오 거래 알림 접근 설정</Button>}<QueryErrorNotice active={q.isError} message="알림 설정을 불러오지 못했습니다." onRetry={()=>void q.refetch()}/>{q.isPending&&<Typography role="status">설정 조회 중</Typography>}{q.data&&<>{(['tradeEnabled','newsEnabled','targetEnabled'] as const).map((key,i)=><FormControlLabel key={key} label={i===0?'거래 알림':i===1?'종목소식 알림':'목표가 도래 알림'} control={<Switch checked={q.data[key]} disabled={busy} onChange={(_,checked)=>void change(key,checked)}/>} />)}{!q.data.pushConfigured&&<Alert severity="info">푸시 외부 설정 준비 중입니다. 현재 알림을 발송하지 않습니다.</Alert>}</>}{error&&<Alert severity="error">{error}</Alert>}{nativePushAvailable()?<Button onClick={()=>void nativePush('settings').catch(e=>setError(e.message))}>시스템 알림 설정</Button>:<Box sx={{fontSize:12}}>앱 알림은 알림 지원 Android APK에서 사용할 수 있습니다.</Box>}<Typography sx={{fontSize:11}}>기존 목록과 OFF 기간의 알림은 보내지 않습니다. 목표 알림은 한국 날짜 기준 계좌·종목·조건별 하루 최초 1회만 발생합니다.</Typography></Stack>;
}
