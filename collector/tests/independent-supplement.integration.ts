import test from 'node:test';import assert from 'node:assert/strict';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {runIndependentSupplement} from '../src/independent-valuation-supplement.js';
import type {Supplemental} from '@roxstock/shared/domain/period-valuation';
const url=new URL(process.env.DATABASE_URL??'');if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_phase16_test'))throw Error('Isolated test DB required');
test('automatic common period supplementation preserves originals/manual values and retries safely',async()=>{
 const suffix=Date.now(),security=await db.security.create({data:{symbol:'SUP'+suffix,name:'supplement fixture',marketType:'KOSPI'}});
 const old=process.env.VALUATION_SUPPLEMENT_ENABLED;process.env.VALUATION_SUPPLEMENT_ENABLED='true';let calls=0;
 const share=(receiptNo:string,year:number)=>({receiptNo,preferred:false,outstanding:'10',rows:[{stockKind:'보통주',shareClass:'COMMON',issuedShares:'10',treasuryShares:'0',outstandingShares:'10',periodEndDate:year+'-12-31'}]});
 const where={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:2022,periodType:'ANNUAL' as const}};
 try{
  for(const year of [2021,2022]){const receiptNo='99999999999'+String(year-2000).padStart(3,'0');await db.dartFinancialFiling.create({data:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL',reportCode:'11011',fsDivision:'OFS',receiptNo,reportName:'test',receiptDate:new Date((year+1)+'-03-10'),periodEndDate:new Date(year+'-12-31'),collectedAt:new Date(),normalizationVersion:3,revenueYtd:'100',operatingProfitYtd:'10',netIncomeYtd:'10',totalAssets:'120',totalLiabilities:'20',totalEquity:'100',accountSources:{basicEps:{amount:'10'},investingCashFlow:{amount:'0'},financingCashFlow:{amount:'0'},cashEquivalents:{amount:'1'}}}});
   if(year===2021)await db.periodValuation.create({data:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL',status:'SUCCESS',values:{eps:'10',bps:'10',per:'5',pbr:'5',roe:'12'},provenance:{},reasons:{},supplemental:{shares:share(receiptNo,year)}}});}
  await db.periodValuation.create({data:{securityId:security.id,fiscalYear:2022,periodType:'ANNUAL',status:'PARTIAL',values:{roe:'12'},provenance:{perMetric:{roe:{source:'MANUAL'}}},reasons:{}}});
  const before=await db.dartFinancialFiling.findMany({where:{securityId:security.id}});
  const load:NonNullable<Parameters<typeof runIndependentSupplement>[3]>['load']=async(f,saved)=>{calls++;return {...saved,shares:share(f!.receiptNo,f!.fiscalYear),price:{value:'50',date:f!.fiscalYear+'-12-30',source:'TEST_ORIGINAL'}} as Supplemental;};
  const options={load,sleep:async()=>{}};
  assert.equal((await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},new Date(),options)).status,'SUCCESS');assert.equal(calls,1);
  const saved=await db.periodValuation.findUniqueOrThrow({where});assert.equal(saved.status,'SUCCESS');assert.equal((saved.values as any).per,'5');assert.equal((saved.values as any).roe,'12');assert.equal((saved.provenance as any).perMetric.roe.source,'MANUAL');
  assert.deepEqual(await db.dartFinancialFiling.findMany({where:{securityId:security.id}}),before);
  assert.equal((await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},new Date(),options)).status,'IDLE');
  await db.periodValuation.update({where,data:{values:{roe:'12'},status:'PARTIAL',nextAttemptAt:null}});
  const failing={load:async()=>{throw Object.assign(Error('fixture'),{code:'KIS_PRICE_PROVIDER'});},sleep:async()=>{}};
  assert.equal((await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},new Date(),failing)).status,'PARTIAL');
  const preserved=await db.periodValuation.findUniqueOrThrow({where});assert.deepEqual(preserved.values,{roe:'12'});assert.equal(preserved.status,'PARTIAL');assert.ok(preserved.nextAttemptAt);
 }finally{if(old===undefined)delete process.env.VALUATION_SUPPLEMENT_ENABLED;else process.env.VALUATION_SUPPLEMENT_ENABLED=old;await db.dartShareSnapshot.deleteMany({where:{securityId:security.id}});await db.periodValuation.deleteMany({where:{securityId:security.id}});await db.dartFinancialFiling.deleteMany({where:{securityId:security.id}});await db.security.delete({where:{id:security.id}});await db.$disconnect();}
});
