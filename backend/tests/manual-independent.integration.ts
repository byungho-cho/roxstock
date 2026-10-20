import assert from 'node:assert/strict';
import test from 'node:test';
import {prisma} from '@roxstock/shared/lib/prisma';
import {buildApp} from '../src/auth/route-test-app.js';
import {enqueueManualRefresh,parseManualRefresh,type ManualRefreshMetadata} from '../../collector/src/dart-manual-refresh.js';
import {processIndependentRefresh,manualLimits} from '../../collector/src/manual-refresh-jobs.js';
import {NaverAnnualProvider,NaverAnnualError,type NaverAnnual} from '../../collector/src/naver-annual.js';
import {OpenDartProvider,DartApiError,mapPeriodicReports,type DartFinancialRow} from '../../collector/src/dart-provider.js';
import type {DartCollectorConfig} from '../../collector/src/dart-collector.js';
import {getSeoulClock} from '@roxstock/shared/collection/time';

// Isolated CI MariaDB only; no real provider request or production data is used.
test('independent manual API/job real DB: idempotency, faults, zero preservation, full statement refresh and lock release',async()=>{
 const year=Number(getSeoulClock().dateKey.slice(0,4))-1,app=buildApp();
 const security=await prisma.security.create({data:{symbol:'989178',name:'Independent manual integration',marketType:'OTHER',securityType:'STOCK'}});
 const mapping=await prisma.dartCorpMapping.create({data:{securityId:security.id,stockCode:security.symbol,corpCode:'98917801',corpName:'Integration',sourceModifiedAt:'20261010',syncedAt:new Date()}});
 const receipt='98917800000017',price={value:'100',date:`${year}-12-30`,source:'KRX_UNADJUSTED_CLOSE'};
 const old={list:OpenDartProvider.prototype.listPeriodicReports,financials:OpenDartProvider.prototype.fetchFinancials,shares:OpenDartProvider.prototype.fetchPeriodShares,naver:NaverAnnualProvider.prototype.annual,limit:manualLimits.taskMs};
 let failure:'error'|'timeout'|'none'='error',naverFailed=false,dartCalls=0;
 const source:NaverAnnual={fiscalYear:year,kind:'FINAL_ANNUAL',division:'CFS',values:{eps:'10',bps:'100',per:'10',pbr:'1',roe:'0'},financials:{},source:'NAVER_FNGUIDE_ANNUAL',sourceUrl:'https://example.invalid',collectedAt:new Date().toISOString(),pricePolicy:'ADJUSTED_ORDINARY_YEAR_END',priceDate:null,sharePolicy:'PROVIDER_ADJUSTED_ORDINARY_AND_PREFERRED_DENOMINATOR',formulas:{}};
 OpenDartProvider.prototype.listPeriodicReports=async()=>{dartCalls++;if(failure==='timeout')return new Promise(()=>{});if(failure==='error')throw new DartApiError('HTTP_ERROR','Injected failure');return mapPeriodicReports([{corp_code:mapping.corpCode,rcept_no:receipt,rcept_dt:`${year+1}0301`,report_nm:`사업보고서 (${year}.12)`}],year);};
 OpenDartProvider.prototype.fetchFinancials=async()=>[
 ['ifrs-full_Revenue','매출액','0'],['ifrs-full_ProfitLoss','당기순이익','10'],['ifrs-full_Equity','자본총계','1000'],['ifrs-full_Assets','자산총계','1000'],['ifrs-full_Liabilities','부채총계','0'],['ifrs-full_BasicEarningsLossPerShare','기본주당이익','10'],['ifrs-full_EquityAttributableToOwnersOfParent','지배기업 소유주지분','1000'],['ifrs-full_ProfitLossAttributableToOwnersOfParent','지배기업 소유주 귀속 당기순이익','10'],['ifrs-full_CashAndCashEquivalents','현금및현금성자산','100'],['ifrs-full_CashFlowsFromUsedInInvestingActivities','투자활동현금흐름','0'],['ifrs-full_CashFlowsFromUsedInFinancingActivities','재무활동현금흐름','0']
 ].map(([accountId,accountName,amount])=>({receiptNo:receipt,statementDivision:/(Assets|Liabilities|Equity|CashAndCashEquivalents)/.test(accountId!)?'BS':accountId!.includes('CashFlows')?'CF':'IS',statementName:'테스트 재무제표',accountId,accountName,currentAmount:accountId==='ifrs-full_Revenue'&&failure!=='none'?'100':amount,currentYtdAmount:accountId==='ifrs-full_Revenue'&&failure!=='none'?'100':amount,currency:'KRW',fiscalYear:year,reportCode:'11011',corpCode:mapping.corpCode})) as DartFinancialRow[];
 OpenDartProvider.prototype.fetchPeriodShares=async()=>({receiptNo:receipt,outstanding:'100',preferred:false,rows:[{stockKind:'보통주',shareClass:'COMMON',issuedShares:'100',treasuryShares:'0',outstandingShares:'100',periodEndDate:year+'-12-31'}]});
 NaverAnnualProvider.prototype.annual=async()=>{if(naverFailed)throw new NaverAnnualError('NAVER_COMMUNICATION');return [source];};
 manualLimits.taskMs=1000;
 const config={enabled:true,apiKey:'fake',minDelayMs:0,dailyCallLimit:100} as DartCollectorConfig;
 const run=async(mode:'FULL'|'SUPPLEMENT',suffix:string)=>{
  const input=parseManualRefresh({fiscalYear:year,period:'ANNUAL',refreshMode:mode,clientRequestId:'phase17-integration-'+suffix});
  const request=await enqueueManualRefresh(prisma,security.id,input);
  assert.equal((await enqueueManualRefresh(prisma,security.id,input)).id,request.id);
  const active=await app.inject(`/api/securities/${security.id}/financial-refresh/active`);assert.equal(active.json().data.requestId,String(request.id));
  await processIndependentRefresh(prisma,config,request);
  const saved=await prisma.collectorRun.findUniqueOrThrow({where:{id:request.id}});assert.equal((saved.metadata as unknown as ManualRefreshMetadata).manualState,'FINISHED');
  assert.equal(await prisma.collectorLock.count({where:{jobName:'dart-financial-statements'}}),0);
  assert.equal((await app.inject(`/api/securities/${security.id}/financial-refresh/active`)).json().data,null);
  return saved;
 };
 try{
  await prisma.dartFinancialFiling.create({data:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL',reportCode:'11011',fsDivision:'CFS',receiptNo:receipt,reportName:`사업보고서 (${year}.12)`,periodEndDate:new Date(`${year}-12-31`),receiptDate:new Date(`${year+1}-03-01`),collectedAt:new Date(),revenueYtd:'100',operatingProfitYtd:'0',netIncomeYtd:'10',totalAssets:'1000',totalLiabilities:'0',totalEquity:'1000'}});
  await prisma.periodValuation.create({data:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL',status:'PARTIAL',values:{roe:'0'},provenance:{},reasons:{},supplemental:{price,basis:{receiptNo:receipt,source:'FIXTURE_SAME_RECEIPT',verifiedAt:new Date().toISOString(),epsPriceCompatible:true,bpsPriceCompatible:true}}}});
  let saved=await run('FULL','first');assert.equal(saved.status,'PARTIAL');assert.equal((saved.metadata as any).results[0].tasks.valuation.state,'SUCCESS',JSON.stringify(await prisma.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL'}}}),(_,v)=>typeof v==='bigint'?String(v):v));
  failure='timeout';saved=await run('FULL','timeout');assert.equal(saved.status,'PARTIAL');assert.equal((saved.metadata as any).results[0].tasks.dart.code,'DART_TIMEOUT');
  const before=await prisma.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL'}}});const requests=dartCalls;
  await run('SUPPLEMENT','supplement');assert.equal(dartCalls,requests);const after=await prisma.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL'}}});assert.deepEqual(after.values,before.values);assert.equal((after.values as any).roe,'0');
  naverFailed=true;failure='error';saved=await run('FULL','both-fail');assert.equal(saved.status,'PARTIAL');const preserved=await prisma.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:'ANNUAL'}}});assert.deepEqual(preserved.values,before.values);
  naverFailed=false;failure='none';saved=await run('FULL','zero');assert.equal(saved.status,'SUCCESS');const filing=await prisma.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo:receipt}});assert.equal(filing.revenueYtd?.toString(),'0');assert.equal(filing.netIncomeYtd?.toString(),'10');assert.equal(filing.totalLiabilities?.toString(),'0');
  const result=await app.inject(`/api/securities/${security.id}/financial-refresh/${saved.id}`);assert.equal(result.statusCode,200);assert.equal(result.json().data.counts.valuationCompleted,1);assert.equal(result.json().data.state,'FINISHED');
 }finally{
  OpenDartProvider.prototype.listPeriodicReports=old.list;OpenDartProvider.prototype.fetchFinancials=old.financials;NaverAnnualProvider.prototype.annual=old.naver;OpenDartProvider.prototype.fetchPeriodShares=old.shares;manualLimits.taskMs=old.limit;
  await app.close();await prisma.collectorRun.deleteMany({where:{jobType:'dart-financial-statements',metadata:{path:'$.securityId',equals:String(security.id)}}});await prisma.dartShareSnapshot.deleteMany({where:{securityId:security.id}});await prisma.periodValuation.deleteMany({where:{securityId:security.id}});await prisma.dartFinancialFiling.deleteMany({where:{securityId:security.id}});await prisma.dartCorpMapping.delete({where:{securityId:security.id}});await prisma.security.delete({where:{id:security.id}});await prisma.$disconnect();
 }
});
