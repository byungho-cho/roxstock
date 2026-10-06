import { useRef, type TouchEvent, type MouseEvent } from 'react';

const controls = 'input,select,textarea,[contenteditable="true"],[role="slider"],[role="tab"],canvas,[data-no-stock-swipe],[role="dialog"]';
type Gesture = { x: number; y: number; axis: 'pending' | 'horizontal' | 'vertical' };

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
      gesture.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, axis: 'pending' };
    },
    onTouchMoveCapture(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start) return;
      if (event.touches.length !== 1) { gesture.current = null; return; }
      const dx = Math.abs(event.touches[0].clientX - start.x), dy = Math.abs(event.touches[0].clientY - start.y);
      if (Math.max(dx, dy) >= 12) suppressUntil.current = Date.now() + 700;
      if (start.axis === 'pending' && Math.max(dx, dy) >= 12) start.axis = dx >= dy * 1.8 ? 'horizontal' : 'vertical';
    },
    onTouchEndCapture(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      gesture.current = null;
      if (!enabled || !start || start.axis !== 'horizontal' || !event.changedTouches.length || event.touches.length) return;
      suppressUntil.current = Date.now() + 700;
      const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) >= 70 && Math.abs(dx) >= Math.abs(dy) * 1.8 && Math.abs(dy) < 40) move(dx < 0 ? 1 : -1);
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.target instanceof Node && event.currentTarget.contains(event.target) && Date.now() < suppressUntil.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
    },
    onTouchCancel() { gesture.current = null; },
  };
}
