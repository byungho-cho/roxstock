import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../app.js';
import {prisma} from '../lib/prisma.js';
import {Prisma} from '../generated/prisma/index.js';
test('financial list only reads stored records and missing numbers sort last in both directions',async()=>{
 const original=prisma.security.findMany;let args:any;
 prisma.security.findMany=(async(input:any)=>{args=input;return [{id:2n,name:'누락',symbol:'002',marketType:'KOSPI',marketPrice:null,fundamentals:null,valuationMetrics:[],financialStatements:[],dartFinancialFilings:[]},{id:1n,name:'저장',symbol:'001',marketType:'KOSPI',marketPrice:{currentPrice:new Prisma.Decimal(100),priceUpdatedAt:new Date()},fundamentals:null,valuationMetrics:[],financialStatements:[],dartFinancialFilings:[]}];}) as unknown as typeof original;
 const app=buildApp();try{for(const direction of ['asc','desc']){const res=await app.inject('/api/financial-statements?year=2025&market=KOSPI&sort=currentPrice&direction='+direction);assert.equal(res.statusCode,200);assert.equal(res.json().data.rows[0].id,'1');assert.equal(res.json().data.rows[1].currentPrice,null);}assert.equal(args.include.financialStatements.where.fiscalYear,2025);assert.equal(args.where.marketType,'KOSPI');assert.equal((await app.inject('/api/financial-statements?sort=bad')).statusCode,400);}finally{await app.close();prisma.security.findMany=original;}
});
test('financial detail keeps exactly three periods across a year boundary without a write',async()=>{
 const original=prisma.$transaction;let isolation:string|undefined;
 prisma.$transaction=(async(fn:any,options:any)=>{isolation=options.isolationLevel;return fn({security:{findUnique:async()=>({id:1n,isActive:true,name:'저장',symbol:'001'})},financialStatement:{findMany:async()=>[]},dartFinancialFiling:{findMany:async()=>[]},periodValuation:{findMany:async()=>[]},valuationMetric:{findMany:async()=>[]}});}) as unknown as typeof original;
 const app=buildApp();try{const res=await app.inject('/api/financial-statements/1?startYear=2025&startQuarter=4&mode=quarter');assert.equal(res.statusCode,200);assert.equal(isolation,'RepeatableRead');assert.deepEqual(res.json().data.rows.map((r:any)=>r.key),['2025:Q4','2026:Q1','2026:Q2']);assert.equal(res.json().data.rows[0].values.revenue,null);assert.equal((await app.inject('/api/financial-statements/1?startQuarter=5&mode=quarter')).statusCode,400);
 for(const y of [2015,2016,2017,2018,2019,2024,2026]){const r=await app.inject('/api/financial-statements/1?endYear='+y);const end=Math.max(2018,y);assert.deepEqual(r.json().data.rows.map((x:any)=>x.year),[end-2,end-1,end]);}
 const legacy=await app.inject('/api/financial-statements/1?startYear=2024');assert.deepEqual(legacy.json().data.rows.map((x:any)=>x.year),[2024,2025,2026]);
 const custom=await app.inject('/api/financial-statements/1?startYear=2015&endYear=2017&period=ANNUAL');assert.deepEqual(custom.json().data.rows.map((x:any)=>x.year),[2015,2016,2017]);
 const all=await app.inject('/api/financial-statements/1?startYear=2024&endYear=2025&period=ALL');assert.equal(all.json().data.rows.length,8);
 assert.equal((await app.inject('/api/financial-statements/1?startYear=2025&endYear=2024&period=ALL')).statusCode,400);}finally{await app.close();prisma.$transaction=original;}
});
