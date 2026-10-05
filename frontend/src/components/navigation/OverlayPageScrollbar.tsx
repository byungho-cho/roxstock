import { Box } from '@mui/material';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { colors, pageMetrics } from '../../styles/tokens';

const inset = 4;
const minThumbHeight = 28;

type ScrollbarProps = {
  scrollRef: RefObject<HTMLElement | null>;
  hasHeader: boolean;
  hasBottomNav: boolean;
};

export function OverlayPageScrollbar({ scrollRef, hasHeader, hasBottomNav }: ScrollbarProps) {
  const { pathname } = useLocation();
  const [size, setSize] = useState({ top: 0, page: 0, viewport: 0, windowHeight: 0 });
  const dragOffset = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const reveal = useCallback(() => {
    clearTimeout(hideTimer.current);
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), 1000);
  }, []);
  const update = useCallback(() => {
    const content = scrollRef.current;
    if (!content) return;
    const next = {
      top: content.scrollTop,
      page: content.scrollHeight,
      viewport: content.clientHeight,
      windowHeight: window.innerHeight,
    };
    setSize((previous) => Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  }, [scrollRef]);

  useEffect(() => {
    const content = scrollRef.current;
    if (!content) return;
    const observer = new ResizeObserver(update);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    const mutations = new MutationObserver(update);
    mutations.observe(content, { childList: true, subtree: true });
    const onScroll = () => { update(); reveal(); };
    content.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    const frame = requestAnimationFrame(update);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      content.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, [update, reveal, pathname]);

  const top = (hasHeader ? pageMetrics.headerHeight : 0) + inset;
  const bottom = (hasBottomNav ? pageMetrics.headerHeight : 0) + inset;
  const trackHeight = Math.max(0, size.windowHeight - top - bottom);
  const maxScroll = Math.max(0, size.page - size.viewport);
  const scrollable = maxScroll > 1 && trackHeight > minThumbHeight;
  useEffect(() => {
    if (scrollable) reveal();
    else setVisible(false);
    return () => clearTimeout(hideTimer.current);
  }, [scrollable, pathname, reveal]);
  if (!scrollable) return null;

  const effectiveViewport = size.viewport - (hasHeader && size.windowHeight - size.viewport < pageMetrics.headerHeight ? pageMetrics.headerHeight : 0);
  const thumbHeight = Math.min(trackHeight, Math.max(minThumbHeight, trackHeight * effectiveViewport / (effectiveViewport + maxScroll)));
  const thumbTravel = trackHeight - thumbHeight;
  const thumbTop = thumbTravel * Math.min(size.top / maxScroll, 1);
  const scrollToPointer = (clientY: number) => {
    if (!thumbTravel) return;
    const position = Math.max(0, Math.min(thumbTravel, clientY - top - dragOffset.current));
    scrollRef.current?.scrollTo({ top: position / thumbTravel * maxScroll });
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    reveal();
    const thumbStart = top + thumbTop;
    dragOffset.current = event.clientY >= thumbStart && event.clientY <= thumbStart + thumbHeight
      ? event.clientY - thumbStart : thumbHeight / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollToPointer(event.clientY);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40
      : event.key === 'PageDown' ? size.viewport : event.key === 'PageUp' ? -size.viewport
        : event.key === 'Home' ? -size.page : event.key === 'End' ? size.page : 0;
    if (step) { event.preventDefault(); reveal(); scrollRef.current?.scrollBy({ top: step }); }
  };

  return <Box role="scrollbar" aria-label="콘텐츠 스크롤" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(maxScroll)} aria-valuenow={Math.round(size.top)} tabIndex={0}
    onFocus={reveal} onPointerDown={handlePointerDown} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { reveal(); scrollToPointer(event.clientY); } }} onKeyDown={handleKeyDown}
    sx={{ position: 'fixed', top, bottom, right: 0, width: 4, zIndex: 11, cursor: 'pointer', touchAction: 'none', opacity: visible ? 1 : 0, transition: visible ? 'none' : 'opacity 200ms ease', pointerEvents: visible ? 'auto' : 'none', '@media (prefers-reduced-motion: reduce)': { transition: 'none' }, '&:focus-visible': { outline: 'none' }, '&:focus-visible > div': { bgcolor: colors.focus, opacity: 1 } }}>
    <Box sx={{ position: 'absolute', right: 0, top: thumbTop, width: 4, height: thumbHeight, borderRadius: 2, bgcolor: colors.textMuted, opacity: 0.65, pointerEvents: 'none' }} />
  </Box>;
}
