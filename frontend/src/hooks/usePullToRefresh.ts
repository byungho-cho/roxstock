import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActiveAccount } from './useActiveAccount';

const protectedControls = 'input,select,textarea,[contenteditable="true"],[role="slider"],[role="tab"],canvas,[data-no-pull-refresh],[data-scroll-region="stock-right"]';
export function usePullToRefresh(root: RefObject<HTMLElement | null>, page: 'home' | 'stocks' | null) {
  const client = useQueryClient(), { accountId } = useActiveAccount(), lock = useRef(false);
  const [distance, setDistance] = useState(0), [refreshing, setRefreshing] = useState(false), [error, setError] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    const element = root.current;
    setDistance(0); setRefreshing(false); setError(false); setAnchor(null);
    if (!element || !page) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number; region: HTMLElement; axis: 'pending' | 'vertical' } | null = null, pull = 0, suppressUntil = 0;
    let animated: { region: HTMLElement; translate: string; transition: string; willChange: string } | null = null;
    const restore = () => {
      if (settleTimer) clearTimeout(settleTimer);
      if (!animated) return;
      const { region, translate, transition, willChange } = animated;
      region.style.translate = translate; region.style.transition = transition; region.style.willChange = willChange;
      delete region.dataset.pullDistance; animated = null;
    };
    const translate = (region: HTMLElement, value: number, settle = false) => {
      if (animated?.region !== region) { restore(); animated = { region, translate: region.style.translate, transition: region.style.transition, willChange: region.style.willChange }; }
      if (settleTimer) clearTimeout(settleTimer);
      region.style.transition = settle && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'translate 180ms ease-out' : 'none';
      region.style.willChange = 'translate'; region.style.translate = `0 ${value}px`;
      region.dataset.pullDistance = String(value);
    };
    const reset = () => {
      start = null; pull = 0;
      if (animated) { translate(animated.region, 0, true); settleTimer = setTimeout(restore, 200); }
      if (active) setDistance(0);
    };
    const begin = (event: TouchEvent) => {
      if (lock.current) return;
      reset();
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
      const target = event.target;
      if (target.closest(protectedControls)) return;
      let region = target instanceof HTMLElement ? target : target.parentElement!;
      while (region !== element && region.parentElement) {
        const overflow = getComputedStyle(region).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') break;
        region = region.parentElement;
      }
      // A nested list at its top must not refresh while its outer page is scrolled.
      if (region.scrollTop > 0 || element.scrollTop > 0) return;
      if (page === 'stocks' && window.matchMedia('(min-width:600px)').matches && !['stock-table', 'stock-left'].includes(region.dataset.scrollRegion ?? '')) return;
      restore();
      const bounds = region.getBoundingClientRect();
      setAnchor({ top: bounds.top, left: bounds.left, width: bounds.width }); setError(false);
      if (timer) clearTimeout(timer);
      suppressUntil = 0;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, region, axis: 'pending' };
    };
    const move = (event: TouchEvent) => {
      if (lock.current) return;
      if (!start || event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (start.region.scrollTop > 0 || element.scrollTop > 0 || dy < 0) { reset(); return; }
      if (start.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) >= 12) {
        if (dy < Math.abs(dx) * 1.8) { reset(); return; }
        start.axis = 'vertical';
      }
      if (start.axis === 'vertical') {
        if (event.cancelable) event.preventDefault();
        suppressUntil = Date.now() + 700;
        pull = Math.min(90, Math.max(0, dy - 12) * .5); setDistance(pull);
        translate(start.region, pull);
      }
    };
    const end = () => {
      if (lock.current) return;
      const region = start?.region, ready = pull >= 55;
      if (pull > 0) suppressUntil = Date.now() + 700;
      if (!ready || !region) { reset(); return; }
      start = null; pull = 0; lock.current = true; setRefreshing(true); setDistance(55); translate(region, 55, true);
      const roots = page === 'home' ? ['dashboard', 'recentBuys', 'targetArrivals'] : ['stocks'];
      const queries = client.getQueryCache().findAll({ predicate: query => query.isActive() && roots.includes(String(query.queryKey[0])) });
      void Promise.allSettled(queries.map(query => client.refetchQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: false, throwOnError: true })))
        .then(results => {
          if (!active || !results.some(result => result.status === 'rejected')) return;
          setError(true); timer = setTimeout(() => { if (active) setError(false); }, 2500);
        }).finally(() => { lock.current = false; if (active) { setRefreshing(false); reset(); } });
    };
    const cancel = () => { if (!lock.current) reset(); };
    const click = (event: MouseEvent) => { if (Date.now() < suppressUntil && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); } };
    element.addEventListener('touchstart', begin, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', cancel);
    element.addEventListener('click', click, true);
    return () => {
      active = false; if (timer) clearTimeout(timer); restore();
      element.removeEventListener('touchstart', begin); element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end); element.removeEventListener('touchcancel', cancel); element.removeEventListener('click', click, true);
    };
  }, [client, page, root, accountId]);
  return { distance, refreshing, error, anchor };
}
