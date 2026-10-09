import { useEffect, useRef } from 'react';

const marker = 'roxPopup';
type Entry = { id: string; close: () => void; pending?: () => void };
const stack: Entry[] = [];
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  // Capture before React Router: a popup entry is not a page navigation.
  window.addEventListener('popstate', event => {
    const top = stack.at(-1);
    if (!top || event.state?.[marker] === top.id) return;
    event.stopImmediatePropagation();
    stack.pop();
    top.close();
    top.pending?.();
  }, true);
}

/** Only for local-state popups. URL-driven overlays already own a history entry. */
export function usePopupHistory(open: boolean, onClose: () => void) {
  const callback = useRef(onClose); callback.current = onClose;
  const entry = useRef<Entry | null>(null);
  const mounted = useRef(false);
  const consume = () => new Promise<void>(resolve => {
    const current = entry.current;
    if (!current || !stack.includes(current)) { resolve(); return; }
    if (current.pending) {
      const previous = current.pending;
      current.pending = () => { previous(); resolve(); };
      return;
    }
    if (window.history.state?.[marker] === current.id) {
      current.pending = resolve;
      window.history.back();
    } else {
      stack.splice(stack.indexOf(current), 1); callback.current(); resolve();
    }
  });
  useEffect(() => {
    if (!open) { if (entry.current && stack.includes(entry.current)) void consume(); return; }
    install();
    if (!entry.current || !stack.includes(entry.current)) {
      const current: Entry = { id: crypto.randomUUID(), close: () => callback.current() };
      entry.current = current; stack.push(current);
      window.history.pushState({ ...window.history.state, [marker]: current.id }, '', window.location.href);
    }
  }, [open]);
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    const current = entry.current;
    // StrictMode remounts synchronously; keep its entry instead of pushing twice.
    queueMicrotask(() => {
      if (!mounted.current && current && stack.includes(current)) void consume();
    });
  }; }, []);
  return consume;
}
