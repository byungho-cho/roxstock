import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/index.js';
const annual=(year:number)=>({fiscalYear:year,periodType:'ANNUAL',totalEquity:new Prisma.Decimal(10000),updatedAt:new Date(`${year}-12-31`)});
test('whole-master year/search selection, actual total, missing last and error distinct from empty',async()=>{
 const original=prisma.security.findMany;let args:any;let fail=false;
 prisma.security.findMany=(async(input:any)=>{if(input.include)args=input;if(fail)throw new Error('database unavailable');return [ {id:2n,name:'미수집',symbol:'002',valuationMetrics:[],marketPrice:null}, {id:1n,name:'미등록 종목',symbol:'001',financialStatements:[annual(2023)],fundamentals:{updatedAt:new Date('2024-12-31T15:00:00Z'),issuedShares:new Prisma.Decimal(100)},marketPrice:{currentPrice:new Prisma.Decimal(10000),previousClosePrice:new Prisma.Decimal(9000),priceUpdatedAt:new Date()},valuationMetrics:[{metricDate:new Date('2023-12-31'),bps:new Prisma.Decimal(10000),roe:new Prisma.Decimal(10)}]}];}) as unknown as typeof original;
 const app=buildApp();try{const response=await app.inject('/api/value-analysis?year=2024&query=종목');assert.equal(response.statusCode,200);const data=response.json().data;assert.equal(data.total,2);assert.equal(data.rows[0].w,'1.2');assert.equal(data.rows[1].w,null);assert.equal(data.rows[0].requiredReturn,'8.0');assert.equal(data.rows[0].fairPrices[1].price,'12000');assert.equal(data.rows[0].excessEarnings,null);assert.equal(data.rows[0].issuedShares,null);assert.equal(data.rows[0].shareholderValue,null);assert.equal(data.rows[1].issuedShares,null);assert.equal(data.rows[1].eps,null);assert.equal(args.where.watchlistItems,undefined);assert.equal(args.where.accountId,undefined);assert.equal(args.where.OR[1].symbol.contains,'종목');assert.equal(args.include.valuationMetrics.where.metricDate.gte.toISOString(),'2023-01-01T00:00:00.000Z');assert.equal((await app.inject('/api/value-analysis?year=2025')).json().data.total,0);assert.equal((await app.inject('/api/value-analysis?year=bad')).statusCode,400);fail=true;assert.equal((await app.inject('/api/value-analysis')).statusCode,500);fail=false;prisma.security.findMany=(async()=>[]) as unknown as typeof original;assert.equal((await app.inject('/api/value-analysis')).json().data.total,0);}finally{await app.close();prisma.security.findMany=original;}
});
test('detail GET uses one repeatable-read snapshot, year metrics and requested stored periods',async()=>{
 const original=prisma.$transaction;let isolation:any;
 prisma.$transaction=(async(fn:any,options:any)=>{isolation=options.isolationLevel;return fn({dartShareSnapshot:{findMany:async()=>[]},periodValuation:{findMany:async()=>[]},dartBackfillTask:{findMany:async()=>[]},security:{findMany:async()=>[],findUnique:async()=>({id:1n,name:'종목',symbol:'001',isActive:true,marketPrice:{currentPrice:new Prisma.Decimal(10000),priceUpdatedAt:new Date()}})},financialStatement:{findMany:async()=>[]},dartFinancialFiling:{findMany:async()=>[]},valuationMetric:{findMany:async()=>[{metricDate:new Date('2026-10-05'),bps:new Prisma.Decimal(10000),roe:new Prisma.Decimal(10)}]}});}) as unknown as typeof original;
 const app=buildApp();try{const response=await app.inject('/api/value-analysis/1?year=2026&mode=quarter&startYear=2025&startQuarter=4&count=10');assert.equal(response.statusCode,200);const data=response.json().data;assert.equal(isolation,'RepeatableRead');assert.equal(data.rows.length,10);assert.equal(data.rows[0].key,'2025:Q4');assert.equal(data.rows.at(-1).key,'2028:Q1');assert.equal(data.w,'1.2');assert.equal(data.fairPrices[1].price,'12000');assert.equal(data.rows[0].currentRatio,null);assert.equal((await app.inject('/api/value-analysis/1?mode=invalid')).statusCode,400);assert.equal((await app.inject('/api/value-analysis/1?count=11')).statusCode,400);}finally{await app.close();prisma.$transaction=original;}
});


test('financial cache shares concurrent loads but prices and W remain fresh', async () => {
 const original=prisma.security.findMany;let joins=0,price=10000;
 prisma.security.findMany=(async(input:any)=>{
  if(input.include){joins++;await new Promise(resolve=>setTimeout(resolve,20));return [{id:1n,name:'종목',symbol:'001',financialStatements:[annual(2025)],dartFinancialFilings:[],valuationMetrics:[{metricDate:new Date('2025-12-31'),bps:new Prisma.Decimal(10000),roe:new Prisma.Decimal(10)}]}];}
  return [{id:1n,marketPrice:{currentPrice:new Prisma.Decimal(price),previousClosePrice:new Prisma.Decimal(9000),priceUpdatedAt:new Date()}}];
 }) as unknown as typeof original;
 const app=buildApp();try{
  await Promise.all([app.inject('/api/value-analysis?year=2026'),app.inject('/api/value-analysis?year=2026')]);assert.equal(joins,1);
  price=20000;const response=await app.inject('/api/value-analysis?year=2026');assert.equal(response.json().data.rows[0].w,'0.6');assert.equal(joins,1);
  await app.inject('/api/value-analysis?year=2025');assert.equal(joins,2);
 }finally{await app.close();prisma.security.findMany=original;}
});

test('initial search filters full master without changing live-price or year selection', async()=>{
 const original=prisma.security.findMany;
 const rows=[{id:1n,name:'삼성전자',symbol:'005930',valuationMetrics:[],marketPrice:null},{id:2n,name:'현대차',symbol:'005380',valuationMetrics:[],marketPrice:null}];
 prisma.security.findMany=(async(input:any)=>{assert.equal(input.where.isActive,true);assert.equal(input.where.OR,undefined);return rows;}) as unknown as typeof original;
 const app=buildApp();try{
  for(const [query,expected] of [['ㅅㅅㅈㅈ','삼성전자'],['ㅎㄷㅊ','현대차'],['삼성ㅈㅈ','삼성전자']] as const){
   const response=await app.inject('/api/value-analysis?year=2025&query='+encodeURIComponent(query));assert.equal(response.statusCode,200);assert.deepEqual(response.json().data.rows.map((r:any)=>r.name),[expected]);assert.equal(response.json().data.year,2025);
  }
  const empty=await app.inject('/api/value-analysis?query='+encodeURIComponent('ㅂㅂㅂ'));assert.equal(empty.json().data.total,0);
 }finally{await app.close();prisma.security.findMany=original;}
});

test('list reads only selected/previous annual source evidence and historical share basis for verified totals',async()=>{
 const original=prisma.security.findMany;let join:any;
 prisma.security.findMany=(async(input:any)=>{if(input.include)join=input;return [];}) as any;
 const app=buildApp();try{
  assert.equal((await app.inject('/api/value-analysis?year=2025')).statusCode,200);
  assert.deepEqual(join.include.fundamentals,{select:{updatedAt:true,collectionSymbol:true,securityId:true}});
  assert.equal(join.include.dartFinancialFilings.omit,undefined);
  assert.equal(join.include.dartFinancialFilings.where.periodType,'ANNUAL');assert.deepEqual(join.include.dartFinancialFilings.where.fiscalYear,{gte:2024,lte:2025});
  assert.equal(join.include.dartFinancialFilings.where.isWithdrawn,false);
  assert.deepEqual(join.include.dartShareSnapshots.where.fiscalYear,{gte:2024,lte:2025});
 }finally{await app.close();prisma.security.findMany=original;}
});
