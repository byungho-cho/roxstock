import { useRef, type TouchEvent } from 'react';

const controls = 'button,a,input,select,textarea,[role="button"],[role="slider"],[role="tab"],canvas,svg,[data-no-stock-swipe]';
type Gesture = { x: number; y: number; axis: 'pending' | 'horizontal' | 'vertical' };

/** A gesture that becomes vertical never becomes a stock navigation gesture. */
export function useDetailSwipe(move: (offset: number) => void, enabled = true) {
  const gesture = useRef<Gesture | null>(null);
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      gesture.current = null;
      if (!enabled || event.touches.length !== 1 || !(event.target instanceof Element) || event.target.closest(controls)) return;
      gesture.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, axis: 'pending' };
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start) return;
      if (event.touches.length !== 1) { gesture.current = null; return; }
      const dx = Math.abs(event.touches[0].clientX - start.x), dy = Math.abs(event.touches[0].clientY - start.y);
      if (start.axis === 'pending' && Math.max(dx, dy) >= 12) start.axis = dx >= dy * 1.8 ? 'horizontal' : 'vertical';
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      gesture.current = null;
      if (!enabled || !start || start.axis !== 'horizontal' || !event.changedTouches.length || event.touches.length) return;
      const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) >= 70 && Math.abs(dx) >= Math.abs(dy) * 1.8 && Math.abs(dy) < 40) move(dx < 0 ? 1 : -1);
    },
    onTouchCancel() { gesture.current = null; },
  };
}
