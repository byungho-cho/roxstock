import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveAccount } from './useActiveAccount';

export function usePullToRefresh(root: RefObject<HTMLElement | null>, page: 'home' | 'stocks' | null) {
  const client = useQueryClient(), { accountId } = useActiveAccount(), lock = useRef(false);
  const [distance, setDistance] = useState(0), [refreshing, setRefreshing] = useState(false), [error, setError] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    const element = root.current;
    setDistance(0); setRefreshing(false); setError(false); setAnchor(null);
    if (!element || !page) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number; region: HTMLElement; axis: 'pending' | 'vertical' } | null = null, pull = 0;
    const reset = () => { start = null; pull = 0; if (active) setDistance(0); };
    const begin = (event: TouchEvent) => {
      reset();
      if (lock.current || event.touches.length !== 1 || !(event.target instanceof Element)) return;
      const target = event.target;
      if (target.closest('button,a,input,select,textarea,canvas,svg,[role="button"],[role="slider"],[data-no-pull-refresh],[data-scroll-region="stock-right"]')) return;
      let region = target instanceof HTMLElement ? target : target.parentElement!;
      while (region !== element && region.parentElement) {
        const overflow = getComputedStyle(region).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') break;
        region = region.parentElement;
      }
      if (region.scrollTop > 0) return;
      const bounds = region.getBoundingClientRect();
      setAnchor({ top: bounds.top, left: bounds.left, width: bounds.width }); setError(false);
      if (timer) clearTimeout(timer);
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, region, axis: 'pending' };
    };
    const move = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (start.region.scrollTop > 0 || dy < 0) { reset(); return; }
      if (start.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 12) {
        if (dy < Math.abs(dx) * 1.8) { reset(); return; }
        start.axis = 'vertical';
      }
      if (start.axis === 'vertical') {
        if (event.cancelable) event.preventDefault();
        pull = Math.min(90, Math.max(0, dy - 12) * .5); setDistance(pull);
      }
    };
    const end = () => {
      const ready = pull >= 55; reset();
      if (!ready || lock.current) return;
      lock.current = true; setRefreshing(true);
      const roots = page === 'home' ? ['dashboard', 'recentBuys', 'targetArrivals'] : ['stocks'];
      const queries = client.getQueryCache().findAll({ predicate: query => query.isActive() && roots.includes(String(query.queryKey[0])) });
      void Promise.allSettled(queries.map(query => client.refetchQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: false, throwOnError: true })))
        .then(results => {
          if (!active || !results.some(result => result.status === 'rejected')) return;
          setError(true); timer = setTimeout(() => { if (active) setError(false); }, 2500);
        }).finally(() => { lock.current = false; if (active) setRefreshing(false); });
    };
    element.addEventListener('touchstart', begin, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', reset);
    return () => {
      active = false; if (timer) clearTimeout(timer);
      element.removeEventListener('touchstart', begin); element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end); element.removeEventListener('touchcancel', reset);
    };
  }, [client, page, root, accountId]);
  return { distance, refreshing, error, anchor };
}
