// Session-only UI state. Account + history entry + route keep independent lists apart.
const memory = new Map<string, unknown>();
const prefix = 'roxstock:page-memory-v1:';
export function readPageMemory<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  try { const raw = sessionStorage.getItem(prefix + key); if (raw) { const value = JSON.parse(raw) as T; memory.set(key, value); return value; } } catch { /* In-memory restoration remains available. */ }
}
export function writePageMemory<T>(key: string, value: T) {
  memory.set(key, value);
  try { sessionStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}
export function nearestSavedItem(anchor: string | undefined, order: string[], available: string[]) {
  if (!anchor) return undefined;
  if (available.includes(anchor)) return anchor;
  const index = order.indexOf(anchor);
  if (index < 0) return undefined;
  return order.slice(index).find(id => available.includes(id)) ?? order.slice(0, index).reverse().find(id => available.includes(id));
}
