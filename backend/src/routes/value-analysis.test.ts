import {buildAnalysisTestApp} from './analysis-test-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../auth/route-test-app.js';
import { prisma } from '@roxstock/shared/lib/prisma';
import { Prisma } from '@roxstock/shared/prisma';
const annual=(year:number)=>({fiscalYear:year,periodType:'ANNUAL',totalEquity:new Prisma.Decimal(10000),updatedAt:new Date(`${year}-12-31`)});
test('whole-master year/search selection, actual total, missing last and error distinct from empty',async()=>{
 const original=prisma.security.findMany;let args:any;let fail=false;
 prisma.security.findMany=(async(input:any)=>{if(input.include)args=input;if(fail)throw new Error('database unavailable');return [ {id:2n,name:'미수집 종목',symbol:'002',valuationMetrics:[],marketPrice:null}, {id:1n,name:'미등록 종목',symbol:'001',financialStatements:[annual(2023)],fundamentals:{updatedAt:new Date('2024-12-31T15:00:00Z'),issuedShares:new Prisma.Decimal(100)},marketPrice:{currentPrice:new Prisma.Decimal(10000),previousClosePrice:new Prisma.Decimal(9000),priceUpdatedAt:new Date()},valuationMetrics:[{metricDate:new Date('2023-12-31'),bps:new Prisma.Decimal(10000),roe:new Prisma.Decimal(10)}]}];}) as unknown as typeof original;
 const app=buildAnalysisTestApp();try{const response=await app.inject('/api/value-analysis?year=2024&query=종목');assert.equal(response.statusCode,200);const data=response.json().data;assert.equal(data.total,2);assert.equal(data.rows[0].w,'1.2');assert.equal(data.rows[1].w,null);assert.equal(data.rows[0].requiredReturn,'8.0');assert.equal(data.rows[0].fairPrices[1].price,'12000');assert.equal(data.rows[0].excessEarnings,null);assert.equal(data.rows[0].issuedShares,null);assert.equal(data.rows[0].shareholderValue,null);assert.equal(data.rows[1].issuedShares,null);assert.equal(data.rows[1].eps,null);assert.equal(args.where.watchlistItems,undefined);assert.equal(args.where.accountId,undefined);assert.equal(args.where.OR[1].symbol.contains,'종목');assert.equal(args.include.valuationMetrics.where.metricDate.gte.toISOString(),'2023-01-01T00:00:00.000Z');assert.equal((await app.inject('/api/value-analysis?year=2025')).json().data.total,2);assert.equal((await app.inject('/api/value-analysis?year=bad')).statusCode,400);fail=true;assert.equal((await app.inject('/api/value-analysis')).statusCode,500);fail=false;prisma.security.findMany=(async()=>[]) as unknown as typeof original;assert.equal((await app.inject('/api/value-analysis')).json().data.total,0);}finally{await app.close();prisma.security.findMany=original;}
});
test('detail GET uses one repeatable-read snapshot, year metrics and requested stored periods',async()=>{
 const original=prisma.$transaction;let isolation:any;
 prisma.$transaction=(async(fn:any,options:any)=>{isolation=options.isolationLevel;return fn({fundamentalSnapshot:{findFirst:async()=>({source:'KIS_API',collectedAt:new Date('2026-10-16T09:00:00Z'),observedDate:new Date('2026-10-16'),per:new Prisma.Decimal('12.5'),listedShares:new Prisma.Decimal('1000000'),foreignHoldingShares:new Prisma.Decimal('250000'),foreignHoldingRatio:new Prisma.Decimal('25'),foreignExhaustionRate:new Prisma.Decimal('30')})},dartShareSnapshot:{findMany:async()=>[]},periodValuation:{findMany:async()=>[]},dartBackfillTask:{findMany:async()=>[]},security:{findMany:async()=>[],findUnique:async()=>({id:1n,name:'종목',symbol:'001',isActive:true,marketPrice:{currentPrice:new Prisma.Decimal(10000),priceUpdatedAt:new Date()}})},financialStatement:{findMany:async()=>[]},dartFinancialFiling:{findMany:async()=>[]},valuationMetric:{findMany:async()=>[{metricDate:new Date('2026-10-05'),bps:new Prisma.Decimal(10000),roe:new Prisma.Decimal(10)}]}});}) as unknown as typeof original;
 const app=buildAnalysisTestApp();try{const response=await app.inject('/api/value-analysis/1?year=2026&mode=quarter&startYear=2025&startQuarter=4&count=10');assert.equal(response.statusCode,200);const data=response.json().data;assert.equal(isolation,'RepeatableRead');assert.equal(data.currentSupplement.basis,'CURRENT_REFERENCE_ONLY');assert.equal(data.currentSupplement.per,'12.5');assert.equal(data.currentSupplement.foreignHoldingRatio,'25');assert.equal(data.currentSupplement.foreignExhaustionRate,'30');assert.equal(data.rows.length,10);assert.equal(data.rows[0].key,'2025:Q4');assert.equal(data.rows.at(-1).key,'2028:Q1');assert.equal(data.w,null);assert.equal(data.fairPrices[1].price,null);assert.equal(data.rows[0].currentRatio,null);assert.equal((await app.inject('/api/value-analysis/1?mode=invalid')).statusCode,400);assert.equal((await app.inject('/api/value-analysis/1?count=11')).statusCode,400);}finally{await app.close();prisma.$transaction=original;}
});


test('no daily snapshot briefly reuses revision-keyed stored-data fallback without external collection', async () => {
 const original=prisma.security.findMany;let joins=0,price=10000;
 prisma.security.findMany=(async(input:any)=>{
  if(input.include){joins++;await new Promise(resolve=>setTimeout(resolve,20));return [{id:1n,name:'종목',symbol:'001',financialStatements:[annual(2025)],dartFinancialFilings:[],valuationMetrics:[{metricDate:new Date('2025-12-31'),bps:new Prisma.Decimal(10000),roe:new Prisma.Decimal(10)}],marketPrice:{currentPrice:new Prisma.Decimal(price),previousClosePrice:new Prisma.Decimal(9000),priceUpdatedAt:new Date()}}];}
  return [{id:1n,marketPrice:{currentPrice:new Prisma.Decimal(price),previousClosePrice:new Prisma.Decimal(9000),priceUpdatedAt:new Date()}}];
 }) as unknown as typeof original;
 const app=buildAnalysisTestApp();try{
  await Promise.all([app.inject('/api/value-analysis?year=2026'),app.inject('/api/value-analysis?year=2026')]);assert.equal(joins,1);
  price=20000;const response=await app.inject('/api/value-analysis?year=2026');assert.equal(response.json().data.rows[0].w,'1.2');assert.equal(joins,1);
  await app.inject('/api/value-analysis?year=2025');assert.equal(joins,2);
  app.valueReadModel.clear();assert.equal((await app.inject('/api/value-analysis?year=2026')).json().data.rows[0].w,'0.6');assert.equal(joins,3);
 }finally{await app.close();prisma.security.findMany=original;}
});

test('initial search filters full master without changing live-price or year selection', async()=>{
 const original=prisma.security.findMany;
 const rows=[{id:1n,name:'삼성전자',symbol:'005930',valuationMetrics:[],marketPrice:null},{id:2n,name:'현대차',symbol:'005380',valuationMetrics:[],marketPrice:null}];
 prisma.security.findMany=(async(input:any)=>{assert.equal(input.where.isActive,true);assert.equal(input.where.OR,undefined);return rows;}) as unknown as typeof original;
 const app=buildAnalysisTestApp();try{
  for(const [query,expected] of [['ㅅㅅㅈㅈ','삼성전자'],['ㅎㄷㅊ','현대차'],['삼성ㅈㅈ','삼성전자']] as const){
   const response=await app.inject('/api/value-analysis?year=2025&query='+encodeURIComponent(query));assert.equal(response.statusCode,200);assert.deepEqual(response.json().data.rows.map((r:any)=>r.name),[expected]);assert.equal(response.json().data.year,2025);
  }
  const empty=await app.inject('/api/value-analysis?query='+encodeURIComponent('ㅂㅂㅂ'));assert.equal(empty.json().data.total,0);
 }finally{await app.close();prisma.security.findMany=original;}
});

test('list reads only selected/previous annual source evidence and historical share basis for verified totals',async()=>{
 const original=prisma.security.findMany;let join:any;
 prisma.security.findMany=(async(input:any)=>{if(input.include)join=input;return [];}) as any;
 const app=buildAnalysisTestApp();try{
  assert.equal((await app.inject('/api/value-analysis?year=2025')).statusCode,200);
  assert.deepEqual(join.include.fundamentals,{select:{updatedAt:true,collectionSymbol:true,securityId:true}});
  assert.equal(join.include.dartFinancialFilings.omit,undefined);
  assert.equal(join.include.dartFinancialFilings.where.periodType,undefined);assert.deepEqual(join.include.dartFinancialFilings.where.fiscalYear,{gte:2024,lte:2025});
  assert.equal(join.include.dartFinancialFilings.where.isWithdrawn,false);
  assert.deepEqual(join.include.dartShareSnapshots.where.fiscalYear,{lte:2025});
 }finally{await app.close();prisma.security.findMany=original;}
});

test('annual estimate displays stored interim shares without using them as a RIM denominator',async()=>{
 const original=prisma.security.findMany;
 const date=new Date('2026-06-30'),receipt='20260814003509';
 const row={id:39n,symbol:'000660',name:'SK test',isActive:true,marketPrice:{currentPrice:new Prisma.Decimal(100),priceUpdatedAt:new Date()},valuationMetrics:[],periodValuations:[{fiscalYear:2026,periodType:'ESTIMATE',values:{bps:'526869.36',roe:'102.88'},provenance:{fsDivision:'CFS',roeBasis:'OWNERS_OF_PARENT',source:'NAVER_FNGUIDE_ANNUAL'},supplemental:{manualSource:{kind:'ANNUAL_ESTIMATE',fiscalYear:2026}}}],financialStatements:[],dartFinancialFilings:[{fiscalYear:2026,periodType:'Q2',periodEndDate:date,receiptNo:receipt,receiptDate:new Date('2026-08-14'),isWithdrawn:false}],dartShareSnapshots:[{receiptNo:receipt,shareClass:'COMMON',stockKind:'보통주',fiscalYear:2026,reportCode:'11012',periodEndDate:date,collectedAt:new Date('2026-10-09'),issuedShares:new Prisma.Decimal(712702365),treasuryShares:new Prisma.Decimal(1626865),outstandingShares:new Prisma.Decimal(711075500)}]};
 prisma.security.findMany=(async()=>[row]) as any;const app=buildAnalysisTestApp();
 try{const r=await app.inject('/api/value-analysis?year=2026&query=000660');assert.equal(r.statusCode,200,r.body);const v=r.json().data.rows[0];assert.equal(v.issuedShares,'712702365');assert.equal(v.treasuryShares,'1626865');assert.equal(v.outstandingShares,'711075500');assert.equal(v.shareBasis.receiptNo,receipt);assert.equal(v.excessEarnings,null);assert.match(v.rimReason,/분모/);assert.equal(v.fairPrices[1].price,'5525805.84768');}
 finally{await app.close();prisma.security.findMany=original;}
});

test('both list APIs apply whole-result multi-sort with null last and stable ties',async()=>{
 const original=prisma.security.findMany;
 prisma.security.findMany=(async()=>[5,10,null].map((eps,i)=>({id:BigInt(i+1),name:'정렬 종목'+i,symbol:String(i+1).padStart(6,'0'),marketType:'KOSPI',marketPrice:{currentPrice:new Prisma.Decimal(100),priceUpdatedAt:new Date()},financialStatements:[],valuationMetrics:[],dartFinancialFilings:[],periodValuations:[{fiscalYear:2025,periodType:'ANNUAL',values:{eps:eps===null?null:String(eps),bps:'100',roe:'10'},provenance:{periodEnd:'2025-12-31',fsDivision:'OFS'},supplemental:{}}]}))) as any;
 const app=buildAnalysisTestApp();try{
  for(const path of ['/api/value-analysis','/api/financial-statements']){
   const result=await app.inject(path+'?year=2026&sorts=w:desc,eps:desc');assert.equal(result.statusCode,200,result.body);assert.deepEqual(result.json().data.rows.map((r:any)=>r.id),['2','1','3']);assert.deepEqual(result.json().data.sorts,[{key:'w',direction:'desc'},{key:'eps',direction:'desc'}]);
   assert.deepEqual((await app.inject(path+'?year=2026&sorts=eps:asc')).json().data.rows.map((r:any)=>r.id),['1','2','3']);assert.equal((await app.inject(path+'?sorts=w:asc,w:desc')).statusCode,400);
  }
 }finally{await app.close();prisma.security.findMany=original;}
});

test('bounded card response preserves complete sorted navigation and legacy full response',async()=>{
 const original=prisma.security.findMany;
 prisma.security.findMany=(async()=>Array.from({length:45},(_,i)=>({id:BigInt(i+1),name:'종목'+i,symbol:String(i+1).padStart(6,'0'),valuationMetrics:[],marketPrice:null}))) as unknown as typeof original;
 const app=buildAnalysisTestApp();
 try {
  const full=(await app.inject('/api/value-analysis?year=2026&query=종목&compact=1')).json().data;
  const response=await app.inject('/api/value-analysis?year=2026&query=종목&compact=1&limit=20');assert.equal(response.statusCode,200);
  const limited=response.json().data;
  assert.equal(limited.total,45);assert.equal(limited.rows.length,20);assert.deepEqual(limited.rows,full.rows.slice(0,20));
  assert.deepEqual(limited.navigation,full.rows.map(({id,name,symbol}:any)=>({id,name,symbol})));
  assert.equal((await app.inject('/api/value-analysis?year=2026&query=종목&limit=40')).json().data.rows.length,40);
  const next=(await app.inject('/api/value-analysis?year=2026&query=종목&compact=1&limit=30&offset=20')).json().data;assert.deepEqual(next.rows,full.rows.slice(20,50));assert.equal(next.navigation,undefined);
  assert.equal((await app.inject('/api/value-analysis?offset=-1')).statusCode,400);
  assert.equal((await app.inject('/api/value-analysis?limit=0')).statusCode,400);
  assert.equal((await app.inject('/api/value-analysis?limit=bad')).statusCode,400);
 }finally{await app.close();prisma.security.findMany=original;}
});

test('value market selection scopes rows, count and navigation, while legacy callers keep both markets',async()=>{
 const original=prisma.security.findMany;
 prisma.security.findMany=(async()=>[{id:1n,name:'코스피 종목',symbol:'000001',marketType:'KOSPI',marketPrice:null,valuationMetrics:[]},{id:2n,name:'코스닥 종목',symbol:'000002',marketType:'KOSDAQ',marketPrice:null,valuationMetrics:[]}]) as any;
 const app=buildAnalysisTestApp();try{
  for(const [market,id] of [['KOSPI','1'],['KOSDAQ','2']]){const response=await app.inject('/api/value-analysis?year=2026&limit=20&market='+market);assert.equal(response.statusCode,200);const data=response.json().data;assert.equal(data.total,1);assert.deepEqual(data.rows.map((r:any)=>r.id),[id]);assert.deepEqual(data.navigation.map((r:any)=>r.id),[id]);}
  assert.equal((await app.inject('/api/value-analysis?year=2026')).json().data.total,2);
  assert.equal((await app.inject('/api/value-analysis?market=bad')).statusCode,400);
 }finally{await app.close();prisma.security.findMany=original;}
});
