import assert from 'node:assert/strict';
import test from 'node:test';
import { parseManualRefresh, processManualRefresh, type ManualRefreshMetadata } from './dart-manual-refresh.js';
import { PrismaDartRepository } from './dart-repository.js';
import type { PrismaClient } from '../generated/prisma/index.js';
import type { DartCollectorConfig } from './dart-collector.js';

const config: DartCollectorConfig = { enabled: true, apiKey: 'test-key', dailyCallLimit: 3000, minDelayMs: 0, backfillStartYear: 2015, backfillCompanyLimit: 100, universeBatchSize: 35, windowStartHour: 18, windowEndHour: 6, corpRefreshHours: 24 };
test('manual period/year validation rejects invalid and future input', () => {
  assert.deepEqual(parseManualRefresh({ fiscalYear: 2024, period: 'ALL' }), { fiscalYear: 2024, period: 'ALL' });
  for (const body of [null, {fiscalYear:'2024',period:'Q1'}, {fiscalYear:2014,period:'Q1'}, {fiscalYear:9999,period:'Q1'}, {fiscalYear:2024,period:'Q4'}]) assert.throws(() => parseManualRefresh(body));
});
test('manual annual request uses shared quota/lock, CFS fallback, preserves no-data and reports partial failure', async () => {
  const originals = { acquire: PrismaDartRepository.prototype.acquireLock, release: PrismaDartRepository.prototype.releaseLock, reserve: PrismaDartRepository.prototype.reserveApiCall, record: PrismaDartRepository.prototype.recordApiResult, save: PrismaDartRepository.prototype.saveFiling, finish: PrismaDartRepository.prototype.finishRun, fetch: globalThis.fetch };
  let released = false; let calls = 0; let saved = 0; let final: unknown[] = [];
  const metadata: ManualRefreshMetadata = { phase:'MANUAL', securityId:'1', fiscalYear:2024, period:'ALL', manualState:'QUEUED' };
  const run = {id:1n, status:'RUNNING',metadata};
  const db = { dartFinancialFiling:{findUnique:async()=>null},collectorRun:{findFirst:async()=>run, findUnique:async()=>run, update:async()=>({})}, security:{findUnique:async()=>({id:1n,isActive:true,securityType:'STOCK',dartCorpMapping:{corpCode:'001'}})},collectorRunItem:{create:async()=>({})}} as unknown as PrismaClient;
  PrismaDartRepository.prototype.acquireLock = async () => true;
  PrismaDartRepository.prototype.releaseLock = async () => {released=true;};
  PrismaDartRepository.prototype.reserveApiCall = async () => {calls++;return true;};
  PrismaDartRepository.prototype.recordApiResult = async () => {};
  PrismaDartRepository.prototype.saveFiling = async () => {saved++;return {created:true,supersedesReceiptNo:null};};
  PrismaDartRepository.prototype.finishRun = async (...args) => {final=args;};
  globalThis.fetch = (async (input) => {
    const u = new URL(String(input));
    if(u.pathname.endsWith('list.json')) return Response.json({status:'000',total_page:1,list:[{rcept_no:'20250301000001',rcept_dt:'20250301',report_nm:'사업보고서 (2024.12)'},{rcept_no:'20240501000001',rcept_dt:'20240501',report_nm:'분기보고서 (2024.03)'},{rcept_no:'20240801000001',rcept_dt:'20240801',report_nm:'반기보고서 (2024.06)'}]});
    const code=u.searchParams.get('reprt_code');
    if(code==='11012')return Response.json({status:'020'});
    if(u.searchParams.get('fs_div')==='CFS')return Response.json({status:'013'});
    return Response.json({status:'000',list:[{rcept_no:'20240501000001',bsns_year:'2024',reprt_code:'11013',corp_code:'001',sj_div:'BS',account_id:'ifrs-full_Assets',account_nm:'자산총계',thstrm_amount:'100',currency:'KRW'}]});
  }) as typeof fetch;
  try {
    assert.equal(await processManualRefresh(db,config),true);
    assert.equal(saved,1);assert.equal(calls,4);assert.equal(released,true);
    assert.equal(final[1],'PARTIAL');
    const m=final[4] as ManualRefreshMetadata;assert.equal(m.manualState,'FINISHED');assert.equal(m.results?.length,4);assert.equal(m.results?.[0]?.status,'SUCCESS');assert.equal(m.results?.[3]?.code,'020');
  } finally {Object.assign(PrismaDartRepository.prototype,{acquireLock:originals.acquire,releaseLock:originals.release,reserveApiCall:originals.reserve,recordApiResult:originals.record,saveFiling:originals.save,finishRun:originals.finish});globalThis.fetch=originals.fetch;}
});
