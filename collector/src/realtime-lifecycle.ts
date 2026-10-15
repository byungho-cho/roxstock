import { collectorLog as log } from '@roxstock/shared/collection/logger';

export class RealtimeLockLostError extends Error {
  constructor() { super('LOCK_LOST'); this.name = 'RealtimeLockLostError'; }
}
export const safeErrorCode = (error: unknown): string => {
  if (error instanceof RealtimeLockLostError) return 'LOCK_LOST';
  const value = error as { code?: unknown; message?: unknown } | null;
  if (typeof value?.message === 'string' && /\b1020\b/.test(value.message)) return 'DB_1020';
  if (typeof value?.message === 'string' && /\b1213\b|deadlock/i.test(value.message)) return 'DB_DEADLOCK';
  return typeof value?.code === 'string' && /^P\d{4}$/.test(value.code) ? value.code : 'UNKNOWN';
};
export const createSerialExecutor = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
};
export const retryConflict = async <T>(operation: () => Promise<T>): Promise<T> => {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const code = safeErrorCode(error);
      log('warn', 'realtime DB operation failed', { code, attempt, durationMs: Date.now() - started });
      if (!['DB_1020', 'DB_DEADLOCK', 'P2034'].includes(code) || attempt >= 3 || Date.now() - started > 15_000) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt + Math.floor(Math.random() * 50)));
    }
  }
};
