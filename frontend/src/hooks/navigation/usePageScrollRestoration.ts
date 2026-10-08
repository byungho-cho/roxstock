import { useLayoutEffect, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { readPageMemory, writePageMemory, nearestSavedItem } from './pageMemory';
import { usePageMemoryKey } from './usePageMemory';

type Position = { top: number; left: number; anchor?: string; offset?: number; order: string[] };
export function usePageScrollRestoration(ref: RefObject<HTMLElement | null>) {
  const pageKey = usePageMemoryKey(), location = useLocation();
  useLayoutEffect(() => {
    const main = ref.current;
    if (!main) return;
    const applied = new WeakMap<HTMLElement, string>();
    const regions = () => [main, ...main.querySelectorAll<HTMLElement>('[data-scroll-region]')];
    const scrollSearch = new URLSearchParams(location.search); scrollSearch.delete('chartDetail');
    // Annual range changes share the same body position only in the financial chart.
    if (main.querySelector('[data-financial-chart]')) for (const key of ['centerYear','annualStart','endYear']) scrollSearch.delete(key);
    const scrollQuery = scrollSearch.toString();
    const keyFor = (element: HTMLElement) => pageKey + ':scroll:' + JSON.stringify([
      element.dataset.scrollRegion==='compound-left' ? new URLSearchParams([...new URLSearchParams(scrollQuery)].filter(([key])=>!['form','view','plan','goal'].includes(key))).toString() : element.dataset.scrollRegion==='compound-right' ? new URLSearchParams([...new URLSearchParams(scrollQuery)].filter(([key])=>!['form','view','plan','goal'].includes(key))).toString() : element.dataset.scrollRegion==='value-left' ? new URLSearchParams([...new URLSearchParams(scrollQuery)].filter(([key])=>key!=='selected' && key!=='view')).toString() : element.dataset.scrollRegion==='stock-left' ? new URLSearchParams([...new URLSearchParams(scrollQuery)].filter(([key])=>key!=='selected' && key!=='detailTab')).toString() : scrollQuery, element === main ? 'body' : element.dataset.scrollRegion,
      element.dataset.listCondition ?? main.querySelector<HTMLElement>('[data-list-condition]')?.dataset.listCondition ?? '',
    ]);
    const items = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>('[data-scroll-item]')].filter(item => {
      const parent = item.parentElement?.closest('[data-scroll-region]');
      return element === main ? !parent : parent === element;
    });
    const save = (element: HTMLElement) => {
      const key = keyFor(element);
      if (applied.get(element) !== key) return;
      const rows = items(element), edge = element.getBoundingClientRect().top;
      const anchor = rows.find(row => row.getBoundingClientRect().bottom > edge);
      writePageMemory<Position>(key, { top: element.scrollTop, left: element.scrollLeft,
        anchor: anchor?.dataset.scrollItem, offset: anchor ? anchor.getBoundingClientRect().top - edge : undefined,
        order: rows.map(row => row.dataset.scrollItem!),
      });
    };
    const restore = () => {
      for (const element of regions()) {
        const key = keyFor(element);
        if (applied.get(element) === key) continue;
        const saved = readPageMemory<Position>(key);
        const waiting = main.querySelector('[data-restoration-ready="false"]');
        if (waiting && saved && saved.top > 0) { element.style.visibility = 'hidden'; continue; }
        const rows = items(element), ids = rows.map(row => row.dataset.scrollItem);
        const nearest = nearestSavedItem(saved?.anchor, saved?.order ?? [], ids.filter((id): id is string => !!id));
        const anchor = rows.find(row => row.dataset.scrollItem === nearest);
        const top = saved && anchor && saved.offset !== undefined
          ? element.scrollTop + anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset : saved?.top ?? 0;
        element.scrollTop = Math.max(0, Math.min(top, element.scrollHeight - element.clientHeight));
        element.scrollLeft = saved?.left ?? 0;
        element.style.visibility = '';
        applied.set(element, key);
      }
    };
    const onScroll = (event: Event) => { if (event.target instanceof HTMLElement && regions().includes(event.target)) save(event.target); };
    const capture = () => regions().forEach(save);
    restore();
    // Mutation callbacks run before painting; asynchronously loaded lists remain hidden only until ready.
    const observer = new MutationObserver(restore);
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-list-condition', 'data-restoration-ready'] });
    main.addEventListener('scroll', onScroll, true);
    main.addEventListener('pointerdown', capture, true);
    main.addEventListener('keydown', capture, true);
    // Capture before React click handlers change the region's condition or route.
    main.addEventListener('click', capture, true);
    return () => { observer.disconnect(); main.removeEventListener('scroll', onScroll, true); main.removeEventListener('pointerdown', capture, true); main.removeEventListener('keydown', capture, true); main.removeEventListener('click', capture, true); regions().forEach(element => { element.style.visibility = ''; }); };
  }, [pageKey, location.search, ref]);
}
