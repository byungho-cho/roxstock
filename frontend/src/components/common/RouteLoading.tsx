import { Box, Button, Skeleton, Typography } from '@mui/material';
import { Component, Suspense, type ReactNode } from 'react';

export function RouteLoading() {
  return <Box role="status" aria-label="화면 불러오는 중" sx={{ p: 1 }}>
    <Skeleton variant="rounded" height={76} />
    <Skeleton variant="rounded" height={148} sx={{ mt: 1 }} />
  </Box>;
}

export class RouteContent extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Box role="alert" sx={{ p: 2 }}>
      <Typography>화면을 불러오지 못했어요.</Typography>
      <Button onClick={() => window.location.reload()}>새로고침하여 다시 시도</Button>
    </Box>;
    return <Suspense fallback={<RouteLoading />}>{this.props.children}</Suspense>;
  }
}
