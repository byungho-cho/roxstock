import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';

type Release = { version: string; updatedAt: string; url: string };

export function AndroidDownload() {
  const [pushRelease,setPushRelease]=useState<(Release&{firebaseConfigured:boolean})|null>(null);
  useEffect(()=>{const c=new AbortController();void fetch('/downloads/android/notifications-latest.json',{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():null).then(r=>{if(r&&/^\/downloads\/android\/[A-Za-z0-9._-]+\.apk$/.test(r.url))setPushRelease(r);}).catch(()=>{});return()=>c.abort();},[]);
  const [failed,setFailed] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/downloads/android/latest.json', { signal: controller.signal, cache: 'no-store' })
      .then(response => {if(response.status===404)return null;if(!response.ok)throw new Error("RELEASE_READ_FAILED");return response.json();})
      .then(value => {
        if (value && typeof value.version === 'string' && typeof value.updatedAt === 'string'
          && typeof value.url === 'string' && /^\/downloads\/android\/[A-Za-z0-9._-]+\.apk$/.test(value.url)) setRelease(value);
        
      }).catch(cause => {if(!controller.signal.aborted&&!(cause instanceof SyntaxError))setFailed(true);});
    return () => controller.abort();
  }, []);
  return <><Box component={release?'a':'div'} href={release?.url} download={release?true:undefined} aria-label={release?'APK 다운로드':undefined} sx={{display:'block',textDecoration:'none',color:'inherit',p:1.25,'&:focus-visible':{outline:'2px solid #3D8CF5',outlineOffset:2}, border: '1px solid #21304A', borderRadius: 2 }}>
    <QueryErrorNotice active={failed} message="다운로드 정보 조회에 실패했습니다."/><Typography sx={{ fontWeight: 600 }}>APK 다운로드</Typography>
    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>RoxStock 안드로이드 앱 · 웹 기능 제공, 체결 알림 수집 제외</Typography>
    <Typography variant="caption" sx={{ display: 'block', color: '#94A3B8' }}>{release ? `버전 ${release.version} · 업데이트 ${release.updatedAt}` : '—'}</Typography>
  </Box>{pushRelease&&<Box component="a" href={pushRelease.url} download sx={{display:'block',p:1.25,border:'1px solid #21304A',borderRadius:2,color:'inherit',textDecoration:'none'}}><Typography sx={{fontWeight:600}}>알림 지원 APK 다운로드</Typography><Typography sx={{fontSize:12}}>버전 {pushRelease.version} · {pushRelease.firebaseConfigured?'FCM 앱 설정 포함':'FCM 외부 설정 대기'}</Typography><Typography sx={{fontSize:11}}>웹 전용 앱과 별도 설치됩니다. 시스템 알림 권한과 앱 알림 설정이 필요합니다.</Typography></Box>}</>;
}
