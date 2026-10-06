import { RefreshRounded } from '@mui/icons-material';
import { Box, Fade } from '@mui/material';
import { colors } from '../../styles/tokens';
import type { usePullToRefresh } from '../../hooks/usePullToRefresh';

const hidden = { position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 } as const;
export function PullRefreshIndicator({ pull }: { pull: ReturnType<typeof usePullToRefresh> }) {
  const visible = pull.refreshing || pull.distance > 0;
  return <>
    <Box role="status" aria-live="polite" aria-atomic="true" sx={hidden}>{pull.refreshing ? '새로고침 중' : pull.distance >= 55 ? '놓으면 새로고침' : pull.distance > 0 ? '아래로 당겨 새로고침' : ''}</Box>
    {pull.anchor && <Fade in={visible} timeout={120} mountOnEnter unmountOnExit><Box aria-hidden="true" data-testid="pull-refresh" data-refreshing={pull.refreshing} sx={{ position: 'fixed', top: pull.anchor.top + 6, left: pull.anchor.left + pull.anchor.width / 2, zIndex: 13, width: 32, height: 32, display: 'grid', placeItems: 'center', bgcolor: colors.surface, color: colors.textPrimary, borderRadius: '50%', boxShadow: '0 2px 8px #0004', pointerEvents: 'none', transform: 'translateX(-50%)' }}>
      <RefreshRounded data-testid="pull-refresh-rotation" sx={{ fontSize: 23, transform: `rotate(${pull.distance / 55 * 360}deg)`, animation: pull.refreshing ? 'pull-refresh-spin 800ms linear infinite' : 'none', '@keyframes pull-refresh-spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }}/></Box></Fade>}
    {pull.error && pull.anchor && <Box role="alert" sx={{position:'fixed',top:pull.anchor.top+6,left:pull.anchor.left+pull.anchor.width/2,transform:'translateX(-50%)',zIndex:13,bgcolor:colors.surface,borderRadius:'8px',px:'12px',py:'6px',fontSize:11,pointerEvents:'none'}}>새로고침에 실패했습니다.</Box>}
  </>;
}
