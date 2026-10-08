import assert from 'node:assert/strict';
import test from 'node:test';
import {prisma} from '../src/lib/prisma.js';
import {buildApp} from '../src/app.js';
import {refreshManualAnnual} from '../src/collector/manual-annual-prototype.js';
import {NaverAnnualError,type NaverAnnualProvider,type NaverAnnual} from '../src/collector/naver-annual.js';
import type {OpenDartProvider} from '../src/collector/dart-provider.js';
import {PrismaDartRepository} from '../src/collector/dart-repository.js';
import {getSeoulClock} from '../src/collector/time.js';

test('manual source -> real DB -> value/security APIs agree; estimates are separate and failure preserves stored values',async()=>{
 const year=Number(getSeoulClock().dateKey.slice(0,4)),app=buildApp();
 const security=await prisma.security.create({data:{symbol:'989197',name:'Manual prototype integration',marketType:'OTHER'}});
 const repository=new PrismaDartRepository(prisma);
 const provider={listPeriodicReports:async()=>{throw Error('complete stored disclosure must not be refetched');},fetchFinancials:async()=>{throw Error('not needed');}} as unknown as OpenDartProvider;
 const source=(fiscalYear:number):NaverAnnual=>({fiscalYear,kind:fiscalYear===year?'ANNUAL_ESTIMATE':'FINAL_ANNUAL',division:'CFS',values:{eps:'10',bps:'100',per:'10',pbr:'1',roe:'10'},financials:{revenue:'100',operatingProfit:'20',netIncome:'10'},source:'NAVER_FNGUIDE_ANNUAL',sourceUrl:'https://navercomp.wisereport.co.kr/v3/company/c1010001.aspx?cmp_cd=989197',collectedAt:new Date().toISOString(),pricePolicy:fiscalYear===year?'PREVIOUS_BUSINESS_DAY_ADJUSTED_ORDINARY':'ADJUSTED_ORDINARY_YEAR_END',priceDate:null,sharePolicy:'PROVIDER_ADJUSTED_ORDINARY_AND_PREFERRED_DENOMINATOR',formulas:{per:'ordinary adjusted year-end / source EPS',pbr:'ordinary adjusted year-end / source BPS'}});
 const naver={annual:async()=>[source(year-1),source(year)]} as unknown as NaverAnnualProvider;
 const target={...security,dartCorpMapping:null};
 try{
  await prisma.dartFinancialFiling.create({data:{securityId:security.id,fiscalYear:year-1,periodType:'ANNUAL',reportCode:'11011',fsDivision:'CFS',receiptNo:'98919700000001',reportName:'integration annual',periodEndDate:new Date(`${year-1}-12-31`),receiptDate:new Date(`${year}-03-01`),collectedAt:new Date(),revenueYtd:'100',operatingProfitYtd:'20',netIncomeYtd:'10',totalAssets:'1000',totalLiabilities:'500',totalEquity:'500'}});
  await prisma.periodValuation.create({data:{securityId:security.id,fiscalYear:year-1,periodType:'ANNUAL',status:'PARTIAL',values:{eps:'9'},provenance:{source:'OPEN_DART'},reasons:{per:'missing'},supplemental:{price:{value:'100',date:`${year-1}-12-30`,source:'KRX_UNADJUSTED_CLOSE'}}}});
  await refreshManualAnnual(prisma,target,year-1,provider,naver,repository,1n);
  await refreshManualAnnual(prisma,target,year,provider,naver,repository,1n);
  for(const selectedYear of [year-1,year]){
   const value=await app.inject(`/api/value-analysis/${security.id}?year=${selectedYear}&startYear=${selectedYear}&count=1`),analysis=await app.inject(`/api/securities/${security.id}/analysis?fiscalYear=${selectedYear}`);
   assert.equal(value.statusCode,200,value.body);assert.equal(analysis.statusCode,200,analysis.body);
   assert.deepEqual(value.json().data.valuation,analysis.json().data.valuation);
   assert.equal(value.json().data.rows[0].per,'10');assert.equal(value.json().data.rows[0].collectionState,selectedYear===year?'ESTIMATE_READY':'COMPLETE');assert.equal(value.json().data.rows[0].isEstimated,selectedYear===year);
  }
  assert.equal(await prisma.annualConsensusSnapshot.count({where:{securityId:security.id}}),1);
  const before=await prisma.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:'ESTIMATE'}}});
  const failed={annual:async()=>{throw new NaverAnnualError('NAVER_COMMUNICATION');}} as unknown as NaverAnnualProvider;
  await refreshManualAnnual(prisma,target,year,provider,failed,repository,2n);
  const after=await prisma.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:'ESTIMATE'}}});
  assert.deepEqual(before.values,after.values);assert.equal((after.supplemental as any).manualAttempt.state,'FINAL_FAILED');
  const api=await app.inject(`/api/value-analysis/${security.id}?year=${year}&startYear=${year}&count=1`);assert.equal(api.json().data.rows[0].collectionState,'FINAL_FAILED');assert.equal(api.json().data.rows[0].per,'10');
 }finally{
  await app.close();await prisma.annualConsensusSnapshot.deleteMany({where:{securityId:security.id}});await prisma.periodValuation.deleteMany({where:{securityId:security.id}});await prisma.dartFinancialFiling.deleteMany({where:{securityId:security.id}});await prisma.security.delete({where:{id:security.id}});await prisma.$disconnect();
 }
});
