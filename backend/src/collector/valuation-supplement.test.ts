import assert from 'node:assert/strict';import test from 'node:test';import {Prisma,type PrismaClient} from '../generated/prisma/index.js';import {supplementStoredPeriod,supplementSafely} from './valuation-supplement.js';
const d=(v:number)=>new Prisma.Decimal(v);
test('supplement is idempotent, dry run never writes, failed supplemental source preserves financial success and stored values',async()=>{
 let saved:any=null,writes=0,financialWrites=0;
 const f={securityId:1n,fiscalYear:2025,periodType:'ANNUAL',fsDivision:'OFS',receiptNo:'20260301000001',receiptDate:new Date('2026-03-01'),periodEndDate:new Date('2025-12-31'),netIncomeYtd:d(20),totalEquity:d(220),accountSources:{}};
 const db={dartFinancialFiling:{findFirst:async(q:any)=>q.where.fiscalYear===2025?f:{...f,fiscalYear:2024,totalEquity:d(180)},update:()=>{financialWrites++;}},periodValuation:{findUnique:async()=>saved,upsert:async(q:any)=>{writes++;saved={...(saved??q.create),...q.update};return saved;}}} as unknown as PrismaClient;
 const preview=await supplementStoredPeriod(db,1n,2025,'ANNUAL',{dryRun:true});assert.equal((preview?.values as any).roe,'10');assert.equal(writes,0);
 await supplementStoredPeriod(db,1n,2025,'ANNUAL');await supplementStoredPeriod(db,1n,2025,'ANNUAL');assert.equal(saved.values.roe,'10');assert.equal(financialWrites,0);
 saved.values.eps='7';await supplementSafely(db,1n,2025,'ANNUAL',async()=>{throw {code:'020'};});assert.equal(saved.status,'FAILED');assert.equal(saved.values.eps,'7');assert.equal(saved.values.roe,'10');assert.equal(financialWrites,0);
 const count=writes;assert.equal(await supplementStoredPeriod(db,1n,2014,'ANNUAL'),null);assert.equal(writes,count);
});
