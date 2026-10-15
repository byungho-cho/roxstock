import { Prisma, type PrismaClient } from '@roxstock/shared/prisma';
import type { runRealtimeCollector } from './realtime-price-collector.js';
import { createSerialExecutor, retryConflict, RealtimeLockLostError } from './realtime-lifecycle.js';

export const createRealtimeMonitor = (prisma: PrismaClient, token: string) => {
  const serial = createSerialExecutor();
  const transaction = <T>(work: (db: Prisma.TransactionClient) => Promise<T>) => serial(() => retryConflict(() => prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 5000 })));
  const renew = async (db: Prisma.TransactionClient) => {
    const count = await db.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 45 SECOND), updated_at=UTC_TIMESTAMP(3) WHERE job_name='selected-realtime-prices' AND owner_token=${token} AND locked_until > UTC_TIMESTAMP(3)`;
    if (count !== 1) throw new RealtimeLockLostError();
  };
  return {
    acquire() { return transaction(async (prisma) => {
    await prisma.$executeRaw`
      INSERT INTO collector_locks (job_name, owner_token, locked_until, created_at, updated_at)
      VALUES ('selected-realtime-prices', ${token}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 45 SECOND), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE owner_token=IF(locked_until < UTC_TIMESTAMP(3), VALUES(owner_token), owner_token), locked_until=IF(locked_until < UTC_TIMESTAMP(3), VALUES(locked_until), locked_until), updated_at=IF(locked_until < UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), updated_at)
    `;
    const rows = await prisma.$queryRaw<Array<{ owner_token: string }>>`SELECT owner_token FROM collector_locks WHERE job_name='selected-realtime-prices'`;
    const owned = rows[0]?.owner_token === token;
    if (owned) {
      const at = new Date();
      await prisma.realtimeWorkerState.upsert({ where: { id: 'selected-prices' }, create: { id: 'selected-prices', workerToken: token, workerStatus: 'RUNNING', startedAt: at, heartbeatAt: at, marketSession: 'OUT_OF_SESSION' }, update: { workerToken: token, workerStatus: 'RUNNING', startedAt: at, heartbeatAt: at, marketSession: 'OUT_OF_SESSION' } });
    }
    return owned;
  }); },
    heartbeat(status: { workerStatus: string; marketSession: string; at: Date }) { return transaction(async (prisma) => {
    await renew(prisma);
    const result = await prisma.realtimeWorkerState.updateMany({ where: { id: 'selected-prices', workerToken: token }, data: { workerStatus: status.workerStatus, heartbeatAt: status.at, marketSession: status.marketSession } });
    if (result.count !== 1) throw new RealtimeLockLostError();
  }); },
    assertLease() { return transaction(renew); },
    cycle(data: Parameters<NonNullable<Parameters<typeof runRealtimeCollector>[2]['monitor']>['cycle']>[0]) { return transaction(async (prisma) => {
    await renew(prisma);
    if(data.results){
      const count=(status:string)=>data.results!.filter(r=>r.status===status).length;
      const run=await prisma.collectorRun.create({data:{jobType:'realtime-selected-prices',provider:'NAVER_REALTIME',status:count('FAILED')?(count('SUCCESS')?'PARTIAL':'FAILED'):count('SUCCESS')?'SUCCESS':'SKIPPED',startedAt:data.startedAt,finishedAt:data.finishedAt,successCount:count('SUCCESS'),failureCount:count('FAILED'),staleCount:count('STALE'),skippedCount:count('SKIPPED'),metadata:{scope:'SOURCE_TARGET_RESULTS',session:data.session}}});
      if(data.results.length)await prisma.collectorRunItem.createMany({data:data.results.map(r=>({...r,runId:run.id,createdAt:data.finishedAt}))});
    }
    const minute = new Date(Math.floor(data.startedAt.getTime() / 60_000) * 60_000);
    const counts = { cycleCount: 1, targetCount: data.targetCount, receivedCount: data.receivedCount, sourceFailureCount: data.sourceFailureCount, staleCount: data.staleCount,
      publishedCount: data.publishedCount, publishFailureCount: data.publishFailureCount, savedCount: data.savedCount, saveFailureCount: data.saveFailureCount, lastCycleFinishedAt: data.finishedAt };
    await prisma.realtimeCycleAggregate.upsert({ where: { minuteStartedAt: minute }, create: { minuteStartedAt: minute, ...counts }, update: {
      cycleCount: { increment: 1 }, targetCount: { increment: data.targetCount }, receivedCount: { increment: data.receivedCount }, sourceFailureCount: { increment: data.sourceFailureCount }, staleCount: { increment: data.staleCount },
      publishedCount: { increment: data.publishedCount }, publishFailureCount: { increment: data.publishFailureCount }, savedCount: { increment: data.savedCount }, saveFailureCount: { increment: data.saveFailureCount }, lastCycleFinishedAt: data.finishedAt,
    } });
    const state = await prisma.realtimeWorkerState.updateMany({ where: { id: 'selected-prices', workerToken: token }, data: {
      heartbeatAt: data.finishedAt, marketSession: data.session, lastCycleStartedAt: data.startedAt, lastCycleFinishedAt: data.finishedAt,
      targetCount: data.targetCount, receivedCount: data.receivedCount, sourceFailureCount: data.sourceFailureCount, staleCount: data.staleCount,
      publishedCount: data.publishedCount, publishFailureCount: data.publishFailureCount, savedCount: data.savedCount, saveFailureCount: data.saveFailureCount,
      ...(data.receivedCount ? { lastPriceReceivedAt: data.finishedAt } : {}), ...(data.lastSourcePriceAt ? { lastSourcePriceAt: data.lastSourcePriceAt } : {}),
      ...(data.publishedCount ? { lastSsePublishedAt: data.finishedAt } : {}), ...(data.savedCount ? { lastDbSavedAt: data.finishedAt } : {}),
      lastSourceError: data.sourceError ?? null, lastPublishError: data.publishError ?? null, lastSaveError: data.saveError ?? null,
    } });
    if (state.count !== 1) throw new RealtimeLockLostError();
    const issues = [
      ...(data.sourceError ? [{ stage: 'SOURCE', message: data.sourceError }] : []),
      ...(data.sourceIssues ?? []).map((issue) => ({ stage: 'SOURCE', symbol: issue.symbol, message: issue.reason })),
      ...(data.publishError ? [{ stage: 'PUBLISH', message: data.publishError }] : []),
      ...(data.saveError ? [{ stage: 'DATABASE', message: data.saveError }] : []),
    ];
    if (issues.length) await prisma.realtimeCollectorIssue.createMany({ data: issues.map((issue) => ({ stage: issue.stage, symbol: 'symbol' in issue ? issue.symbol : null, message: issue.message.slice(0, 1000), occurredAt: data.finishedAt })) });
    await prisma.realtimeCollectorIssue.deleteMany({ where: { id: { notIn: (await prisma.realtimeCollectorIssue.findMany({ orderBy: { occurredAt: 'desc' }, take: 1000, select: { id: true } })).map((x) => x.id) } } });
    await prisma.realtimeCollectorIssue.deleteMany({ where: { occurredAt: { lt: new Date(data.finishedAt.getTime() - 30 * 86_400_000) } } });
    await prisma.realtimeCycleAggregate.deleteMany({ where: { minuteStartedAt: { lt: new Date(data.finishedAt.getTime() - 7 * 86_400_000) } } });
  }); },
    stopped(at: Date) { return transaction(async (prisma) => {
    await prisma.realtimeWorkerState.updateMany({ where: { id: 'selected-prices', workerToken: token }, data: { workerStatus: 'STOPPED', heartbeatAt: at, marketSession: 'STOPPED' } });
    await prisma.collectorLock.deleteMany({ where: { jobName: 'selected-realtime-prices', ownerToken: token } });
  }); },
  };
};

