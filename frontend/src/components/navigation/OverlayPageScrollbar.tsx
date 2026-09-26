import { Box } from '@mui/material';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { colors, pageMetrics } from '../../styles/tokens';

const inset = 4;
const minThumbHeight = 28;

export function OverlayPageScrollbar({ hasBottomNav }: { hasBottomNav: boolean }) {
  const { pathname } = useLocation();
  const [size, setSize] = useState({ top: 0, page: 0, viewport: 0 });
  const dragOffset = useRef(0);
  const update = useCallback(() => {
    const page = document.scrollingElement ?? document.documentElement;
    setSize({ top: page.scrollTop, page: page.scrollHeight, viewport: window.innerHeight });
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const frame = requestAnimationFrame(update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    };
  }, [update, pathname]);

  const bottom = (hasBottomNav ? pageMetrics.headerHeight : 0) + inset;
  const trackHeight = Math.max(0, size.viewport - inset - bottom);
  const maxScroll = Math.max(0, size.page - size.viewport);
  if (maxScroll <= 1 || trackHeight <= minThumbHeight) return null;

  const thumbHeight = Math.min(trackHeight, Math.max(minThumbHeight, trackHeight * size.viewport / size.page));
  const thumbTravel = trackHeight - thumbHeight;
  const thumbTop = thumbTravel * Math.min(size.top / maxScroll, 1);
  const scrollToPointer = (clientY: number) => {
    const position = Math.max(0, Math.min(thumbTravel, clientY - inset - dragOffset.current));
    window.scrollTo(0, position / thumbTravel * maxScroll);
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const thumbStart = inset + thumbTop;
    dragOffset.current = event.clientY >= thumbStart && event.clientY <= thumbStart + thumbHeight
      ? event.clientY - thumbStart : thumbHeight / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollToPointer(event.clientY);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40
      : event.key === 'PageDown' ? size.viewport : event.key === 'PageUp' ? -size.viewport
        : event.key === 'Home' ? -size.page : event.key === 'End' ? size.page : 0;
    if (step) { event.preventDefault(); window.scrollBy(0, step); }
  };

  return <Box role="scrollbar" aria-label="페이지 스크롤" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(maxScroll)} aria-valuenow={Math.round(size.top)} tabIndex={0}
    onPointerDown={handlePointerDown} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrollToPointer(event.clientY); }} onKeyDown={handleKeyDown}
    sx={{ position: 'fixed', top: inset, bottom, right: 2, width: 10, zIndex: 11, cursor: 'pointer', touchAction: 'none', '&:focus-visible': { outline: 'none' }, '&:focus-visible > div': { bgcolor: colors.focus, opacity: 1 } }}>
    <Box sx={{ position: 'absolute', right: 3, top: thumbTop, width: 4, height: thumbHeight, borderRadius: 2, bgcolor: colors.textMuted, opacity: 0.65, pointerEvents: 'none' }} />
  </Box>;
}
