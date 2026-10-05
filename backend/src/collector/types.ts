export type CollectorRunStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
export type CollectorItemStatus = 'SUCCESS' | 'FAILED' | 'STALE' | 'SKIPPED';

export interface SecurityTarget {
  id: bigint;
  symbol: string;
  name: string;
}

export type SupportedMarketType = 'KOSPI' | 'KOSDAQ';

export interface SecurityMasterItem {
  symbol: string;
  name: string;
  marketType: SupportedMarketType;
}

export interface SecurityMasterBatch {
  baseDate: string;
  items: SecurityMasterItem[];
}

export interface SecurityMasterProvider {
  readonly name: string;
  fetchLatest(): Promise<SecurityMasterBatch>;
}

export interface PriceObservation {
  symbol: string;
  currentPrice: string;
  previousClosePrice: string | null;
  observedAt: Date;
  marketStatus: string;
  freshness: 'CURRENT' | 'STALE';
  freshnessReason?: string;
}

export interface RealtimePriceValue extends PriceObservation {
  securityId: bigint;
  name: string;
}

export interface PriceProvider {
  readonly name: string;
  fetchPrice(security: SecurityTarget): Promise<PriceObservation>;
}

export interface RunCounters {
  success: number;
  failed: number;
  stale: number;
  skipped: number;
}

export interface RunItemInput {
  securityId?: bigint;
  symbol: string;
  status: CollectorItemStatus;
  message?: string;
  observedAt?: Date;
}

export interface SnapshotLot {
  symbol: string;
  quantity: string;
  soldQuantity: string;
  currentPrice: string | null;
}

export interface SnapshotAccount {
  id: bigint;
  name: string;
  cashBalance: string;
  lots: SnapshotLot[];
}

export interface SnapshotValue {
  cashBalance: string;
  stockValue: string;
  totalAssetValue: string;
}

export interface CollectorRepository {
  acquireLock(jobName: string, ownerToken: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(jobName: string, ownerToken: string): Promise<void>;
  createRun(jobType: string, provider: string, metadata?: Record<string, unknown>): Promise<bigint>;
  finishRun(runId: bigint, status: CollectorRunStatus, counters: RunCounters, failureReason?: string): Promise<void>;
  addRunItem(runId: bigint, item: RunItemInput): Promise<void>;
  hasCompletedScheduledPriceRun(scheduleDate: string): Promise<boolean>;
  listActiveSecurities(): Promise<SecurityTarget[]>;
  listRealtimeSecurities(limit: number): Promise<SecurityTarget[]>;
  upsertSecurityMaster(items: SecurityMasterItem[]): Promise<void>;
  deactivateMissingSecurities(items: SecurityMasterItem[]): Promise<number>;
  upsertMarketPrice(securityId: bigint, observation: PriceObservation): Promise<void>;
  upsertRealtimeMarketPrices(values: RealtimePriceValue[]): Promise<number>;
  listActiveAccountsForSnapshot(): Promise<SnapshotAccount[]>;
  upsertDailyAccountSnapshot(accountId: bigint, snapshotDate: Date, value: SnapshotValue): Promise<void>;
}

export const emptyCounters = (): RunCounters => ({ success: 0, failed: 0, stale: 0, skipped: 0 });
