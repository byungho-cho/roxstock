import { Box, LinearProgress } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useManualLoadingCount } from '../../hooks/useMainLoading';

/** Only mounted observers count; prefetches and scheduled price refreshes stay quiet. */
export function MainLoadingBar() {
  const client = useQueryClient(), location = useLocation();
  const [visible, setVisible] = useState(false);
  const manual = useManualLoadingCount();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cache = client.getQueryCache();
    const update = () => {
      const busy = manual > 0 || cache.getAll().some(query => query.isActive() && query.state.fetchStatus === 'fetching'
        && (query.state.data === undefined || !query.observers.some(observer => !!observer.options.refetchInterval)));
      if (!busy) { clearTimeout(timer); timer = undefined; setVisible(false); }
      else if (!timer) timer = setTimeout(() => setVisible(true), 150);
    };
    // Query observers can notify during render; publish the loading state after that render.
    let disposed = false, queued = false;
    const unsubscribe = cache.subscribe(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (!disposed) update(); });
    });
    update();
    return () => { disposed = true; unsubscribe(); clearTimeout(timer); };
  }, [client, location.pathname, location.search, manual]);
  return <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1600, height: 3, pointerEvents: 'none' }}>
    {visible && <LinearProgress aria-label="메인 로딩바" data-testid="main-loading-bar" sx={{ height: 3 }} />}
  </Box>;
}
