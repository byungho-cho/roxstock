import { useRef, type MouseEvent, type PointerEvent, type KeyboardEvent } from 'react';
// A scroll/drag, selected text, or nested control must never activate the card.
export function useCardNavigation(activate: () => void) {
  const gesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const control = (target: EventTarget | null) => target instanceof Element && !!target.closest('button,a,input,select,textarea,[role="button"]');
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => { gesture.current = { x: event.clientX, y: event.clientY, dragged: false }; },
    onPointerMove: (event: PointerEvent<HTMLElement>) => { const start = gesture.current; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) start.dragged = true; },
    onPointerCancel: () => { if (gesture.current) gesture.current.dragged = true; },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (control(event.target) || gesture.current?.dragged || window.getSelection()?.toString()) return;
      activate();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); activate(); }
    },
  };
}
