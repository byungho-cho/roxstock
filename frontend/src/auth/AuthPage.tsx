import {useEffect,useState,type FormEvent} from 'react';
import {Box,Button,Checkbox,IconButton,InputBase,Typography,useMediaQuery} from '@mui/material';
import {useLocation,useNavigate} from 'react-router-dom';
import {ErrorToastHost,showSuccessToast} from '../components/common/QueryErrorNotice';
import {authRequest,type AuthUser} from './client';
import {colors} from '../styles/tokens';
const linkStyle={fontSize:12,fontWeight:400,lineHeight:'18px',textAlign:'center',color:colors.focus,p:0,minHeight:18,textTransform:'none'} as const;
function Brand(){return <Box aria-label="RoxStock · 나의 투자를 기록하다" sx={{height:96,width:{xs:'100%',sm:250},display:'grid',placeItems:'center',flexShrink:0}}><Box sx={{width:197.36,height:74.36,position:'relative'}}><Box component="img" src="/auth-v12/rox-r.svg" alt="" sx={{position:'absolute',left:0,top:0,width:74.36,height:74.36}}/><Typography sx={{position:'absolute',left:62.68,top:33.68,width:126,height:32,fontSize:32,lineHeight:'32px',fontWeight:700,letterSpacing:'-.32px',color:'#EF4444'}}>oxStock</Typography><Typography sx={{position:'absolute',left:108.68,top:62.68,fontSize:10,lineHeight:'12px',whiteSpace:'nowrap',opacity:.8,color:'#3B82F6'}}>나의 투자를 기록하다</Typography></Box></Box>;}
function Field({label,value,onChange,password=false,autoComplete,placeholder}:{label:string;value:string;onChange:(v:string)=>void;password?:boolean;autoComplete:string;placeholder?:string}){
 const [visible,setVisible]=useState(false);return <Box sx={{display:'flex',flexDirection:'column',gap:'4px',width:'100%'}}><Typography component="label" htmlFor={autoComplete+'-'+label} sx={{fontSize:12,fontWeight:600,lineHeight:'16px',color:colors.textSecondary}}>{label}</Typography><Box sx={{display:'flex',height:44,bgcolor:colors.raised,borderRadius:password?'8px':'12px',border:password?0:`1px solid ${colors.border}`,alignItems:'center',width:'100%'}}><InputBase id={autoComplete+'-'+label} required fullWidth type={password&&!visible?'password':password?'text':'email'} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder??label} autoComplete={autoComplete} inputProps={{maxLength:password?(autoComplete==='new-password'?20:4096):254, ...(password&&autoComplete==='new-password'?{minLength:8}:{})}} sx={{pl:'16px',pr:password?0:'16px',fontSize:14,lineHeight:'21px',color:colors.textSecondary,minWidth:0}}/>{password&&<IconButton type="button" aria-label={visible?'비밀번호 숨기기':'비밀번호 표시'} aria-pressed={visible} onClick={()=>setVisible(!visible)} sx={{width:44,height:44,flexShrink:0,mr:'12px'}}><img src="/auth-v12/eye.svg" alt="" width="20" height="20"/></IconButton>}</Box></Box>;
}
export function AuthPage({user,onLogin}:{user:AuthUser|null;onLogin:()=>Promise<void>}){
 const location=useLocation(),navigate=useNavigate(),tablet=useMediaQuery('(min-width:600px)');
 const [address,setAddress]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[current,setCurrent]=useState(''),[remember,setRemember]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[wait,setWait]=useState(0),[sentPurpose,setSentPurpose]=useState('RESET');
 const [token]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('token')??'');
 const raw=location.pathname.split('/').at(-1),mode=user?.mustChangePassword&&!['forgot','sent','reset','complete','expired'].includes(raw??'')?'change-password':raw&&['register','forgot','sent','reset','verify','complete','expired','change-password'].includes(raw)?raw:'login';
 const [linkPending,setLinkPending]=useState(mode==='reset'||mode==='verify');
 useEffect(()=>{if(location.hash)history.replaceState(history.state,'',location.pathname);},[]);
 useEffect(()=>{if(mode!=='reset'&&mode!=='verify'){setLinkPending(false);return;}let live=true;setLinkPending(true);void authRequest('link-status',{token,purpose:mode==='verify'?'VERIFY':'RESET'}).then(()=>{if(live)setLinkPending(false);}).catch((failure:Error&{code?:string})=>{if(!live)return;if(failure.code==='LINK_EXPIRED')navigate('/auth/expired',{replace:true});else{setError(failure.message);setLinkPending(false);}});return()=>{live=false;};},[mode,token]);
 useEffect(()=>{setPassword('');setConfirmation('');setCurrent('');setError('');},[mode]);
 useEffect(()=>{if(!wait)return;const timer=setTimeout(()=>setWait(wait-1),1000);return()=>clearTimeout(timer);},[wait]);
 const go=(path:string)=>navigate('/auth/'+path);
 const send=async(purpose:string)=>{await authRequest(purpose==='VERIFY'?'resend':'forgot',{email:address});setSentPurpose(purpose);setWait(60);go('sent');};
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   if(mode==='login'){await authRequest('login',{email:address,password,remember});await onLogin();navigate('/',{replace:true});}
   if(mode==='register'){await authRequest('register',{email:address,password,confirmation});setSentPurpose('VERIFY');setWait(60);go('sent');}
   if(mode==='forgot')await send('RESET');
   if(mode==='reset'){await authRequest('reset',{token,password,confirmation});showSuccessToast('비밀번호를 변경했습니다.');await onLogin();go('complete');}
   if(mode==='verify'){await authRequest('verify',{token,password});showSuccessToast('이메일 인증을 완료했습니다.');go('complete?kind=verify');}
   if(mode==='change-password'){await authRequest('change-password',{currentPassword:current,password,confirmation});showSuccessToast('비밀번호를 변경했습니다.');await onLogin();go('complete');}
  }catch(e){const failure=e as Error&{code?:string};if(failure.code==='LINK_EXPIRED')go('expired');else setError(failure.message);}finally{setBusy(false);}
 };
 const login=mode==='login',newPass=mode==='reset'||mode==='change-password'||mode==='register';
 const verified=new URLSearchParams(location.search).get('kind')==='verify';
 const title=mode==='forgot'?'비밀번호 재설정':mode==='sent'?'메일 발송 안내':mode==='complete'?(verified?'인증 완료':'재설정 완료'):mode==='expired'?'링크 만료':mode==='register'?'이메일로 회원가입':mode==='verify'?'이메일 인증':'새 비밀번호 설정';
 const heading=mode==='forgot'?'재설정 링크 받기':mode==='sent'?'메일을 확인해 주세요':mode==='complete'?(verified?'이메일 인증을 완료했습니다':'비밀번호를 변경했습니다'):mode==='expired'?'링크를 사용할 수 없습니다':mode==='verify'?'이메일을 인증해 주세요':mode==='register'?'이메일로 회원가입':'새 비밀번호를 입력해 주세요';
 if(linkPending)return <Box role="status" sx={{height:'100dvh',display:'grid',placeItems:'center',bgcolor:colors.canvas,fontSize:12,color:colors.textMuted}}>링크를 확인하고 있습니다.</Box>;
 return <Box sx={{height:'100dvh',overflowY:'auto',bgcolor:colors.canvas,color:colors.textPrimary,display:'flex',flexDirection:'column'}}>
 {!login&&<Box sx={{height:44,minHeight:44,display:'flex',alignItems:'center',pl:'16px'}}><Button onClick={()=>go('login')} sx={{p:0,minWidth:0,color:'inherit',fontSize:22,lineHeight:'30px',fontWeight:700,textTransform:'none'}}>‹&nbsp; {title}</Button></Box>}
 <Box sx={{flex:1,display:'flex',flexDirection:'column',px:'16px',py:login?'26px':'14px',minHeight:'min-content'}}><Box sx={{my:'auto',width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:'32px',flexShrink:0}}>
 {login&&tablet&&<Brand/>}<Box component="form" onSubmit={submit} sx={{width:338,maxWidth:'100%',flexShrink:0,p:'16px',borderRadius:'16px',bgcolor:colors.surface,display:'flex',flexDirection:'column',gap:login?'8px':'12px'}}>
 {login&&!tablet&&<Brand/>}{!login&&<Typography component="h1" sx={{fontSize:16,fontWeight:600,lineHeight:'24px'}}>{heading}</Typography>}
 {mode==='forgot'&&<Typography sx={{fontSize:14,lineHeight:'21px',color:colors.textSecondary}}>가입한 이메일로 비밀번호 재설정<br/>링크를 보내드립니다.</Typography>}
 {(login||mode==='register'||mode==='forgot')&&<Field label="이메일" value={address} onChange={setAddress} autoComplete="email" placeholder={mode==='forgot'?'가입한 이메일 주소':'이메일 주소'}/>}
 {(login||mode==='verify')&&<Field label={mode==='verify'?'가입 시 비밀번호':'비밀번호'} value={password} onChange={setPassword} password autoComplete="current-password"/>}
 {mode==='change-password'&&<Field label="현재 비밀번호" value={current} onChange={setCurrent} password autoComplete="current-password"/>}
 {newPass&&<><Field label={mode==='register'?'비밀번호':'새 비밀번호'} value={password} onChange={setPassword} password autoComplete="new-password"/><Typography sx={{fontSize:12,lineHeight:'18px',color:colors.textSecondary}}>8~20자 · 영문·숫자·특수문자 중 2종류 이상</Typography><Field label={mode==='register'?'비밀번호 확인':'새 비밀번호 확인'} value={confirmation} onChange={setConfirmation} password autoComplete="new-password" placeholder="비밀번호 다시 입력"/></>}
 {login&&<Box component="label" sx={{height:28,display:'flex',alignItems:'center',gap:'8px',fontSize:12,lineHeight:'18px'}}><Checkbox checked={remember} onChange={e=>setRemember(e.target.checked)} slotProps={{input:{'aria-label':'자동 로그인'}}} sx={{p:0,width:16,height:16,'& svg':{fontSize:18}}}/>자동 로그인</Box>}
 {mode==='sent'&&<><Typography sx={{fontSize:14,lineHeight:'21px',color:colors.textSecondary}}>{sentPurpose==='VERIFY'?'인증 링크를 보냈습니다.':'등록된 이메일이라면 재설정 링크를 보냈습니다.'} 수신함과 스팸함을 확인해 주세요.</Typography><Typography sx={{fontSize:12,lineHeight:'18px',color:colors.textSecondary}}>링크는 30분 동안 한 번 사용할 수 있습니다.</Typography></>}
 {mode==='expired'&&<Typography sx={{fontSize:14,lineHeight:'21px',color:colors.textSecondary}}>유효기간이 지났거나 이미 사용한 링크입니다.<br/>메일을 다시 요청해 주세요.</Typography>}
 {mode==='complete'&&<Typography sx={{fontSize:14,lineHeight:'21px',color:colors.textSecondary}}>{verified?'로그인 화면에서 로그인해 주세요.':'새 비밀번호로 다시 로그인해 주세요.'}</Typography>}
 {error&&<Typography role="alert" sx={{fontSize:12,color:colors.error,lineHeight:'18px'}}>{error}</Typography>}
 {['login','register','forgot','reset','verify','change-password'].includes(mode)?<Button type="submit" disabled={busy} sx={{height:44,minHeight:44,bgcolor:colors.focus,color:colors.textPrimary,borderRadius:'12px',fontWeight:600,fontSize:16,lineHeight:'24px','&:hover':{bgcolor:colors.focus}}}>{busy?'처리 중…':login?'로그인':mode==='forgot'?'재설정 메일 보내기':mode==='register'?'인증 메일 보내기':mode==='verify'?'이메일 인증':'비밀번호 변경'}</Button>:<Button onClick={()=>go(mode==='expired'?'forgot':'login')} sx={{height:44,bgcolor:colors.focus,color:colors.textPrimary,borderRadius:'12px',fontSize:16,fontWeight:600}}>{mode==='expired'?'재설정 메일 다시 요청':mode==='complete'?'로그인':'로그인으로 돌아가기'}</Button>}
 {login&&<><Button sx={linkStyle} onClick={()=>go('forgot')}>비밀번호를 잊으셨나요?</Button><Button sx={{...linkStyle,color:colors.textSecondary}} onClick={()=>go('register')}>이메일로 회원가입</Button></>}
 {(mode==='forgot'||mode==='register')&&<Button sx={linkStyle} onClick={()=>go('login')}>로그인으로 돌아가기</Button>}
 {mode==='change-password'&&<Button sx={linkStyle} onClick={()=>go('forgot')}>비밀번호를 잊으셨나요?</Button>}
 {mode==='sent'&&<Button sx={{...linkStyle,color:colors.textSecondary}} disabled={busy||wait>0} onClick={async()=>{setBusy(true);try{await send(sentPurpose);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>다시 보내기{wait?` · ${wait}초 후`:''}</Button>}
 {(mode==='reset'||mode==='change-password')&&<Typography sx={{fontSize:12,lineHeight:'18px',textAlign:'center',color:colors.textSecondary}}>변경 후 모든 기기에서 다시 로그인합니다.</Typography>}
 </Box></Box></Box><ErrorToastHost/></Box>;
}
