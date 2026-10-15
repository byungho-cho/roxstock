import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@roxstock/shared/prisma';
import { runDartCollectorCycle, type DartCollectorConfig } from './dart-collector.js';
import { PrismaDartRepository } from './dart-repository.js';
import { OpenDartProvider, DartApiError } from './dart-provider.js';
import { dartPriorityWindowOpen } from '@roxstock/shared/collection/dart-policy';

const config: DartCollectorConfig = {
  enabled: true, apiKey: 'fixture', dailyCallLimit: 100, minDelayMs: 0,
  backfillStartYear: 2015, backfillCompanyLimit: 10, universeBatchSize: 35,
  windowStartHour: 18, windowEndHour: 6, corpRefreshHours: 24,
};

test('weekday daytime automatic cycle does not access the database', async () => {
  const db = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  for (const hour of ['06', '08', '15']) {
    assert.deepEqual(await runDartCollectorCycle(db as PrismaClient, config, new Date(`2026-10-06T${hour}:00:00+09:00`)), { status: 'OUTSIDE_WINDOW' });
  }
});

test('weekend general collection cannot collect priority stocks through the universe lane', async (t) => {
  const now = new Date('2026-10-10T10:00:00+09:00');
  t.mock.timers.enable({ apis: ['Date'], now });
  const checked: bigint[] = [];
  const repo = PrismaDartRepository.prototype;
  const state = { backfillCompletedAt: now };
  const priority = { id: 1n, symbol: 'PRIORITY', corpCode: '1' };
  const general = { id: 2n, symbol: 'GENERAL', corpCode: '2' };
  const mocks: Record<string, (...args: any[]) => any> = {
    getState: async () => state, getDailyUsage: async () => null,
    acquireLock: async () => true, releaseLock: async () => {},
    createRun: async () => ({ id: 1n }), prioritySecurityIds: async () => [1n],
    corpCodeMappingsSyncedAt: async () => now,
    ensureBackfillPlan: async () => {}, resetInterruptedTasks: async () => {},
    listPhase2Securities: async (phase) => phase === 'PRIORITY' ? [priority] : [priority, general],
    markCompanyChecked: async (id) => { checked.push(id); },
    cachedReports: async () => [], setPhase2Check: async () => {},
    addPhase2RunItem: async () => {}, finishRun: async () => {},
    updateStateError: async () => {}, cleanupRealtimeRetention: async () => {},
  };
  for (const [name, fn] of Object.entries(mocks)) t.mock.method(repo, name as keyof typeof repo, fn);
  const result = await runDartCollectorCycle({security:{findUnique:async({where}:any)=>({...general,id:where.id,symbol:where.id===1n?priority.symbol:general.symbol,isActive:true,collectionExcluded:false,excludedFeatures:[],collectionRevision:0})}} as unknown as PrismaClient, config, now);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(checked.length > 0);
  assert.ok(checked.every(id => id === 2n));
});

test('priority request rechecks the 06 cutoff after the inter-request delay', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-07T05:59:59+09:00') });
  let fetches = 0;
  let reserved = 0;
  const provider = new OpenDartProvider({
    apiKey: 'fixture', dailyCallLimit: 100, minDelayMs: 2000,
    isCallAllowed: () => dartPriorityWindowOpen(new Date()),
    reserveCall: async () => { reserved++; return true; },
    sleepFn: async () => { t.mock.timers.tick(2000); },
    fetchFn: async () => { fetches++; return new Response(JSON.stringify({ status: '013' })); },
  });
  await provider.fetchFinancials('1', 2025, '11011', 'CFS');
  await assert.rejects(provider.fetchFinancials('1', 2025, '11011', 'OFS'), (error: unknown) => error instanceof DartApiError && error.code === 'SCHEDULE_WINDOW_ENDED');
  assert.equal(fetches, 1);
  assert.equal(reserved, 1);
});
