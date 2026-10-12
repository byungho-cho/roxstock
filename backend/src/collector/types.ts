export type CollectorRunStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
export type CollectorItemStatus = 'SUCCESS' | 'FAILED' | 'STALE' | 'SKIPPED';

export interface SecurityTarget {
  id: bigint;
  symbol: string;
  name: string;
  collectionRevision?: number;
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
  collectionRevision?: number;
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
  unitPrice: string;
  currentPrice: string | null;
}

export interface SnapshotAccount {
  id: bigint;
  name: string;
  cashBalance: string | null;
  lots: SnapshotLot[];
}

export interface SnapshotValue {
  investmentAmount: string;
  cashBalance: string;
  stockValue: string;
  totalAssetValue: string;
}

export interface CollectorRepository {
  withTarget?<T>(target: SecurityTarget, feature: import('./collection-policy.js').CollectionFeature, work:()=>Promise<T>):Promise<T>;
  acquireLock(jobName: string, ownerToken: string, ttlSeconds: number): Promise<boolean>;
  renewLock?(jobName: string, ownerToken: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(jobName: string, ownerToken: string): Promise<void>;
  createRun(jobType: string, provider: string, metadata?: Record<string, unknown>): Promise<bigint>;
  finishRun(runId: bigint, status: CollectorRunStatus, counters: RunCounters, failureReason?: string): Promise<void>;
  addRunItems?(runId:bigint,items:RunItemInput[]):Promise<void>;
  addRunItem(runId: bigint, item: RunItemInput): Promise<void>;
  hasCompletedScheduledPriceRun(scheduleDate: string): Promise<boolean>;
  listPriceTargets?(): Promise<SecurityTarget[]>;
  listActiveSecurities(): Promise<SecurityTarget[]>;
  listRealtimeSecurities(limit: number): Promise<SecurityTarget[]>;
  upsertSecurityMaster(items: SecurityMasterItem[]): Promise<void|RunItemInput[]>;
  deactivateMissingSecurities(items: SecurityMasterItem[]): Promise<number>;
  upsertMarketPrice(securityId: bigint, observation: PriceObservation): Promise<void>;
  upsertRealtimeMarketPrices(values: RealtimePriceValue[]): Promise<number>;
  listActiveAccountsForSnapshot(): Promise<SnapshotAccount[]>;
  upsertDailyAccountSnapshot(accountId: bigint, snapshotDate: Date, value: SnapshotValue): Promise<void>;
}

export const emptyCounters = (): RunCounters => ({ success: 0, failed: 0, stale: 0, skipped: 0 });
