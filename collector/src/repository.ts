import {CollectionExcluded,withCollection,eligibleWhere,exclusionReason,type CollectionFeature} from '@roxstock/shared/collection/collection-policy';
import { Prisma, PrismaClient } from '@roxstock/shared/prisma';
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

  withTarget<T>(target:SecurityTarget,feature:CollectionFeature,work:()=>Promise<T>){return withCollection(this.prisma,target.id,feature,work,target);}

  async acquireLock(jobName: string, ownerToken: string, ttlSeconds: number): Promise<boolean> {
    if (jobName === 'market-prices') return this.acquirePriceLock(ownerToken, ttlSeconds);
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

  private async acquirePriceLock(ownerToken: string, ttlSeconds: number): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT IGNORE INTO collector_locks (job_name,owner_token,locked_until,created_at,updated_at) VALUES ('market-prices',${ownerToken},DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${ttlSeconds} SECOND),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`;
      const [lease] = await tx.$queryRaw<Array<{owner_token:string;expired:number}>>`SELECT owner_token,locked_until <= UTC_TIMESTAMP(3) AS expired FROM collector_locks WHERE job_name='market-prices' FOR UPDATE`;
      if (!lease) throw new Error("COLLECTOR_LOCK_MISSING");
      if (lease.owner_token === ownerToken) return true;
      if (!lease.expired) return false;
      // Only the expired lease's proven owner is recovered. Unknown historical owners are not guessed.
      const interrupted = await tx.collectorRun.findMany({where:{jobType:'market-prices',status:'RUNNING',metadata:{path:'$.owner',equals:lease.owner_token}}});
      for (const run of interrupted) {
        const counts = await tx.collectorRunItem.groupBy({where:{runId:run.id},by:['status'],_count:{_all:true}});
        const byStatus = Object.fromEntries(counts.map(row=>[row.status,row._count._all]));
        await tx.collectorRun.update({where:{id:run.id},data:{status:'FAILED',finishedAt:new Date(),successCount:byStatus.SUCCESS??0,failureCount:byStatus.FAILED??0,staleCount:byStatus.STALE??0,skippedCount:byStatus.SKIPPED??0,
          failureReason:'COLLECTOR_LEASE_EXPIRED: expired owner lease; completion was not recorded',
          metadata:{...(run.metadata as Record<string,Prisma.InputJsonValue> ?? {}),recovery:{reason:'EXPIRED_OWNER_LEASE',originalStatus:run.status,originalFinishedAt:null,originalFailureReason:run.failureReason,originalCounters:{success:run.successCount,failed:run.failureCount,stale:run.staleCount,skipped:run.skippedCount},recoveredAt:new Date().toISOString()}}}});
      }
      await tx.$executeRaw`UPDATE collector_locks SET owner_token=${ownerToken},locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${ttlSeconds} SECOND),updated_at=UTC_TIMESTAMP(3) WHERE job_name='market-prices'`;
      return true;
    });
  }

  async renewLock(jobName: string, ownerToken: string, ttlSeconds: number): Promise<boolean> {
    const changed = await this.prisma.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${ttlSeconds} SECOND), updated_at=UTC_TIMESTAMP(3) WHERE job_name=${jobName} AND owner_token=${ownerToken} AND locked_until > UTC_TIMESTAMP(3)`;
    return changed === 1;
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
    await this.prisma.collectorRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
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

  async addRunItems(runId:bigint,items:RunItemInput[]){await this.prisma.collectorRunItem.createMany({data:items.map(item=>({runId,...item}))});}

  async hasCompletedScheduledPriceRun(scheduleDate: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM collector_runs
      WHERE job_type = 'market-prices'
        AND status IN ('SUCCESS', 'PARTIAL', 'SKIPPED')
        AND NOT EXISTS (SELECT 1 FROM collector_run_items i WHERE i.run_id=collector_runs.id AND i.message='another execution holds the collector lock')
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.scheduleDate')) = ${scheduleDate}
    `;
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async listPriceTargets(): Promise<SecurityTarget[]> {
    return this.prisma.security.findMany({where:{isActive:true},select:{id:true,symbol:true,name:true,collectionRevision:true},orderBy:{id:'asc'}});
  }

  async listActiveSecurities(): Promise<SecurityTarget[]> {
    return this.prisma.security.findMany({
      where: {...eligibleWhere('market-prices'),isActive:true},
      select: { id: true, symbol: true, name: true, collectionRevision:true },
      orderBy: { id: 'asc' },
    });
  }

  async listRealtimeSecurities(limit: number): Promise<SecurityTarget[]> {
    return this.prisma.$queryRaw<SecurityTarget[]>`
      SELECT s.id, s.symbol, s.name, s.collection_revision AS collectionRevision FROM securities s
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
      WHERE s.is_active=TRUE AND UPPER(s.symbol) NOT LIKE 'Z99%' AND s.collection_excluded=FALSE AND (s.excluded_features IS NULL OR JSON_CONTAINS(s.excluded_features, JSON_QUOTE('realtime-prices'))=0) ORDER BY selected.priority DESC, s.id ASC LIMIT ${limit}
    `;
  }

  async upsertSecurityMaster(items: SecurityMasterItem[]): Promise<RunItemInput[]> {
    const outcomes:RunItemInput[]=[];
    for(const item of items){
      if(item.symbol.toUpperCase().startsWith('Z99')){outcomes.push({symbol:item.symbol,status:'SKIPPED',message:'Z99 코드: 수집 제외'});continue;}
      const outcome=await this.prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT id FROM securities WHERE symbol=${item.symbol} FOR UPDATE`;
        const existing=await tx.security.findUnique({where:{symbol:item.symbol}});
        if(existing&&exclusionReason(existing,'security-master'))return {securityId:existing.id,symbol:item.symbol,status:'SKIPPED' as const,message:exclusionReason(existing,'security-master')!};
        const saved=await tx.security.upsert({where:{symbol:item.symbol},create:{...item,registrationSource:'SECURITY_MASTER',securityType:'STOCK',isActive:true},update:{name:item.name,securityType:'STOCK',isActive:true}});
        return {securityId:saved.id,symbol:item.symbol,status:'SUCCESS' as const};
      });outcomes.push(outcome);
    }
    return outcomes;
  }

  async deactivateMissingSecurities(items: SecurityMasterItem[]): Promise<number> {
    const byMarket = new Map<string, string[]>();
    for (const item of items) byMarket.set(item.marketType, [...(byMarket.get(item.marketType) ?? []), item.symbol]);
    let count = 0;
    for (const marketType of ['KOSPI', 'KOSDAQ'] as const) {
      const symbols = byMarket.get(marketType) ?? [];
      if (symbols.length === 0) continue;
      const result = await this.prisma.security.updateMany({
        where: { ...eligibleWhere('security-master'),marketType, securityType: 'STOCK', isActive: true, symbol: { notIn: symbols } },
        data: { isActive: false },
      });
      count += result.count;
    }
    return count;
  }

  async upsertMarketPrice(securityId: bigint, observation: PriceObservation): Promise<void> {
    await this.prisma.marketPrice.upsert({where:{securityId},create:{securityId,collectionSymbol:observation.symbol,currentPrice:new Prisma.Decimal(observation.currentPrice),previousClosePrice:observation.previousClosePrice?new Prisma.Decimal(observation.previousClosePrice):null,priceUpdatedAt:observation.observedAt},update:{collectionSymbol:observation.symbol,currentPrice:new Prisma.Decimal(observation.currentPrice),previousClosePrice:observation.previousClosePrice?new Prisma.Decimal(observation.previousClosePrice):null,priceUpdatedAt:observation.observedAt}});
  }
  async upsertRealtimeMarketPrices(values:RealtimePriceValue[]):Promise<number>{
    let saved=0;
    for(const value of values)try{
      await this.withTarget({id:value.securityId,symbol:value.symbol,name:value.name,collectionRevision:value.collectionRevision},'realtime-prices',async()=>{
        await this.prisma.$transaction(async tx=>{
          const previous=await tx.marketPrice.findUnique({where:{securityId:value.securityId}});
          if(previous&&previous.priceUpdatedAt>value.observedAt)return;
          await tx.marketPrice.upsert({where:{securityId:value.securityId},create:{securityId:value.securityId,collectionSymbol:value.symbol,currentPrice:new Prisma.Decimal(value.currentPrice),previousClosePrice:value.previousClosePrice?new Prisma.Decimal(value.previousClosePrice):null,priceUpdatedAt:value.observedAt},update:{collectionSymbol:value.symbol,currentPrice:new Prisma.Decimal(value.currentPrice),previousClosePrice:value.previousClosePrice?new Prisma.Decimal(value.previousClosePrice):null,priceUpdatedAt:value.observedAt}});saved++;
        });
      });
    }catch(error){if(!(error instanceof CollectionExcluded))throw error;}
    return saved;
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

