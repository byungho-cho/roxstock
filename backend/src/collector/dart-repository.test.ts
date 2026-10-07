import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '../generated/prisma/index.js';
import { PrismaDartRepository } from './dart-repository.js';
import type { DartReport } from './dart-provider.js';

test('priority ranks traded, manually held, and interest ahead of regular without duplicate accounts', async () => {
  const db = {
    buyTrade:{findMany:async (query:any)=>{assert.equal(query.where.account.isActive,true);return [{securityId:3n},{securityId:1n}];}},
    accountWatchlistItem:{findMany:async()=>[{securityId:1n,listType:'HOLDING',priority:0},{securityId:2n,listType:'WATCHLIST',priority:100},{securityId:4n,listType:'RECOMMENDED',priority:0},{securityId:5n,listType:'HOLDING',priority:0}]},
  } as unknown as PrismaClient;
  assert.deepEqual(await new PrismaDartRepository(db).prioritySecurityIds(),[1n,3n,5n,2n]);
});

test('a newly added priority stock starts despite the general daily cap and daytime excludes regular stocks', async () => {
  let started:bigint[]=[];
  const db = {dartSecurityState:{count:async()=>250,findMany:async()=>[{securityId:9n},{securityId:1n}],updateMany:async(query:any)=>{started=query.where.securityId.in;}},buyTrade:{findMany:async()=>[{securityId:1n}]},accountWatchlistItem:{findMany:async()=>[]}} as unknown as PrismaClient;
  await new PrismaDartRepository(db).startUpToDailyCompanyLimit(250,new Date(),true);
  assert.deepEqual(started,[1n]);
});

test('report cache survives repository instances and expired entries reload', async () => {
  let value:any=null, calls=0;
  const report:DartReport={receiptNo:'20260901000001',receiptDate:'20260901',reportName:'사업보고서 (2015.12)',reportCode:'11011',periodType:'ANNUAL',withdrawn:false};
  const db={dartReportCache:{findUnique:async()=>value,upsert:async(query:any)=>{value=query.create;}}} as unknown as PrismaClient;
  const load=async()=>{calls++;return [report];};
  assert.deepEqual(await new PrismaDartRepository(db).cachedReports('00126380',2015,load),[report]);
  await new PrismaDartRepository(db).cachedReports('00126380',2015,load);
  assert.equal(calls,1);
  value.expiresAt = new Date(0);
  await new PrismaDartRepository(db).cachedReports('00126380',2015,load);
  assert.equal(calls,2);
});

test('extending first collection adds current year idempotently and preserves successful history',async()=>{
 let state:any={backfillInitializedAt:new Date(),backfillEndYear:2025,backfillStartYear:2015,backfillCompletedAt:new Date()};const tasks:any[]=[];
 const db={buyTrade:{findMany:async()=>[]},accountWatchlistItem:{findMany:async()=>[]},dartCollectorState:{findUnique:async()=>state,upsert:async(q:any)=>{state={...state,...q.update};return state;}},security:{findMany:async()=>[{id:1n},{id:2n}]},dartSecurityState:{findMany:async()=>[{securityId:1n},{securityId:2n}],updateMany:async()=>({count:2})},dartBackfillTask:{createMany:async(q:any)=>{assert.equal(q.skipDuplicates,true);tasks.push(...q.data);return {count:q.data.length};},updateMany:async(q:any)=>{assert.equal(q.where.status,'PENDING');return {count:0};}}} as unknown as PrismaClient;
 const repo=new PrismaDartRepository(db);await repo.ensureBackfillPlan(2015,2026);assert.equal(tasks.length,8);assert.ok(tasks.every(t=>t.fiscalYear===2026));assert.equal(state.backfillEndYear,2026);assert.equal(state.backfillCompletedAt,null);await repo.ensureBackfillPlan(2015,2026);assert.equal(tasks.length,8);
});

test('priority enumeration is not truncated by the regular batch limit', async () => {
 const db={buyTrade:{findMany:async()=>[{securityId:1n},{securityId:2n}]},accountWatchlistItem:{findMany:async()=>[]},security:{findMany:async()=>[{id:1n,symbol:'000001',securityType:'STOCK',dartCorpMapping:{corpCode:'1'}},{id:2n,symbol:'000002',securityType:'STOCK',dartCorpMapping:{corpCode:'2'}}]}} as unknown as PrismaClient;
 const repo=new PrismaDartRepository(db);
 assert.equal((await repo.listPhase2Securities('PRIORITY',1)).length,2);
 assert.equal((await repo.listPhase2Securities('UNIVERSE',1)).length,1);
});
