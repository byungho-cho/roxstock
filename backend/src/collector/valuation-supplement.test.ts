import assert from 'node:assert/strict';import test from 'node:test';import {Prisma,type PrismaClient} from '../generated/prisma/index.js';import {supplementStoredPeriod,supplementSafely} from './valuation-supplement.js';
import {loadPeriodSupplement} from './valuation-supplement.js';import type {OpenDartProvider} from './dart-provider.js';
const d=(v:number)=>new Prisma.Decimal(v);
test('supplement is idempotent, dry run never writes, failed supplemental source preserves financial success and stored values',async()=>{
 let saved:any=null,writes=0,financialWrites=0;
 const f={securityId:1n,fiscalYear:2025,periodType:'ANNUAL',fsDivision:'OFS',receiptNo:'20260301000001',receiptDate:new Date('2026-03-01'),periodEndDate:new Date('2025-12-31'),netIncomeYtd:d(20),totalEquity:d(220),accountSources:{}};
 const db={dartFinancialFiling:{findFirst:async(q:any)=>q.where.fiscalYear===2025?f:{...f,fiscalYear:2024,totalEquity:d(180)},update:()=>{financialWrites++;}},periodValuation:{findUnique:async()=>saved,upsert:async(q:any)=>{writes++;saved={...(saved??q.create),...q.update};return saved;}}} as unknown as PrismaClient;
 const preview=await supplementStoredPeriod(db,1n,2025,'ANNUAL',{dryRun:true});assert.equal((preview?.values as any).roe,'10');assert.equal(writes,0);
 await supplementStoredPeriod(db,1n,2025,'ANNUAL');await supplementStoredPeriod(db,1n,2025,'ANNUAL');assert.equal(saved.values.roe,'10');assert.equal(financialWrites,0);
 saved.values.eps='7';await supplementSafely(db,1n,2025,'ANNUAL',async()=>{throw {code:'020'};});assert.equal(saved.status,'FAILED');assert.equal(saved.values.eps,'7');assert.equal(saved.values.roe,'10');assert.equal(financialWrites,0);
 await supplementStoredPeriod(db,1n,2025,'ANNUAL',{load:async()=>({accounts:{receiptNo:f.receiptNo,fsDivision:f.fsDivision,collectedAt:'2026-10-08T00:00:00Z',sources:{basicEps:{amount:'10'}}},shares:{outstanding:'10',preferred:false,receiptNo:f.receiptNo},price:{value:'100',date:'2025-12-30',source:'FSC'}})});
 assert.equal(saved.values.eps,'7');assert.equal(saved.values.per,null);assert.match(saved.reasons.per,/기존 정상 EPS/);assert.equal(financialWrites,0);
 const count=writes;assert.equal(await supplementStoredPeriod(db,1n,2014,'ANNUAL'),null);assert.equal(writes,count);
});
test('missing accounts are supplemented independently; source errors cannot erase saved price or rewrite a filing',async()=>{
 let financialCalls=0,shareCalls=0;
 const provider={fetchFinancials:async()=>{financialCalls++;throw {code:'AUTH_FIXTURE'};},fetchPeriodShares:async()=>{shareCalls++;return {outstanding:'10',preferred:false,receiptNo:'20260301000001'};}} as unknown as OpenDartProvider;
 const f={securityId:1n,fiscalYear:2025,periodType:'ANNUAL',reportCode:'11011',fsDivision:'CFS',receiptNo:'20260301000001',receiptDate:new Date('2026-03-01'),periodEndDate:new Date('2025-12-31'),accountSources:{},normalizationVersion:1} as any;
 const db={dartFinancialFiling:{update:()=>{throw Error('must not rewrite filing');},upsert:()=>{throw Error('must not rewrite filing');}}} as unknown as PrismaClient;
 const saved={price:{value:'100',date:'2025-12-30',source:'FSC'}};
 const result=await loadPeriodSupplement(provider,'005930','00126380',db,'KOSPI')(f,saved);
 assert.equal(financialCalls,1);assert.equal(shareCalls,1);assert.deepEqual(result.price,saved.price);assert.equal(result.shares?.outstanding,'10');assert.equal(result.errors?.accounts,'ACCOUNTS_COMMUNICATION');
});
