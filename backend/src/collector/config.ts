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

const boolean = (value: string | undefined, fallback: boolean, name: string): boolean => {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
};

export interface CollectorConfig {
  provider: 'naver' | 'mock';
  providerDelayMs: number;
  requestTimeoutMs: number;
  priceCollectionHour: number;
  priceRetryDelayMinutes: number;
  snapshotHours: number[];
  lockTtlSeconds: number;
  schedulerTickSeconds: number;
  securityMasterHour: number;
  securityMasterEndpoint: string;
  securityMasterPageSize: number;
  securityMasterLookbackDays: number;
  securityMasterMinimumCount: number;
  securityMasterDeactivateMissing: boolean;
}

export const loadCollectorConfig = (): CollectorConfig => {
  const provider = (process.env.COLLECTOR_PRICE_PROVIDER ?? 'naver').toLowerCase();
  if (provider !== 'naver' && provider !== 'mock') throw new Error('COLLECTOR_PRICE_PROVIDER must be naver or mock');

  const snapshotHours = (process.env.COLLECTOR_SNAPSHOT_HOURS ?? '23')
    .split(',')
    .map((value) => Number(value.trim()));
  if (snapshotHours.some((value) => !Number.isInteger(value) || value < 0 || value > 23)) {
    throw new Error('COLLECTOR_SNAPSHOT_HOURS must contain comma-separated hours from 0 to 23');
  }

  return {
    provider,
    providerDelayMs: positiveInteger(process.env.COLLECTOR_PROVIDER_DELAY_MS, 1000, 'COLLECTOR_PROVIDER_DELAY_MS'),
    requestTimeoutMs: positiveInteger(process.env.COLLECTOR_REQUEST_TIMEOUT_MS, 10000, 'COLLECTOR_REQUEST_TIMEOUT_MS'),
    priceCollectionHour: hour(process.env.COLLECTOR_PRICE_COLLECTION_HOUR, 20, 'COLLECTOR_PRICE_COLLECTION_HOUR'),
    priceRetryDelayMinutes: positiveInteger(process.env.COLLECTOR_PRICE_RETRY_DELAY_MINUTES, 60, 'COLLECTOR_PRICE_RETRY_DELAY_MINUTES'),
    snapshotHours: [...new Set(snapshotHours)],
    lockTtlSeconds: positiveInteger(process.env.COLLECTOR_LOCK_TTL_SECONDS, 7200, 'COLLECTOR_LOCK_TTL_SECONDS'),
    schedulerTickSeconds: positiveInteger(process.env.COLLECTOR_SCHEDULER_TICK_SECONDS, 30, 'COLLECTOR_SCHEDULER_TICK_SECONDS'),
    securityMasterHour: hour(process.env.COLLECTOR_SECURITY_MASTER_HOUR, 7, 'COLLECTOR_SECURITY_MASTER_HOUR'),
    securityMasterEndpoint: process.env.DATA_GO_KR_KRX_LISTED_ENDPOINT
      ?? process.env.DATA_GO_KR_STOCK_PRICE_ENDPOINT
      ?? 'https://apis.data.go.kr/1160100/GetKrxListedInfoService_V2/getItemInfo_V2',
    securityMasterPageSize: positiveInteger(process.env.COLLECTOR_SECURITY_MASTER_PAGE_SIZE, 1000, 'COLLECTOR_SECURITY_MASTER_PAGE_SIZE'),
    securityMasterLookbackDays: positiveInteger(process.env.COLLECTOR_SECURITY_MASTER_LOOKBACK_DAYS, 14, 'COLLECTOR_SECURITY_MASTER_LOOKBACK_DAYS'),
    securityMasterMinimumCount: positiveInteger(process.env.COLLECTOR_SECURITY_MASTER_MINIMUM_COUNT, 2000, 'COLLECTOR_SECURITY_MASTER_MINIMUM_COUNT'),
    securityMasterDeactivateMissing: boolean(process.env.COLLECTOR_SECURITY_MASTER_DEACTIVATE_MISSING, false, 'COLLECTOR_SECURITY_MASTER_DEACTIVATE_MISSING'),
  };
};
