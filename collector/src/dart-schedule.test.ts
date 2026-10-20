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
    ensureBackfillPlan: async () => {}, resetInterruptedTasks: async () => {}, recoverMappedTasks:async()=>0, reactivateDueTasks:async()=>0,
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

test('automatic safe boundaries serve FIFO manual requests one at a time and resume the same loop',async(t)=>{
 const now=new Date('2026-10-10T10:00:00+09:00');t.mock.timers.enable({apis:['Date'],now});
 const events:string[]=[],queue:number[]=[];let enqueued=false,held=false;
 const general={id:2n,symbol:'GENERAL',corpCode:'2'};
 const mocks:Record<string,(...args:any[])=>any>={
  getState:async()=>({backfillCompletedAt:now}),getDailyUsage:async()=>null,
  acquireLock:async()=>{assert.equal(held,false);held=true;events.push('acquire');return true;},releaseLock:async()=>{held=false;events.push('release');},
  createRun:async()=>({id:1n}),prioritySecurityIds:async()=>[],corpCodeMappingsSyncedAt:async()=>now,
  ensureBackfillPlan:async()=>{},resetInterruptedTasks:async()=>{},recoverMappedTasks:async()=>0,reactivateDueTasks:async()=>0,listPhase2Securities:async(phase)=>phase==='UNIVERSE'?[general]:[],
  markCompanyChecked:async()=>{assert.equal(held,true);events.push('auto');if(!enqueued){queue.push(10,11);enqueued=true;}},
  cachedReports:async()=>[],setPhase2Check:async()=>{},addPhase2RunItem:async()=>{},finishRun:async()=>{},updateStateError:async()=>{},cleanupRealtimeRetention:async()=>{},
 };
 for(const [name,fn]of Object.entries(mocks))t.mock.method(PrismaDartRepository.prototype,name as keyof PrismaDartRepository,fn);
 const db={collectorRun:{findFirst:async()=>queue.length?{id:BigInt(queue[0])}:null},security:{findUnique:async()=>({...general,isActive:true,collectionExcluded:false,excludedFeatures:[],collectionRevision:0})}} as unknown as PrismaClient;
 const result=await runDartCollectorCycle(db,config,now,async()=>{assert.equal(held,false);events.push(`manual:${queue.shift()}`);return true;});
 assert.equal(result.status,'SUCCESS');assert.equal(queue.length,0);
 const work=events.filter(e=>e==='auto'||e.startsWith('manual:'));
 assert.deepEqual(work.slice(0,5),['auto','manual:10','auto','manual:11','auto']);
 assert.equal(work.filter(e=>e==='auto').length,12);assert.equal(held,false);
});


test('phase two keeps review-held reports untouched instead of fetching them again',async(t)=>{
 const now=new Date('2026-10-10T10:00:00+09:00');t.mock.timers.enable({apis:['Date'],now});
 const stock={id:2n,symbol:'GENERAL',corpCode:'2'},held:any[]=[];let reports=0;
 const mocks:Record<string,(...args:any[])=>any>={
  getState:async()=>({backfillCompletedAt:now}),getDailyUsage:async()=>null,acquireLock:async()=>true,releaseLock:async()=>{},
  createRun:async()=>({id:1n}),prioritySecurityIds:async()=>[],corpCodeMappingsSyncedAt:async()=>now,ensureBackfillPlan:async()=>{},resetInterruptedTasks:async()=>{},recoverMappedTasks:async()=>0,reactivateDueTasks:async()=>0,
  listPhase2Securities:async(phase)=>phase==='UNIVERSE'?[stock]:[],markCompanyChecked:async()=>{},
  cachedReports:async(_corp,year)=>year===2026?[{reportCode:'11011',periodType:'ANNUAL',receiptNo:'20261010000001'}]:[],
  isReviewHeld:async(...args)=>{held.push(args);return true;},setPhase2Check:async()=>{},
  saveFiling:async()=>{throw Error('Held report must never be saved');},
  addPhase2RunItem:async(_run,_stock,_status,message)=>{if(message.includes('검토 보류'))reports++;},finishRun:async()=>{},updateStateError:async()=>{},cleanupRealtimeRetention:async()=>{},
 };
 for(const [name,fn]of Object.entries(mocks))t.mock.method(PrismaDartRepository.prototype,name as keyof PrismaDartRepository,fn);
 t.mock.method(OpenDartProvider.prototype,'fetchFinancials',async()=>{throw Error('Held report must never be fetched');});
 const db={security:{findUnique:async()=>({...stock,isActive:true,collectionExcluded:false,excludedFeatures:[],collectionRevision:0})}} as unknown as PrismaClient;
 const result=await runDartCollectorCycle(db,config,now);
 assert.equal(result.status,'SUCCESS');assert.deepEqual(held,[[2n,2026,'11011']]);assert.equal(reports,1);
});
