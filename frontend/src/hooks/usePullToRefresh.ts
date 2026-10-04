import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Bind to the actual touched scroll region, including tablet list columns. */
export function usePullToRefresh(root: RefObject<HTMLElement | null>, page: 'home' | 'stocks' | null) {
  const client = useQueryClient(), lock = useRef(false);
  const [distance, setDistance] = useState(0), [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element || !page) return;
    let start: {x: number; y: number; region: HTMLElement} | null = null;
    let pull = 0;
    const reset = () => { start = null; pull = 0; setDistance(0); };
    const begin = (event: TouchEvent) => {
      if (lock.current || event.touches.length !== 1) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, select, textarea, [data-scroll-region="stock-right"]')) return;
      let region = target;
      while (region !== element && region.parentElement) {
        const overflow = getComputedStyle(region).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') break;
        region = region.parentElement;
      }
      if (region.scrollTop > 0) return;
      start = {x: event.touches[0].clientX, y: event.touches[0].clientY, region};
    };
    const move = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (start.region.scrollTop > 0 || dy < 0 || Math.abs(dx) > Math.abs(dy)) { reset(); return; }
      if (dy > 12) {
        if (event.cancelable) event.preventDefault();
        pull = Math.min(90, (dy - 12) * .5); setDistance(pull);
      }
    };
    const end = () => {
      const ready = pull >= 55; reset();
      if (!ready || lock.current) return;
      lock.current = true; setRefreshing(true);
      const roots = page === 'home' ? ['dashboard', 'recentBuys', 'targetArrivals'] : ['stocks'];
      void client.refetchQueries({predicate: query => query.isActive() && roots.includes(String(query.queryKey[0]))}, {cancelRefetch:false})
        .finally(() => {lock.current = false; setRefreshing(false);});
    };
    element.addEventListener('touchstart', begin, {passive:true});
    element.addEventListener('touchmove', move, {passive:false});
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', reset);
    return () => {element.removeEventListener('touchstart', begin);element.removeEventListener('touchmove', move);element.removeEventListener('touchend', end);element.removeEventListener('touchcancel', reset);reset();};
  }, [client, page, root]);
  return {distance, refreshing};
}
