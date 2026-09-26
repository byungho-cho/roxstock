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
    content.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const frame = requestAnimationFrame(update);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      content.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, [update, pathname]);

  const top = (hasHeader ? pageMetrics.headerHeight : 0) + inset;
  const bottom = (hasBottomNav ? pageMetrics.headerHeight : 0) + inset;
  const trackHeight = Math.max(0, size.windowHeight - top - bottom);
  const maxScroll = Math.max(0, size.page - size.viewport);
  if (maxScroll <= 1 || trackHeight <= minThumbHeight) return null;

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
    if (step) { event.preventDefault(); scrollRef.current?.scrollBy({ top: step }); }
  };

  return <Box role="scrollbar" aria-label="콘텐츠 스크롤" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(maxScroll)} aria-valuenow={Math.round(size.top)} tabIndex={0}
    onPointerDown={handlePointerDown} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrollToPointer(event.clientY); }} onKeyDown={handleKeyDown}
    sx={{ position: 'fixed', top, bottom, right: 2, width: 10, zIndex: 11, cursor: 'pointer', touchAction: 'none', '&:focus-visible': { outline: 'none' }, '&:focus-visible > div': { bgcolor: colors.focus, opacity: 1 } }}>
    <Box sx={{ position: 'absolute', right: 3, top: thumbTop, width: 4, height: thumbHeight, borderRadius: 2, bgcolor: colors.textMuted, opacity: 0.65, pointerEvents: 'none' }} />
  </Box>;
}
