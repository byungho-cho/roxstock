import { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { isWebOnlyApp } from '../../data/appCapabilities';

export function AndroidDownload() {
  const navigate = useNavigate();
  const [release, setRelease] = useState<{ version: string; updatedAt: string; url: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/downloads/android/latest.json', { signal: controller.signal, cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(value => {
      if (value && typeof value.version === 'string' && typeof value.updatedAt === 'string' && typeof value.url === 'string' && /^\/downloads\/android\/[A-Za-z0-9._-]+\.apk$/.test(value.url)) setRelease(value);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return <Box sx={{ p: 2, border: '1px solid #21304A', borderRadius: 2 }}>
    <Typography>안드로이드 앱 다운로드</Typography>
    <Typography variant="caption" sx={{ display: 'block' }}>{release ? `버전 ${release.version} · 업데이트 ${release.updatedAt}` : 'APK 배포 준비 중'}</Typography>
    {release && <Button component="a" href={release.url} download>APK 다운로드</Button>}
    <Typography variant="caption" sx={{ display: 'block' }}>{isWebOnlyApp ? '웹 화면과 기본 메뉴를 사용하는 시험용 앱입니다.' : '설치 시 브라우저의 설치 출처 허용이 필요할 수 있습니다. 설치 후 앱에서 알림 접근을 허용하세요.'}</Typography>
    {!isWebOnlyApp && <Button onClick={() => navigate('/detail/notifications')}>거래 알림 · 샘플 테스트</Button>}
  </Box>;
}
