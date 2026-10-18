import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@roxstock/shared/prisma';
import { PrismaDartRepository } from './dart-repository.js';
import type { DartReport } from './dart-provider.js';

test('priority ranks held, interest, then traded ahead of regular without duplicate accounts', async () => {
  const db = {
    buyTrade:{findMany:async (query:any)=>{assert.equal(query.where.account.isActive,true);return [{securityId:3n},{securityId:1n}];}},
    accountWatchlistItem:{findMany:async()=>[{securityId:1n,listType:'HOLDING',priority:0},{securityId:2n,listType:'WATCHLIST',priority:100},{securityId:4n,listType:'RECOMMENDED',priority:0},{securityId:5n,listType:'HOLDING',priority:0}]},
  } as unknown as PrismaClient;
  assert.deepEqual(await new PrismaDartRepository(db).prioritySecurityIds(),[1n,5n,2n,3n]);
});
test('an unsold purchase is held priority; a fully sold lot remains trade-history priority',async()=>{
 const {Prisma}=await import('@roxstock/shared/prisma');const d=(v:number)=>new Prisma.Decimal(v);
 const db={buyTrade:{findMany:async()=>[{securityId:3n,quantity:d(2),sellTrades:[{quantity:d(1)}]},{securityId:4n,quantity:d(2),sellTrades:[{quantity:d(2)}]}]},accountWatchlistItem:{findMany:async()=>[{securityId:2n,listType:'WATCHLIST',priority:0}]}} as unknown as PrismaClient;
 assert.deepEqual(await new PrismaDartRepository(db).prioritySecurityIds(),[3n,2n,4n]);
});

test('a newly added priority stock starts despite the general daily cap and daytime excludes regular stocks', async () => {
  let started:bigint[]=[];
  const db = {dartSecurityState:{count:async()=>250,findMany:async()=>[{securityId:9n},{securityId:1n}],updateMany:async(query:any)=>{started=query.where.securityId.in;}},buyTrade:{findMany:async()=>[{securityId:1n}]},accountWatchlistItem:{findMany:async()=>[]}} as unknown as PrismaClient;
  await new PrismaDartRepository(db).startUpToDailyCompanyLimit(250,new Date(),true);
  assert.deepEqual(started,[1n]);
});

test('report cache survives repository instances and expired entries reload', async () => {
  let value:any=null, calls=0;
  const report:DartReport={receiptNo:'20260901000001',receiptDate:'20260901',reportName:'사업보고서 (2015.12)',reportCode:'11011',periodType:'ANNUAL',withdrawn:false,selection:{version:2,yearMapping:'CALENDAR_REPORT_YEAR',taskFiscalYear:2015,apiFiscalYear:2015,periodEndDate:'2015-12-31',fiscalYearEndMonth:12,annualPeriods:['2015-12'],candidates:[]}};
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

test('empty mappings cannot hide behind a recent sync timestamp',async()=>{
 const db={dartCorpMapping:{count:async()=>0},dartCollectorState:{findUnique:async()=>{throw Error('empty mappings must force validated fetch')}}} as unknown as PrismaClient;
 assert.equal(await new PrismaDartRepository(db).corpCodeMappingsSyncedAt(),null);
});
test('legacy ambiguous reviews without target-year evidence stay held',async()=>{
 const base={id:1n,securityId:1n,fiscalYear:2025,reportCode:'11011',periodType:'ANNUAL',attempts:1,errorCode:'REVIEW_REQUIRED'};
 const rows=[{...base,diagnostics:{validationResult:'MULTIPLE_ANNUAL_PERIODS'}},{...base,id:2n,diagnostics:{validationResult:'MULTIPLE_ANNUAL_PERIODS',periodResolutionPolicy:'receipt-period-v1'}},{...base,id:3n,diagnostics:{validationResult:'CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION'}},{...base,id:4n,errorCode:null,diagnostics:null}];
 const repo=new PrismaDartRepository({dartCorpMapping:{findUnique:async()=>null},dartBackfillTask:{findMany:async(q:any)=>{assert.equal(q.take,100);return rows;},updateMany:async()=>({count:0})}} as any);
 assert.deepEqual((await repo.listTasksForSecurity(1n)).map(r=>r.id),[4n]);
});

test('verified public targets requeue ambiguous/content tasks with attempt count and previous evidence preserved',async()=>{
 const {mapPeriodicReports}=await import('./dart-provider.js');const corp='00380429',reports=mapPeriodicReports([{corp_code:corp,rcept_no:'20180330001415',rcept_dt:'20180330',report_nm:'사업보고서 (2017.12)',rm:'정연'},{corp_code:corp,rcept_no:'20180814002823',rcept_dt:'20180814',report_nm:'[기재정정]사업보고서 (2017.12)'}],2017);
 for(const reason of ['MULTIPLE_ANNUAL_PERIODS','CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION']){let changed:any;const task:any={id:1n,securityId:1n,fiscalYear:2017,reportCode:'11011',periodType:'ANNUAL',status:'FAILED',attempts:3,errorCode:'REVIEW_REQUIRED',diagnostics:{validationResult:reason}};
 const db:any={dartCorpMapping:{findUnique:async()=>({corpCode:corp})},dartReportCache:{findUnique:async()=>({reports})},dartFinancialFiling:{findFirst:async()=>null},dartBackfillTask:{updateMany:async(q:any)=>{changed=q;return {count:1}}},dartSecurityState:{updateMany:async()=>({count:1})},dartCollectorState:{updateMany:async()=>({count:1})}};
 assert.ok(await new PrismaDartRepository(db).reviewCalendarTask(task));assert.equal(changed.data.status,'PENDING');assert.equal(changed.where.attempts,3);assert.equal(changed.data.attempts,undefined);assert.equal(changed.data.diagnostics.previousValidationResult,reason);assert.equal(changed.data.diagnostics.existingVerifiedSourceReused,false);
 }
});
