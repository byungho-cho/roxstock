import {buildAnalysisTestApp} from './analysis-test-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../app.js';
import {prisma} from '@roxstock/shared/lib/prisma';
import {Prisma} from '@roxstock/shared/prisma';
import {selectStoredAnalysis} from '@roxstock/shared/domain/stored-analysis';
const d=(v:string)=>new Prisma.Decimal(v),year=Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4));
const estimate:any={fiscalYear:year,periodType:'ESTIMATE',status:'SUCCESS',values:{eps:'10',bps:'200',roe:'20',per:'10',pbr:'0.5'},provenance:{fsDivision:'CFS',roeBasis:'OWNERS_OF_PARENT',perMetric:{eps:{source:'NAVER_FNGUIDE_ANNUAL'},roe:{source:'NAVER_FNGUIDE_ANNUAL'}}},supplemental:{estimateFinancials:{netIncome:'700'},manualSource:{fiscalYear:year,kind:'ANNUAL_ESTIMATE',division:'CFS',source:'NAVER_FNGUIDE_ANNUAL',financials:{netIncome:'700'}}}};
const filing:any={fiscalYear:year-1,periodType:'ANNUAL',fsDivision:'CFS',periodEndDate:new Date(`${year-1}-12-31`),totalEquity:d('1000'),netIncomeYtd:d('100'),collectedAt:new Date()};
const input={year,price:'100',metrics:[],periods:[estimate],manual:[],filings:[filing]};
test('estimate ratios and prior capital have explicit independent bases; never derive income from EPS/shares',()=>{
 const r=selectStoredAnalysis(input);assert.equal(r.eps,'10');assert.equal(r.epsYield,'10');assert.equal(r.targetPrice,'440');assert.equal(r.w,'4.4');assert.equal(r.capital,'1000');assert.equal(r.capitalBasis?.year,year-1);assert.equal(r.capitalBasis?.source,'DART:CFS');assert.equal(r.netIncome,'700');assert.equal(r.netIncomeBasis?.isEstimated,true);assert.equal(r.netIncomeBasis?.unit,'KRW');assert.equal(r.metricBasis.label,`${year}E`);
 const incomplete=selectStoredAnalysis({...input,periods:[{...estimate,supplemental:{estimateFinancials:{netIncome:'999'}}}]});assert.equal(incomplete.netIncome,null);assert.equal(incomplete.missingReasons.netIncome,'ESTIMATE_BASIS_UNCONFIRMED');
 const mismatch=selectStoredAnalysis({...input,periods:[{...estimate,supplemental:{...estimate.supplemental,estimateFinancials:{netIncome:'900'}}}]});assert.equal(mismatch.netIncome,null);assert.equal(mismatch.missingReasons.netIncome,'ESTIMATE_SOURCE_MISMATCH');
 const missing=selectStoredAnalysis({...input,periods:[{...estimate,supplemental:{...estimate.supplemental,estimateFinancials:{}}}]});assert.equal(missing.netIncome,null);assert.equal(missing.missingReasons.netIncome,'NOT_PROVIDED');
});
test('prior annual income and interim YTD cannot fill selected annual income, zero and no price are distinct',()=>{
 const r=selectStoredAnalysis({...input,periods:[]});assert.equal(r.netIncome,null);assert.equal(r.capital,'1000');assert.equal(r.eps,null);
 const actual=selectStoredAnalysis({...input,year:year-1,periods:[],filings:[{...filing,netIncomeYtd:d('0')},{...filing,fiscalYear:year-2,netIncomeYtd:d('999')}]});assert.equal(actual.netIncome,'0');assert.equal(actual.netIncomeBasis?.isEstimated,false);
 const noPrice=selectStoredAnalysis({...input,price:null});assert.equal(noPrice.epsYield,null);assert.equal(noPrice.missingReasons.epsYield,'CURRENT_PRICE_MISSING');
 const interim=selectStoredAnalysis({...input,filings:[{...filing,fiscalYear:year,periodType:'Q2',netIncomeYtd:d('500')}],periods:[{...estimate,periodType:'Q2'}]});assert.equal(interim.netIncome,null);assert.equal(interim.capital,null);assert.equal(interim.metricBasis.label,`${year} 반기`);
});
test('both list APIs select the same stored estimate and price; reads admit ESTIMATE and prior annual only',async()=>{
 const original=prisma.security.findMany;let includes:any;
 const security:any={id:1n,isActive:true,name:'검증종목',symbol:'000001',marketType:'KOSPI',fundamentals:null,dartShareSnapshots:[],marketPrice:{currentPrice:d('100'),priceUpdatedAt:new Date()},valuationMetrics:[],periodValuations:[estimate],financialStatements:[],dartFinancialFilings:[filing]};
 prisma.security.findMany=(async(args:any)=>{if(args.include)includes=args.include;return [security];}) as any;
 const app=buildAnalysisTestApp();try{
  const financial=(await app.inject(`/api/financial-statements?year=${year}&query=000001`)).json().data.rows[0];
  const value=(await app.inject(`/api/value-analysis?year=${year}&query=000001`)).json().data.rows[0];
  for(const k of ['eps','epsYield','roe','w','capital','netIncome','metricBasis','capitalBasis','netIncomeBasis'])assert.deepEqual(financial[k],value[k],k);
  assert.equal(financial.targetPrice,value.fairPrices.find((p:any)=>p.persistence==='0.8').price);assert.deepEqual(includes.periodValuations.where.periodType,{in:['ESTIMATE','ANNUAL']});assert.deepEqual(includes.financialStatements.where.fiscalYear,{gte:year-1,lte:year});
 }finally{await app.close();prisma.security.findMany=original;}
});
