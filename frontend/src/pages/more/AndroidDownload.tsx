import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';

type Release = { version: string; updatedAt: string; url: string };

export function AndroidDownload() {
  const [failed,setFailed] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/downloads/android/latest.json', { signal: controller.signal, cache: 'no-store' })
      .then(response => {if(!response.ok)throw new Error("RELEASE_READ_FAILED");return response.json();})
      .then(value => {
        if (value && typeof value.version === 'string' && typeof value.updatedAt === 'string'
          && typeof value.url === 'string' && /^\/downloads\/android\/[A-Za-z0-9._-]+\.apk$/.test(value.url)) setRelease(value);
        else setFailed(true);
      }).catch(() => {if(!controller.signal.aborted)setFailed(true);});
    return () => controller.abort();
  }, []);
  return <Box component={release?'a':'div'} href={release?.url} download={release?true:undefined} aria-label={release?'APK 다운로드':undefined} sx={{display:'block',textDecoration:'none',color:'inherit',p:1.25,'&:focus-visible':{outline:'2px solid #3D8CF5',outlineOffset:2}, border: '1px solid #21304A', borderRadius: 2 }}>
    <QueryErrorNotice active={failed} message="다운로드 정보 조회에 실패했습니다."/><Typography sx={{ fontWeight: 600 }}>APK 다운로드</Typography>
    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>RoxStock 안드로이드 앱 · 웹 기능 제공, 체결 알림 수집 제외</Typography>
    <Typography variant="caption" sx={{ display: 'block', color: '#94A3B8' }}>{release ? `버전 ${release.version} · 업데이트 ${release.updatedAt}` : '—'}</Typography>
  </Box>;
}
