import {buildAnalysisTestApp} from './analysis-test-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../auth/route-test-app.js';
import {prisma} from '@roxstock/shared/lib/prisma';
import {Prisma} from '@roxstock/shared/prisma';
test('financial list only reads stored records and missing numbers sort last in both directions',async()=>{
 const original=prisma.security.findMany;let args:any;
 prisma.security.findMany=(async(input:any)=>{args=input;return [{id:2n,name:'누락',symbol:'002',marketType:'KOSPI',marketPrice:null,fundamentals:null,valuationMetrics:[],financialStatements:[],dartFinancialFilings:[]},{id:1n,name:'저장',symbol:'001',marketType:'KOSPI',marketPrice:{currentPrice:new Prisma.Decimal(100),priceUpdatedAt:new Date()},fundamentals:null,valuationMetrics:[],financialStatements:[],dartFinancialFilings:[]}];}) as unknown as typeof original;
 const app=buildAnalysisTestApp();try{for(const direction of ['asc','desc']){const res=await app.inject('/api/financial-statements?year=2025&market=KOSPI&sort=currentPrice&direction='+direction);assert.equal(res.statusCode,200);assert.equal(res.json().data.rows[0].id,'1');assert.equal(res.json().data.rows[1].currentPrice,null);}assert.deepEqual(args.include.financialStatements.where.fiscalYear,{gte:2024,lte:2025});assert.equal(args.where.marketType,'KOSPI');assert.equal((await app.inject('/api/financial-statements?sort=bad')).statusCode,400);}finally{await app.close();prisma.security.findMany=original;}
});
test('financial detail keeps exactly three periods across a year boundary without a write',async()=>{
 const original=prisma.$transaction;let isolation:string|undefined;
 prisma.$transaction=(async(fn:any,options:any)=>{isolation=options.isolationLevel;return fn({dartBackfillTask:{findMany:async()=>[{fiscalYear:2025,periodType:'Q1',diagnostics:{validationResult:'CLOSING_MONTH_CHANGED',taskFiscalYear:2025,reportPeriod:'2026-09',token:'private'}}]},fundamentalSnapshot:{findFirst:async()=>null},security:{findMany:async()=>[],findUnique:async()=>({id:1n,isActive:true,name:'저장',symbol:'001'})},financialStatement:{findMany:async()=>[]},dartFinancialFiling:{findMany:async()=>[]},periodValuation:{findMany:async()=>[]},valuationMetric:{findMany:async()=>[]}});}) as unknown as typeof original;
 const app=buildAnalysisTestApp();try{const res=await app.inject('/api/financial-statements/1?startYear=2025&startQuarter=4&mode=quarter');assert.equal(res.statusCode,200);assert.equal(isolation,'RepeatableRead');assert.equal(res.json().data.sourceReviews[0].candidatePeriod,'2026-09');assert.equal(res.json().data.sourceReviews[0].requestedYear,2025);assert.doesNotMatch(res.body,/private/);assert.ok(res.json().data.notices.some((n:string)=>n.includes('대상 확정 아님')));assert.deepEqual(res.json().data.rows.map((r:any)=>r.key),['2025:Q4','2026:Q1','2026:Q2']);assert.equal(res.json().data.rows[0].values.revenue,null);assert.equal((await app.inject('/api/financial-statements/1?startQuarter=5&mode=quarter')).statusCode,400);
 for(const y of [2015,2016,2017,2018,2019,2024,2026]){const r=await app.inject('/api/financial-statements/1?endYear='+y);const end=Math.max(2018,y);assert.deepEqual(r.json().data.rows.map((x:any)=>x.year),[end-2,end-1,end]);}
 const legacy=await app.inject('/api/financial-statements/1?startYear=2024');assert.deepEqual(legacy.json().data.rows.map((x:any)=>x.year),[2024,2025,2026]);
 const custom=await app.inject('/api/financial-statements/1?startYear=2015&endYear=2017&period=ANNUAL');assert.deepEqual(custom.json().data.rows.map((x:any)=>x.year),[2015,2016,2017]);
 const all=await app.inject('/api/financial-statements/1?startYear=2024&endYear=2025&period=ALL');assert.equal(all.json().data.rows.length,8);
 assert.equal((await app.inject('/api/financial-statements/1?startYear=2025&endYear=2024&period=ALL')).statusCode,400);}finally{await app.close();prisma.$transaction=original;}
});

test('financial bounded list keeps full navigation, total and original API semantics',async()=>{
 const original=prisma.security.findMany;
 prisma.security.findMany=(async()=>Array.from({length:125},(_,i)=>({id:BigInt(i+1),name:'종목'+i,symbol:String(i+1).padStart(6,'0'),marketType:'KOSPI',marketPrice:null,valuationMetrics:[]}))) as unknown as typeof original;
 const app=buildAnalysisTestApp();
 try{
  const full=(await app.inject('/api/financial-statements?year=2026&market=KOSPI')).json().data;
  const response=await app.inject('/api/financial-statements?year=2026&market=KOSPI&limit=100');assert.equal(response.statusCode,200);
  const bounded=response.json().data;assert.equal(bounded.total,125);assert.equal(bounded.rows.length,100);assert.deepEqual(bounded.rows,full.rows.slice(0,100));assert.deepEqual(bounded.navigation,full.rows.map(({id,name,symbol}:any)=>({id,name,symbol})));
  assert.equal((await app.inject('/api/financial-statements?year=2026&limit=200')).json().data.rows.length,125);
  const next=(await app.inject('/api/financial-statements?year=2026&market=KOSPI&limit=30&offset=20')).json().data;assert.deepEqual(next.rows,full.rows.slice(20,50));assert.equal(next.navigation,undefined);
  assert.equal((await app.inject('/api/financial-statements?offset=-1')).statusCode,400);
  assert.equal((await app.inject('/api/financial-statements?limit=0')).statusCode,400);
  assert.equal((await app.inject('/api/financial-statements?compact=bad')).statusCode,400);
 }finally{await app.close();prisma.security.findMany=original;}
});
