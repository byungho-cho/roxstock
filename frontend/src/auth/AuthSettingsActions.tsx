import {useState} from 'react';
import {Button,Stack,Typography} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {useAuth} from './AuthGate';
export function AuthSettingsActions(){
 const auth=useAuth(),navigate=useNavigate(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!auth.user)return null;
 const run=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Stack spacing="8px"><Button variant="outlined" onClick={()=>navigate('/auth/change-password')}>비밀번호 변경</Button><Button variant="outlined" disabled={busy} onClick={()=>void run(auth.logout)}>로그아웃</Button>
 {error&&<Typography role="alert" sx={{fontSize:12,color:'#F87171'}}>{error}</Typography>}</Stack>;
}
