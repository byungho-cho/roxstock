import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { prisma } from '../lib/prisma.js';
import { financialRefreshActiveRoutes } from './financial-refresh-active.js';

test('active refresh is scoped, read only, and handles absent and completed jobs', async () => {
  const original = prisma.collectorRun.findFirst;
  let row: any = null;
  prisma.collectorRun.findFirst = (async (args: any) => {
    assert.equal(args.where.jobType, 'dart-financial-statements');
    assert.equal(args.where.status, 'RUNNING');
    assert.deepEqual(args.where.AND, [
      { metadata: { path: '$.phase', equals: 'MANUAL' } },
      { metadata: { path: '$.securityId', equals: '2' } },
    ]);
    return row;
  }) as typeof original;
  const app = Fastify();
  await app.register(financialRefreshActiveRoutes, { prefix: '/api' });
  try {
    const get = () => app.inject('/api/securities/2/financial-refresh/active');
    assert.equal((await get()).json().data, null);
    row = {id:99n,status:'RUNNING',startedAt:new Date('2026-10-08T00:00:00Z'),finishedAt:null,
      metadata:{phase:'MANUAL',securityId:'2',manualState:'PROCESSING',fiscalYear:2024,startYear:2024,endYear:2026,period:'ALL',progress:{currentYear:2025,stage:'FINANCIALS',completed:4,total:12},results:[]}};
    const data = (await get()).json().data;
    assert.equal(data.requestId, '99');assert.equal(data.state, 'PROCESSING');
    assert.equal(data.progress.currentYear, 2025);assert.equal(data.endYear, 2026);
    row.metadata.securityId = '3';assert.equal((await get()).json().data, null);
    row.metadata.securityId = '2';row.metadata.manualState = 'FINISHED';assert.equal((await get()).json().data, null);
  } finally { prisma.collectorRun.findFirst = original; await app.close(); }
});
