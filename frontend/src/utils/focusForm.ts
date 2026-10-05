import { flushSync } from 'react-dom';
import type { NavigateFunction } from 'react-router-dom';

// Keep navigation and focus inside the same tap so mobile keyboards can open.
export function navigateToForm(navigate: NavigateFunction, path: string) {
  flushSync(() => navigate(path));
  document.querySelector<HTMLInputElement>('[data-initial-focus="true"]')?.focus({ preventScroll: true });
}
