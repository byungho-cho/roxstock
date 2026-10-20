import {useState} from 'react';
import {Box,Button,Stack,Typography} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {FormTextField} from '../components/forms/Fields';
import {showSuccessToast} from '../components/common/QueryErrorNotice';
import {authRequest} from './client';
import {useAuth} from './AuthGate';
export function AuthSettingsActions(){
 const auth=useAuth(),navigate=useNavigate(),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!auth.user)return null;
 const run=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Stack spacing="8px"><Button variant="outlined" onClick={()=>navigate('/auth/change-password')}>비밀번호 변경</Button><Button variant="outlined" disabled={busy} onClick={()=>void run(auth.logout)}>로그아웃</Button>
 {auth.user.role==='ADMIN'&&<Box component="form" onSubmit={event=>{event.preventDefault();void run(async()=>{await authRequest('invitations',{email});setEmail('');showSuccessToast('가입할 이메일을 승인했습니다.');});}} sx={{display:'flex',flexDirection:'column',gap:'8px'}}><FormTextField label="가입 승인 이메일" required value={email} onChange={setEmail}/><Button type="submit" variant="outlined" disabled={busy}>이메일 가입 승인</Button></Box>}
 {error&&<Typography role="alert" sx={{fontSize:12,color:'#F87171'}}>{error}</Typography>}</Stack>;
}
