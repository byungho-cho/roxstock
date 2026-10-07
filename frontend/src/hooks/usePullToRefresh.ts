import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMainLoading } from './useMainLoading';

const protectedControls = 'input,select,textarea,[contenteditable="true"],[role="slider"],[role="tab"],canvas,[data-no-pull-refresh],[role="dialog"]';
/** Fallback for the fixed document / independently scrolling body. Native overscroll is contained. */
export function usePullToRefresh(root: RefObject<HTMLElement | null>, scope: string) {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false), [error, setError] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  useMainLoading(refreshing);
  useEffect(() => {
    const element = root.current;
    setRefreshing(false); setError(false);
    if (!element) return;
    let active = true, locked = false, pull = 0, suppressUntil = 0;
    let start: { x: number; y: number; region: HTMLElement; axis: 'pending' | 'vertical' } | null = null;
    const reset = () => { start = null; pull = 0; delete element.dataset.pullDistance; };
    const atTop = (region: HTMLElement) => {
      for (let parent: HTMLElement | null = region; parent; parent = parent.parentElement) {
        if (parent.scrollTop > 0) return false;
        if (parent === element) break;
      }
      return true;
    };
    const refresh = () => {
      if (locked || !active) return;
      locked = true; setRefreshing(true); setError(false);
      const queries = client.getQueryCache().findAll({ predicate: query => query.isActive() });
      void Promise.allSettled(queries.map(query => client.refetchQueries({ queryKey: query.queryKey, exact: true, type: 'active' }, { cancelRefetch: false, throwOnError: true })))
        .then(results => { if (active) setError(results.some(result => result.status === 'rejected')); })
        .finally(() => { if (active) { locked = false; setRefreshing(false); reset(); } });
    };
    refreshRef.current = refresh;
    const begin = (event: TouchEvent) => {
      reset();
      if (locked || event.touches.length !== 1 || !(event.target instanceof Element) || event.target.closest(protectedControls)) return;
      const touch = event.touches[0];
      if (touch.clientX < 24) return; // Browser back edge remains available.
      let region = event.target instanceof HTMLElement ? event.target : event.target.parentElement!;
      while (region !== element && region.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(region).overflowY)) break;
        region = region.parentElement;
      }
      if (!atTop(region)) return;
      start = { x: touch.clientX, y: touch.clientY, region, axis: 'pending' };
    };
    const move = (event: TouchEvent) => {
      if (!start || locked || event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (!atTop(start.region) || dy < 0) { reset(); return; }
      if (start.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 12) {
        if (dy < Math.abs(dx) * 1.8) { reset(); return; }
        start.axis = 'vertical';
      }
      if (start.axis === 'vertical') {
        if (event.cancelable) event.preventDefault();
        pull = Math.max(0, dy - 12); element.dataset.pullDistance = String(pull);
        if (pull >= 100) suppressUntil = performance.now() + 700;
      }
    };
    const end = () => { const ready = !!start && atTop(start.region) && pull >= 100; reset(); if (ready) refresh(); };
    const click = (event: MouseEvent) => { if (performance.now() < suppressUntil && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); } };
    element.addEventListener('touchstart', begin, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', reset);
    element.addEventListener('click', click, true);
    return () => {
      active = false; reset(); refreshRef.current = () => {};
      element.removeEventListener('touchstart', begin); element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end); element.removeEventListener('touchcancel', reset); element.removeEventListener('click', click, true);
    };
  }, [client, root, scope]);
  return { refreshing, error, dismissError: () => setError(false), retry: () => refreshRef.current() };
}
