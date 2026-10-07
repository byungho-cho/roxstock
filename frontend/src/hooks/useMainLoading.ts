import { useEffect, useSyncExternalStore } from 'react';
const requests = new Set<symbol>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export function useMainLoading(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const id = Symbol(); requests.add(id); emit();
    return () => { requests.delete(id); emit(); };
  }, [active]);
}
export function useManualLoadingCount() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => requests.size);
}
