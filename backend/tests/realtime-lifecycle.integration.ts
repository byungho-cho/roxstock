import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, PrismaClient } from '../src/generated/prisma/index.js';
import { createRealtimeMonitor } from '../src/collector/realtime-monitor.js';
import { RealtimeLockLostError } from '../src/collector/realtime-lifecycle.js';

const db = new PrismaClient();
test('real MariaDB: exclusive claim, serialized updates, expiry and old-owner fencing', async () => {
  const a = createRealtimeMonitor(db, 'phase19-test-a');
  const b = createRealtimeMonitor(db, 'phase19-test-b');
  try {
    await db.collectorLock.deleteMany({ where: { jobName: 'selected-realtime-prices' } });
    await db.realtimeWorkerState.deleteMany({ where: { id: 'selected-prices' } });
    assert.equal(await a.acquire(), true); assert.equal(await b.acquire(), false);
    await Promise.all(Array.from({ length: 20 }, () => a.heartbeat({ workerStatus: 'RUNNING', marketSession: 'OUT_OF_SESSION', at: new Date() })));
    await db.$executeRaw`UPDATE collector_locks SET locked_until=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE job_name='selected-realtime-prices'`;
    await assert.rejects(a.assertLease(), RealtimeLockLostError);
    assert.equal(await b.acquire(), true);
    await assert.rejects(a.heartbeat({ workerStatus: 'RUNNING', marketSession: 'OUT_OF_SESSION', at: new Date() }), RealtimeLockLostError);
    await a.stopped(new Date());
    assert.equal((await db.collectorLock.findUnique({ where: { jobName: 'selected-realtime-prices' } }))?.ownerToken, 'phase19-test-b');
    assert.equal((await db.realtimeWorkerState.findUnique({ where: { id: 'selected-prices' } }))?.workerToken, 'phase19-test-b');
    await b.heartbeat({ workerStatus: 'RUNNING', marketSession: 'OUT_OF_SESSION', at: new Date() });
    await b.stopped(new Date());
    assert.equal(await db.collectorLock.count({ where: { jobName: 'selected-realtime-prices' } }), 0);
  } finally {
    await db.realtimeWorkerState.deleteMany({ where: { id: 'selected-prices' } });
    await db.collectorLock.deleteMany({ where: { jobName: 'selected-realtime-prices' } });
  }
});
test('real MariaDB snapshot conflict reproduces 1020 on the old read-then-update path', async () => {
  await db.realtimeWorkerState.create({ data: { id: 'phase19-conflict', workerStatus: 'RUNNING', marketSession: 'OUT_OF_SESSION', workerToken: 'synthetic' } });
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET SESSION innodb_snapshot_isolation=ON');
      await tx.realtimeWorkerState.findUnique({ where: { id: 'phase19-conflict' } });
      await db.realtimeWorkerState.update({ where: { id: 'phase19-conflict' }, data: { workerStatus: 'OTHER' } });
      await tx.realtimeWorkerState.update({ where: { id: 'phase19-conflict' }, data: { workerStatus: 'OLD' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }), (error: unknown) => /1020/.test(String(error)));
  } finally { await db.realtimeWorkerState.delete({ where: { id: 'phase19-conflict' } }); }
});
test.after(async () => { await db.$disconnect(); });
