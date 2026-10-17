import {createHash} from 'node:crypto';
import {Prisma,type PrismaClient} from "../generated/prisma/index.js";
import {financialLeaseSeconds,financialHeartbeatMs,FinancialLeaseLost} from './financial-lease.js';
export class CollectionJobRepository {
  private heartbeats=new Map<string,{timer:ReturnType<typeof setInterval>;pending:Promise<void>|null}>();
  constructor(protected readonly prisma:PrismaClient) {}
  async acquireLock(owner: string, ttlSeconds: number, jobName = 'dart-financial-statements'): Promise<boolean> {
    if(jobName==='dart-financial-statements')ttlSeconds=financialLeaseSeconds;
    const ownerId=createHash('sha256').update(owner).digest('hex').slice(0,16);
    console.info(JSON.stringify({event:'collector_lock_attempt',jobName,ownerId,at:new Date().toISOString(),expiresAt:new Date(Date.now()+ttlSeconds*1000).toISOString()}));
    const changed = await this.prisma.$executeRaw`
      INSERT INTO collector_locks (job_name, owner_token, locked_until, created_at, updated_at)
      VALUES (${jobName}, ${owner}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${ttlSeconds} SECOND), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        updated_at = IF(locked_until < UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), updated_at),
        owner_token = IF(locked_until < UTC_TIMESTAMP(3), VALUES(owner_token), owner_token),
        locked_until = IF(locked_until < UTC_TIMESTAMP(3), VALUES(locked_until), locked_until)
    `;
    const rows = await this.prisma.$queryRaw<Array<{ owner_token: string;locked_until?:Date }>>`SELECT owner_token, locked_until FROM collector_locks WHERE job_name = ${jobName}`;
    const acquired=Boolean(changed)&&rows[0]?.owner_token === owner;
    console.info(JSON.stringify({event:acquired?'collector_lock_acquired':'collector_lock_failed',jobName,ownerId,holderId:rows[0]?.owner_token?createHash('sha256').update(rows[0].owner_token).digest('hex').slice(0,16):null,lockedUntil:rows[0]?.locked_until?.toISOString()??null,at:new Date().toISOString()}));
    if(acquired&&jobName==='dart-financial-statements')this.startHeartbeat(owner);
    return acquired;
  }
  async renewFinancialLease(owner:string){
    const changed=await this.prisma.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${financialLeaseSeconds} SECOND),updated_at=UTC_TIMESTAMP(3) WHERE job_name='dart-financial-statements' AND owner_token=${owner} AND locked_until>UTC_TIMESTAMP(3)`;
    if(changed!==1)throw new FinancialLeaseLost();
  }
  private startHeartbeat(owner:string){
    if(this.heartbeats.has(owner))return;
    const state:{timer:ReturnType<typeof setInterval>;pending:Promise<void>|null}={timer:undefined as never,pending:null};
    state.timer=setInterval(()=>{if(state.pending)return;state.pending=this.renewFinancialLease(owner).catch(()=>{clearInterval(state.timer);}).finally(()=>{state.pending=null;});},financialHeartbeatMs);
    state.timer.unref();this.heartbeats.set(owner,state);
  }
  async releaseLock(owner: string, jobName = 'dart-financial-statements'): Promise<void> {
    const heartbeat=this.heartbeats.get(owner);if(heartbeat){clearInterval(heartbeat.timer);this.heartbeats.delete(owner);await heartbeat.pending;}
    const released=await this.prisma.collectorLock.deleteMany({ where: { jobName, ownerToken: owner } });
    console.info(JSON.stringify({event:'collector_lock_release',jobName,ownerId:createHash('sha256').update(owner).digest('hex').slice(0,16),released:released.count,at:new Date().toISOString()}));
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
