import { Prisma, PrismaClient } from '../generated/prisma/index.js';
import type {
  CollectorRepository,
  CollectorRunStatus,
  PriceObservation,
  RunCounters,
  RunItemInput,
  SecurityMasterItem,
  SecurityTarget,
  SnapshotAccount,
  SnapshotValue,
} from './types.js';

const json = (value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined =>
  value as Prisma.InputJsonValue | undefined;

export class PrismaCollectorRepository implements CollectorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async acquireLock(jobName: string, ownerToken: string, ttlSeconds: number): Promise<boolean> {
    const changed = await this.prisma.$executeRaw`
      INSERT INTO collector_locks (job_name, owner_token, locked_until, created_at, updated_at)
      VALUES (${jobName}, ${ownerToken}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${ttlSeconds} SECOND), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        owner_token = IF(locked_until < UTC_TIMESTAMP(3), VALUES(owner_token), owner_token),
        locked_until = IF(locked_until < UTC_TIMESTAMP(3), VALUES(locked_until), locked_until),
        updated_at = IF(locked_until < UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), updated_at)
    `;
    if (changed === 0) return false;
    const rows = await this.prisma.$queryRaw<Array<{ owner_token: string }>>`
      SELECT owner_token FROM collector_locks WHERE job_name = ${jobName}
    `;
    return rows[0]?.owner_token === ownerToken;
  }

  async releaseLock(jobName: string, ownerToken: string): Promise<void> {
    await this.prisma.collectorLock.deleteMany({ where: { jobName, ownerToken } });
  }

  async createRun(jobType: string, provider: string, metadata?: Record<string, unknown>): Promise<bigint> {
    const run = await this.prisma.collectorRun.create({
      data: { jobType, provider, status: 'RUNNING', metadata: json(metadata) },
      select: { id: true },
    });
    return run.id;
  }

  async finishRun(runId: bigint, status: CollectorRunStatus, counters: RunCounters, failureReason?: string): Promise<void> {
    await this.prisma.collectorRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: new Date(),
        successCount: counters.success,
        failureCount: counters.failed,
        staleCount: counters.stale,
        skippedCount: counters.skipped,
        failureReason,
      },
    });
  }

  async addRunItem(runId: bigint, item: RunItemInput): Promise<void> {
    await this.prisma.collectorRunItem.create({ data: { runId, ...item } });
  }

  async listActiveSecurities(): Promise<SecurityTarget[]> {
    return this.prisma.security.findMany({
      where: { isActive: true },
      select: { id: true, symbol: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  async upsertSecurityMaster(items: SecurityMasterItem[]): Promise<void> {
    for (const item of items) {
      await this.prisma.security.upsert({
        where: { marketType_symbol: { marketType: item.marketType, symbol: item.symbol } },
        create: { ...item, securityType: 'STOCK', isActive: true },
        update: { name: item.name, securityType: 'STOCK', isActive: true },
      });
    }
  }

  async deactivateMissingSecurities(items: SecurityMasterItem[]): Promise<number> {
    const byMarket = new Map<string, string[]>();
    for (const item of items) byMarket.set(item.marketType, [...(byMarket.get(item.marketType) ?? []), item.symbol]);
    let count = 0;
    for (const marketType of ['KOSPI', 'KOSDAQ'] as const) {
      const symbols = byMarket.get(marketType) ?? [];
      if (symbols.length === 0) continue;
      const result = await this.prisma.security.updateMany({
        where: { marketType, securityType: 'STOCK', isActive: true, symbol: { notIn: symbols } },
        data: { isActive: false },
      });
      count += result.count;
    }
    return count;
  }

  async upsertMarketPrice(securityId: bigint, observation: PriceObservation): Promise<void> {
    const value = {
      currentPrice: new Prisma.Decimal(observation.currentPrice),
      previousClosePrice: observation.previousClosePrice === null ? null : new Prisma.Decimal(observation.previousClosePrice),
      priceUpdatedAt: observation.observedAt,
    };
    await this.prisma.marketPrice.upsert({ where: { securityId }, create: { securityId, ...value }, update: value });
  }

  async listActiveAccountsForSnapshot(): Promise<SnapshotAccount[]> {
    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        cashBalance: true,
        buyTrades: {
          select: {
            quantity: true,
            sellTrades: { select: { quantity: true } },
            security: { select: { symbol: true, marketPrice: { select: { currentPrice: true } } } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      cashBalance: account.cashBalance.toString(),
      lots: account.buyTrades.map((lot) => ({
        symbol: lot.security.symbol,
        quantity: lot.quantity.toString(),
        soldQuantity: lot.sellTrades.reduce((sum, sale) => sum.add(sale.quantity), new Prisma.Decimal(0)).toString(),
        currentPrice: lot.security.marketPrice?.currentPrice.toString() ?? null,
      })),
    }));
  }

  async upsertDailyAccountSnapshot(accountId: bigint, snapshotDate: Date, value: SnapshotValue): Promise<void> {
    const data = {
      cashBalance: new Prisma.Decimal(value.cashBalance),
      stockValue: new Prisma.Decimal(value.stockValue),
      totalAssetValue: new Prisma.Decimal(value.totalAssetValue),
    };
    await this.prisma.dailyAccountSnapshot.upsert({
      where: { accountId_snapshotDate: { accountId, snapshotDate } },
      create: { accountId, snapshotDate, ...data },
      update: data,
    });
  }
}
