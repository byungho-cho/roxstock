import {Prisma,type PrismaClient} from "../generated/prisma/index.js";
export class CollectionJobRepository {
  constructor(protected readonly prisma:PrismaClient) {}
  async acquireLock(owner: string, ttlSeconds: number, jobName = 'dart-financial-statements'): Promise<boolean> {
    const changed = await this.prisma.$executeRaw`
      INSERT INTO collector_locks (job_name, owner_token, locked_until, created_at, updated_at)
      VALUES (${jobName}, ${owner}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${ttlSeconds} SECOND), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        owner_token = IF(locked_until < UTC_TIMESTAMP(3), VALUES(owner_token), owner_token),
        locked_until = IF(locked_until < UTC_TIMESTAMP(3), VALUES(locked_until), locked_until),
        updated_at = IF(locked_until < UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), updated_at)
    `;
    if (!changed) return false;
    const rows = await this.prisma.$queryRaw<Array<{ owner_token: string }>>`SELECT owner_token FROM collector_locks WHERE job_name = ${jobName}`;
    return rows[0]?.owner_token === owner;
  }
  async releaseLock(owner: string, jobName = 'dart-financial-statements'): Promise<void> {
    await this.prisma.collectorLock.deleteMany({ where: { jobName, ownerToken: owner } });
  }
  async prioritySecurityIds(): Promise<bigint[]> {
    const trades = await this.prisma.buyTrade.findMany({where:{account:{isActive:true},security:{securityType:'STOCK'}},select:{securityId:true,quantity:true,sellTrades:{select:{quantity:true}}}});
    const listed = await this.prisma.accountWatchlistItem.findMany({where:{account:{isActive:true},security:{securityType:'STOCK'},listType:{in:['HOLDING','WATCHLIST']}},select:{securityId:true,listType:true,priority:true}});
    const rank = new Map<bigint, number>();
    for (const item of listed.filter(item=>item.listType!=='RECOMMENDED')) rank.set(item.securityId, Math.max(rank.get(item.securityId) ?? 0, (item.listType === 'WATCHLIST' ? 2 : 3) * 1000000 + item.priority));
    for (const item of trades) {
      const held=item.quantity&&item.quantity.minus(item.sellTrades.reduce((sum,sale)=>sum.plus(sale.quantity),new Prisma.Decimal(0))).gt(0);
      rank.set(item.securityId, Math.max(rank.get(item.securityId) ?? 0, held?3000000:1000000));
    }
    return [...rank.keys()].sort((a,b)=>(rank.get(b)!-rank.get(a)!) || (a<b?-1:1));
  }
}
