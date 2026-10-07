import { detailSwipeDirection, detailSwipeSettings as settings } from '../utils/detailSwipe';
import { useRef, type TouchEvent, type MouseEvent } from 'react';

const controls = 'button:not([data-scroll-item]),a,svg[role="img"],[data-no-detail-swipe],input,select,textarea,[contenteditable="true"],[role="slider"],[role="tab"],canvas,[data-no-stock-swipe],[role="dialog"]';
type Gesture = { x: number; y: number; time: number; axis: 'pending' | 'horizontal' | 'vertical' };

/** Axis locks once; dragging a clickable card must not activate it on release. */
export function useDetailSwipe(move: (offset: number) => void, enabled = true) {
  const gesture = useRef<Gesture | null>(null);
  const suppressUntil = useRef(0);
  return {
    onTouchStartCapture(event: TouchEvent<HTMLElement>) {
      gesture.current = null;
      if (!enabled || event.touches.length !== 1 || !(event.target instanceof Element) ||
        !event.currentTarget.contains(event.target) || event.target.closest(controls)) return;
      suppressUntil.current = 0;
      if (event.touches[0].clientX < settings.backEdge) return; // Preserve the browser back edge.
      gesture.current = { time: Date.now(), x: event.touches[0].clientX, y: event.touches[0].clientY, axis: 'pending' };
    },
    onTouchMoveCapture(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start) return;
      if (event.touches.length !== 1) { gesture.current = null; return; }
      const dx = Math.abs(event.touches[0].clientX - start.x), dy = Math.abs(event.touches[0].clientY - start.y);
      if (Math.max(dx, dy) >= settings.lockDistance) suppressUntil.current = Date.now() + 700;
      if (start.axis === 'pending' && Math.max(dx, dy) >= settings.lockDistance) start.axis = dx >= dy * settings.axisRatio ? 'horizontal' : 'vertical';
    },
    onTouchEndCapture(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      gesture.current = null;
      if (!enabled || !start || start.axis === 'vertical' || !event.changedTouches.length || event.touches.length) return;
      const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < settings.lockDistance) return;
      suppressUntil.current = Date.now() + 700;
      const direction = detailSwipeDirection(dx, dy, Date.now() - start.time, start.axis);
      if (direction) move(direction);
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.target instanceof Node && event.currentTarget.contains(event.target) && Date.now() < suppressUntil.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
    },
    onTouchCancel() { gesture.current = null; },
  };
}
