import test from 'node:test';
import assert from 'node:assert/strict';
import {prisma as db} from '../src/lib/prisma.js';
import {runIndependentSupplement} from '../src/collector/independent-valuation-supplement.js';
import type {NaverAnnualProvider, NaverAnnual} from '../src/collector/naver-annual.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_phase16_test'))throw Error('Isolated test DB required');
test('independent supplement uses stored filings only, preserves manual values and retries without DART',async()=>{
 const suffix=Date.now();
 const collected=await db.security.create({data:{symbol:'SUP'+suffix,name:'supplement fixture',marketType:'KOSPI'}});
 const absent=await db.security.create({data:{symbol:'ABS'+suffix,name:'no filing fixture',marketType:'KOSPI'}});
 const config={windowStartHour:0,windowEndHour:24};
 const previousEnabled=process.env.VALUATION_SUPPLEMENT_ENABLED;process.env.VALUATION_SUPPLEMENT_ENABLED='true';
 const calls:string[]=[];const source={annual:async(symbol:string)=>{calls.push(symbol);return [2021,2022].map(fiscalYear=>({fiscalYear,kind:'FINAL_ANNUAL',division:'CFS',source:'NAVER_FNGUIDE_ANNUAL',values:{eps:'10',bps:'100',per:'5',pbr:'0.5',roe:'8'}} as NaverAnnual));}} as NaverAnnualProvider;
 const where={securityId_fiscalYear_periodType:{securityId:collected.id,fiscalYear:2022,periodType:'ANNUAL' as const}};
 try{
  for(const year of [2021,2022])await db.dartFinancialFiling.create({data:{securityId:collected.id,fiscalYear:year,periodType:'ANNUAL',reportCode:'11011',fsDivision:'CFS',receiptNo:'99999999999'+String(year-2000).padStart(3,'0'),reportName:'test',receiptDate:new Date(`${year+1}-03-10`),periodEndDate:new Date(`${year}-12-31`),collectedAt:new Date()}});
  await db.periodValuation.create({data:{securityId:collected.id,fiscalYear:2022,periodType:'ANNUAL',status:'PARTIAL',values:{roe:'12'},provenance:{perMetric:{roe:{source:'MANUAL'}}},reasons:{}}});
  const before=await db.dartFinancialFiling.findMany({where:{securityId:collected.id}});
  const result=await runIndependentSupplement(db,config,new Date(),source);assert.equal(result.status,'SUCCESS');
  assert.ok(calls.length>0);assert.ok(calls.every(s=>s===collected.symbol));
  const saved=await db.periodValuation.findUniqueOrThrow({where});assert.equal(saved.status,'SUCCESS');assert.equal((saved.values as any).roe,'12');assert.equal((saved.values as any).per,'5');assert.equal((saved.provenance as any).perMetric.roe.source,'MANUAL');
  assert.deepEqual(await db.dartFinancialFiling.findMany({where:{securityId:collected.id}}),before);
  assert.equal(await db.periodValuation.count({where:{securityId:absent.id}}),0);
  calls.length=0;assert.equal((await runIndependentSupplement(db,config,new Date(),source)).status,'IDLE');assert.equal(calls.length,0);
  await db.periodValuation.update({where,data:{values:{roe:'12'},status:'PARTIAL',nextAttemptAt:null}});
  const failing={annual:async()=>{throw Object.assign(Error('fixture'),{code:'NAVER_UNAVAILABLE'});}} as unknown as NaverAnnualProvider;
  assert.equal((await runIndependentSupplement(db,config,new Date(),failing)).status,'PARTIAL');
  const preserved=await db.periodValuation.findUniqueOrThrow({where});assert.deepEqual(preserved.values,{roe:'12'});assert.equal(preserved.status,'PARTIAL');assert.ok(preserved.nextAttemptAt);assert.equal((preserved.supplemental as any).independentAttempt.code,'NAVER_UNAVAILABLE');
  assert.equal((await runIndependentSupplement(db,config,new Date(),source)).status,'IDLE');
 }finally{
  if(previousEnabled===undefined)delete process.env.VALUATION_SUPPLEMENT_ENABLED;else process.env.VALUATION_SUPPLEMENT_ENABLED=previousEnabled;
  await db.periodValuation.deleteMany({where:{securityId:collected.id}});await db.dartFinancialFiling.deleteMany({where:{securityId:collected.id}});await db.security.deleteMany({where:{id:{in:[collected.id,absent.id]}}});await db.$disconnect();
 }
});
