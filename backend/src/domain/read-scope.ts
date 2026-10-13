import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<Map<string, Promise<unknown>>>();
export const withReadScope = <T>(run: () => T): T => scope.run(new Map(), run);

/** Share expensive reads within one batch only; transactions never use this scope. */
export function sharedRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const current = scope.getStore();
  if (!current) return read();
  const existing = current.get(key);
  if (existing) return existing as Promise<T>;
  const result = Promise.resolve().then(read);
  current.set(key, result);
  return result;
}
