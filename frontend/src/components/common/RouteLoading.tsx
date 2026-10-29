import {ScreenLoading} from './ScreenLoading';
import {QueryErrorNotice} from './QueryErrorNotice';
import {useDelayedIndicator} from './DelayedSkeleton';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { Component, Suspense, type ReactNode } from 'react';
import {useLocation} from 'react-router-dom';
import {PriorityRouteShell} from './PriorityRouteShell';

export function RouteLoading() {
  const visible=useDelayedIndicator();
  const {pathname,search}=useLocation();
  if(pathname==='/detail/security-data')return <ScreenLoading/>;
  if(pathname==='/detail/financials'||/^\/stocks\/[^/]+\/financials$/.test(pathname)||pathname==='/detail/value'||/^\/stocks\/[^/]+\/value$/.test(pathname)||/^\/stocks\/[^/]+$/.test(pathname)||pathname==='/'||pathname==='/detail/assets'||pathname==='/assets'||pathname==='/stocks'||pathname==='/detail/compound'||pathname==='/detail/investment'||pathname==='/detail/investment-profit'||pathname==='/detail/cash'&&!new URLSearchParams(search).has('cashInput')&&!new URLSearchParams(search).has('editCash'))return <PriorityRouteShell/>;
  return <><PriorityRouteShell/><Box role={visible?'status':undefined} aria-label={visible?'화면 불러오는 중':undefined} sx={{height:24,display:'flex',justifyContent:'center',visibility:visible?'visible':'hidden'}}><CircularProgress size={16}/></Box></>;
}
export class RouteContent extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Box role="alert" sx={{ p: 2 }}>
      <QueryErrorNotice message="화면을 불러오지 못했습니다." inlineRetry={false} onRetry={()=>window.location.reload()}/>
      <Button onClick={() => window.location.reload()}>새로고침하여 다시 시도</Button>
    </Box>;
    return <Suspense fallback={<RouteLoading />}>{this.props.children}</Suspense>;
  }
}
