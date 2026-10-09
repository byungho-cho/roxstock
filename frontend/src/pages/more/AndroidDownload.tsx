import { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';

type Release = { version: string; updatedAt: string; url: string };

export function AndroidDownload() {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/downloads/android/latest.json', { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(value => {
        if (value && typeof value.version === 'string' && typeof value.updatedAt === 'string'
          && typeof value.url === 'string' && /^\/downloads\/android\/[A-Za-z0-9._-]+\.apk$/.test(value.url)) setRelease(value);
      }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return <Box sx={{ p: 2, border: '1px solid #21304A', borderRadius: 2 }}>
    <Typography sx={{ fontWeight: 600 }}>안드로이드 앱 다운로드</Typography>
    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>RoxStock 웹 시험 · 체결 알림 수집 제외</Typography>
    <Typography variant="caption" sx={{ display: 'block', color: '#94A3B8' }}>{release ? `버전 ${release.version} · 업데이트 ${release.updatedAt}` : '다운로드 정보를 불러올 수 없습니다.'}</Typography>
    {release && <Button component="a" href={release.url} download sx={{ mt: 1 }}>시험용 APK 다운로드</Button>}
  </Box>;
}
