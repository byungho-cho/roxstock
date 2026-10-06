const positiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

const integerAtLeast = (value: string | undefined, fallback: number, minimum: number, name: string): number => {
  const parsed = positiveInteger(value, fallback, name);
  if (parsed < minimum) throw new Error(`${name} must be at least ${minimum}`);
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

const clockTime = (value: string | undefined, fallback: string, name: string): string => {
  const selected = value === undefined || value === '' ? fallback : value;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(selected)) throw new Error(`${name} must use HH:mm`);
  return selected;
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
  realtimeEnabled: boolean;
  realtimeIntervalSeconds: number;
  realtimeDbFlushSeconds: number;
  realtimeTargetRefreshSeconds: number;
  realtimeStaleBackoffSeconds: number;
  realtimeMaxSecurities: number;
  realtimeConcurrency: number;
  realtimePreMarketOpen: string;
  realtimePreMarketClose: string;
  realtimeRegularMarketOpen: string;
  realtimeRegularMarketClose: string;
  realtimeAfterMarketOpen: string;
  realtimeAfterMarketClose: string;
  realtimeApiUrl: string;
  realtimeInternalToken: string;
  dartEnabled: boolean;
  dartDailyCallLimit: number;
  dartBackfillDailyCallLimit: number;
  dartBackfillMinDelayMs: number;
  dartRestDayAllDay: boolean;
  dartMinDelayMs: number;
  dartBackfillStartYear: number;
  dartBackfillCompanyLimit: number;
  dartUniverseBatchSize: number;
  dartWindowStartHour: number;
  dartWindowEndHour: number;
  dartCorpRefreshHours: number;
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

  const dartDailyCallLimit = positiveInteger(process.env.DART_DAILY_CALL_LIMIT, 3000, 'DART_DAILY_CALL_LIMIT');
  if (dartDailyCallLimit > 3000) throw new Error('DART_DAILY_CALL_LIMIT cannot exceed 3000');
  const dartBackfillStartYear = positiveInteger(process.env.DART_BACKFILL_START_YEAR, 2015, 'DART_BACKFILL_START_YEAR');
  if (dartBackfillStartYear !== 2015) throw new Error('DART_BACKFILL_START_YEAR must remain 2015');
  const dartBackfillCompanyLimit = positiveInteger(process.env.DART_BACKFILL_COMPANY_LIMIT, 250, 'DART_BACKFILL_COMPANY_LIMIT');
  if (dartBackfillCompanyLimit > 500) throw new Error('DART_BACKFILL_COMPANY_LIMIT cannot exceed 500');

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
    realtimeEnabled: boolean(process.env.COLLECTOR_REALTIME_ENABLED, true, 'COLLECTOR_REALTIME_ENABLED'),
    realtimeIntervalSeconds: integerAtLeast(process.env.COLLECTOR_REALTIME_INTERVAL_SECONDS, 60, 5, 'COLLECTOR_REALTIME_INTERVAL_SECONDS'),
    realtimeDbFlushSeconds: positiveInteger(process.env.COLLECTOR_REALTIME_DB_FLUSH_SECONDS, 60, 'COLLECTOR_REALTIME_DB_FLUSH_SECONDS'),
    realtimeTargetRefreshSeconds: positiveInteger(process.env.COLLECTOR_REALTIME_TARGET_REFRESH_SECONDS, 30, 'COLLECTOR_REALTIME_TARGET_REFRESH_SECONDS'),
    realtimeStaleBackoffSeconds: positiveInteger(process.env.COLLECTOR_REALTIME_STALE_BACKOFF_SECONDS, 300, 'COLLECTOR_REALTIME_STALE_BACKOFF_SECONDS'),
    realtimeMaxSecurities: positiveInteger(process.env.COLLECTOR_REALTIME_MAX_SECURITIES, 100, 'COLLECTOR_REALTIME_MAX_SECURITIES'),
    realtimeConcurrency: positiveInteger(process.env.COLLECTOR_REALTIME_CONCURRENCY, 5, 'COLLECTOR_REALTIME_CONCURRENCY'),
    realtimePreMarketOpen: clockTime(process.env.COLLECTOR_REALTIME_PRE_MARKET_OPEN, '08:00', 'COLLECTOR_REALTIME_PRE_MARKET_OPEN'),
    realtimePreMarketClose: clockTime(process.env.COLLECTOR_REALTIME_PRE_MARKET_CLOSE, '08:50', 'COLLECTOR_REALTIME_PRE_MARKET_CLOSE'),
    realtimeRegularMarketOpen: clockTime(process.env.COLLECTOR_REALTIME_REGULAR_MARKET_OPEN, '09:00', 'COLLECTOR_REALTIME_REGULAR_MARKET_OPEN'),
    realtimeRegularMarketClose: clockTime(process.env.COLLECTOR_REALTIME_REGULAR_MARKET_CLOSE, '15:30', 'COLLECTOR_REALTIME_REGULAR_MARKET_CLOSE'),
    realtimeAfterMarketOpen: clockTime(process.env.COLLECTOR_REALTIME_AFTER_MARKET_OPEN, '15:40', 'COLLECTOR_REALTIME_AFTER_MARKET_OPEN'),
    realtimeAfterMarketClose: clockTime(process.env.COLLECTOR_REALTIME_AFTER_MARKET_CLOSE, '20:00', 'COLLECTOR_REALTIME_AFTER_MARKET_CLOSE'),
    realtimeApiUrl: (process.env.COLLECTOR_REALTIME_API_URL ?? 'http://backend:3300/internal/realtime-prices').trim(),
    realtimeInternalToken: (process.env.COLLECTOR_INTERNAL_TOKEN ?? '').trim(),
    dartEnabled: boolean(process.env.DART_COLLECTOR_ENABLED, true, 'DART_COLLECTOR_ENABLED'),
    dartDailyCallLimit,
    dartBackfillDailyCallLimit: Math.min(10000, positiveInteger(process.env.DART_BACKFILL_DAILY_CALL_LIMIT, 10000, 'DART_BACKFILL_DAILY_CALL_LIMIT')),
    dartBackfillMinDelayMs: integerAtLeast(process.env.DART_BACKFILL_MIN_DELAY_MS, 2000, 2000, 'DART_BACKFILL_MIN_DELAY_MS'),
    dartRestDayAllDay: boolean(process.env.DART_REST_DAY_ALL_DAY, true, 'DART_REST_DAY_ALL_DAY'),
    dartMinDelayMs: integerAtLeast(process.env.DART_MIN_DELAY_MS, 5000, 5000, 'DART_MIN_DELAY_MS'),
    dartBackfillStartYear,
    dartBackfillCompanyLimit,
    dartUniverseBatchSize: positiveInteger(process.env.DART_UNIVERSE_DAILY_COMPANIES, 35, 'DART_UNIVERSE_DAILY_COMPANIES'),
    dartWindowStartHour: hour(process.env.DART_NIGHT_WINDOW_START_HOUR, 18, 'DART_NIGHT_WINDOW_START_HOUR'),
    dartWindowEndHour: hour(process.env.DART_NIGHT_WINDOW_END_HOUR, 6, 'DART_NIGHT_WINDOW_END_HOUR'),
    dartCorpRefreshHours: positiveInteger(process.env.DART_CORP_CODE_REFRESH_HOURS, 24, 'DART_CORP_CODE_REFRESH_HOURS'),
  };
};

