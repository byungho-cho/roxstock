import { RefreshRounded } from '@mui/icons-material';
import { Box } from '@mui/material';
import { colors, pageMetrics } from '../../styles/tokens';

/** Sibling of the scroll container: the fixed header and overflow cannot clip it. */
export function PullRefreshIndicator({ distance, refreshing }: { distance: number; refreshing: boolean }) {
  const visible = distance > 0 || refreshing;
  return <Box data-testid="pull-refresh-indicator" data-refreshing={refreshing} aria-hidden="true"
    sx={{ position: 'fixed', top: pageMetrics.headerHeight, left: '50%', zIndex: 12,
      width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center',
      bgcolor: colors.raised, color: colors.textPrimary, boxShadow: '0 2px 8px #0006',
      pointerEvents: 'none', opacity: visible ? 1 : 0,
      transform: `translate(-50%, ${refreshing ? 8 : distance - 36}px)`,
      transition: distance > 0 && !refreshing ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
      '@keyframes rox-refresh-spin': { to: { transform: 'rotate(360deg)' } },
      '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
    <RefreshRounded sx={{ fontSize: 22, transform: `rotate(${distance * 4}deg)`,
      animation: refreshing ? 'rox-refresh-spin 800ms linear infinite' : 'none',
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }} />
  </Box>;
}
