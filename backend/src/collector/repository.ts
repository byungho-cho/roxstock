import { Prisma, PrismaClient } from '../generated/prisma/index.js';
import type {
  CollectorRepository,
  CollectorRunStatus,
  PriceObservation,
  RealtimePriceValue,
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

  async hasCompletedScheduledPriceRun(scheduleDate: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM collector_runs
      WHERE job_type = 'market-prices'
        AND status IN ('SUCCESS', 'PARTIAL', 'SKIPPED')
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.scheduleDate')) = ${scheduleDate}
    `;
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async listActiveSecurities(): Promise<SecurityTarget[]> {
    return this.prisma.security.findMany({
      where: { isActive: true },
      select: { id: true, symbol: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  async listRealtimeSecurities(limit: number): Promise<SecurityTarget[]> {
    return this.prisma.$queryRaw<SecurityTarget[]>`
      SELECT s.id, s.symbol, s.name FROM securities s
      JOIN (
        SELECT security_id, MAX(priority) AS priority FROM (
          SELECT w.security_id, w.priority FROM account_watchlist_items w
          JOIN accounts a ON a.id=w.account_id AND a.is_active=TRUE
          UNION ALL
          SELECT b.security_id, 0 AS priority FROM buy_trades b
          JOIN accounts a ON a.id=b.account_id AND a.is_active=TRUE
          WHERE b.quantity > COALESCE((SELECT SUM(t.quantity) FROM sell_trades t WHERE t.buy_trade_id=b.id), 0)
        ) targets GROUP BY security_id
      ) selected ON selected.security_id=s.id
      WHERE s.is_active=TRUE ORDER BY selected.priority DESC, s.id ASC LIMIT ${limit}
    `;
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

  async upsertRealtimeMarketPrices(values: RealtimePriceValue[]): Promise<number> {
    let stored = 0;
    for (const value of values) {
      const currentPrice = new Prisma.Decimal(value.currentPrice);
      const previousClosePrice = value.previousClosePrice === null ? null : new Prisma.Decimal(value.previousClosePrice);
      const changed = await this.prisma.$executeRaw`
        INSERT INTO market_prices
          (security_id, current_price, previous_close_price, price_updated_at, created_at, updated_at)
        VALUES
          (${value.securityId}, ${currentPrice}, ${previousClosePrice}, ${value.observedAt}, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          current_price = IF(VALUES(price_updated_at) >= price_updated_at, VALUES(current_price), current_price),
          previous_close_price = IF(VALUES(price_updated_at) >= price_updated_at, VALUES(previous_close_price), previous_close_price),
          updated_at = IF(VALUES(price_updated_at) >= price_updated_at, UTC_TIMESTAMP(3), updated_at),
          price_updated_at = GREATEST(price_updated_at, VALUES(price_updated_at))
      `;
      if (changed > 0) stored += 1;
    }
    return stored;
  }

  async listActiveAccountsForSnapshot(): Promise<SnapshotAccount[]> {
    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        cashTransactions: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { balanceAfter: true } },
        buyTrades: {
          select: {
            quantity: true,
            unitPrice: true,
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
      cashBalance: account.cashTransactions[0]?.balanceAfter?.toString() ?? null,
      lots: account.buyTrades.map((lot) => ({
        symbol: lot.security.symbol,
        quantity: lot.quantity.toString(),
        unitPrice: lot.unitPrice.toString(),
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
      investmentAmount: new Prisma.Decimal(value.investmentAmount),
    };
    await this.prisma.dailyAccountSnapshot.upsert({
      where: { accountId_snapshotDate: { accountId, snapshotDate } },
      create: { accountId, snapshotDate, ...data },
      update: data,
    });
  }
}

