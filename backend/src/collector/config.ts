const positiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

const hour = (value: string | undefined, fallback: number, name: string): number => {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) throw new Error(`${name} must be between 0 and 23`);
  return parsed;
};

export interface CollectorConfig {
  provider: 'naver' | 'mock';
  priceIntervalMinutes: number;
  providerDelayMs: number;
  requestTimeoutMs: number;
  priceWindowStartHour: number;
  priceWindowEndHour: number;
  snapshotHours: number[];
  lockTtlSeconds: number;
  schedulerTickSeconds: number;
}

export const loadCollectorConfig = (): CollectorConfig => {
  const provider = (process.env.COLLECTOR_PRICE_PROVIDER ?? 'naver').toLowerCase();
  if (provider !== 'naver' && provider !== 'mock') throw new Error('COLLECTOR_PRICE_PROVIDER must be naver or mock');

  const snapshotHours = (process.env.COLLECTOR_SNAPSHOT_HOURS ?? '20,21,22,23')
    .split(',')
    .map((value) => Number(value.trim()));
  if (snapshotHours.some((value) => !Number.isInteger(value) || value < 0 || value > 23)) {
    throw new Error('COLLECTOR_SNAPSHOT_HOURS must contain comma-separated hours from 0 to 23');
  }

  return {
    provider,
    priceIntervalMinutes: positiveInteger(process.env.COLLECTOR_PRICE_INTERVAL_MINUTES, 60, 'COLLECTOR_PRICE_INTERVAL_MINUTES'),
    providerDelayMs: positiveInteger(process.env.COLLECTOR_PROVIDER_DELAY_MS, 1000, 'COLLECTOR_PROVIDER_DELAY_MS'),
    requestTimeoutMs: positiveInteger(process.env.COLLECTOR_REQUEST_TIMEOUT_MS, 10000, 'COLLECTOR_REQUEST_TIMEOUT_MS'),
    priceWindowStartHour: hour(process.env.COLLECTOR_PRICE_WINDOW_START_HOUR, 20, 'COLLECTOR_PRICE_WINDOW_START_HOUR'),
    priceWindowEndHour: hour(process.env.COLLECTOR_PRICE_WINDOW_END_HOUR, 6, 'COLLECTOR_PRICE_WINDOW_END_HOUR'),
    snapshotHours: [...new Set(snapshotHours)],
    lockTtlSeconds: positiveInteger(process.env.COLLECTOR_LOCK_TTL_SECONDS, 1800, 'COLLECTOR_LOCK_TTL_SECONDS'),
    schedulerTickSeconds: positiveInteger(process.env.COLLECTOR_SCHEDULER_TICK_SECONDS, 30, 'COLLECTOR_SCHEDULER_TICK_SECONDS'),
  };
};
