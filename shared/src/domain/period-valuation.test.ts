import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {calculatePeriod,preserveValues} from './period-valuation.js';
const d=(n:number)=>new Prisma.Decimal(n);
function filing(year:number,period='ANNUAL',extra:object={}):DartFinancialFiling{return {securityId:1n,fiscalYear:year,periodType:period,fsDivision:'CFS',receiptNo:'20260301000001',receiptDate:new Date('2026-03-01'),periodEndDate:new Date(`${year}-12-31`),netIncomeYtd:d(20),totalEquity:d(220),accountSources:{},...extra} as DartFinancialFiling;}
test('annual ROE uses same-division average opening/closing equity, with explicit total basis',()=>{const result=calculatePeriod(filing(2025),filing(2024,'ANNUAL',{totalEquity:d(180)}));assert.equal(result.values.roe,'10');assert.equal(result.values.eps,null);assert.equal(result.provenance.roeBasis,'TOTAL_SAME_DIVISION');assert.equal(result.values.per,null);});
test('quarter uses YTD annualization, rejects mixed division and missing historical prices',()=>{const current=filing(2025,'Q2',{netIncomeYtd:d(10)});assert.equal(calculatePeriod(current,filing(2024,'ANNUAL',{totalEquity:d(180)})).values.roe,'10');assert.equal(calculatePeriod(current,filing(2024,'ANNUAL',{fsDivision:'OFS'})).values.roe,null);assert.equal(calculatePeriod(current,undefined,{price:{value:'100',date:'2026-10-07',source:'current'}}).values.per,null);});
test('disclosed EPS, exact-receipt ordinary shares, historical close and preferred share safeguard',()=>{const current=filing(2025,'ANNUAL',{accountSources:{basicEps:{amount:'10'},parentEquity:{amount:'200'}}});const sources={shares:{outstanding:'10',preferred:false,receiptNo:current.receiptNo},price:{value:'100',date:'2025-12-30',source:'FSC'}};const result=calculatePeriod(current,undefined,sources);assert.equal(result.values.eps,'10');assert.equal(result.values.bps,'20');assert.equal(result.values.per,'10');assert.equal(result.values.pbr,'5');assert.equal(calculatePeriod(current,undefined,{...sources,shares:{...sources.shares,preferred:true}}).values.bps,null);assert.equal(calculatePeriod(current,undefined,{...sources,shares:{...sources.shares,receiptNo:'different'}}).values.bps,null);});
test('idempotent preservation includes zero and negative manually stored values',()=>{const values={eps:'10',bps:'20',per:'5',pbr:'2',roe:'10'};assert.deepEqual(preserveValues({eps:'0',roe:'-3'},values),{...values,eps:'0',roe:'-3'});assert.deepEqual(preserveValues(values,values),values);});
test('KRX unadjusted close requires separate split/share-class evidence; EPS/BPS remain available independently',()=>{
 const current=filing(2025,'ANNUAL',{accountSources:{basicEps:{amount:'10'},parentEquity:{amount:'200'}}});
 const inputs={shares:{outstanding:'10',preferred:false,receiptNo:current.receiptNo},price:{value:'100',date:'2025-12-30',source:'KRX_UNADJUSTED_CLOSE',collectedAt:'2026-10-08T00:00:00Z'}};
 const missing=calculatePeriod(current,undefined,inputs);assert.equal(missing.values.eps,'10');assert.equal(missing.values.bps,'20');assert.equal(missing.values.per,null);assert.equal(missing.values.pbr,null);assert.match(missing.reasons.per!,/액면분할/);
 const verified=calculatePeriod(current,undefined,{...inputs,basis:{epsPriceCompatible:true,bpsPriceCompatible:true,source:'FIXTURE_REPORT_BASIS_CHECK',receiptNo:current.receiptNo,verifiedAt:'2026-10-08T00:00:00Z'}});assert.equal(verified.values.per,'10');assert.equal(verified.values.pbr,'5');assert.equal(verified.provenance.priceCollectedAt,'2026-10-08T00:00:00Z');
});
test('stored filings use separately collected exact-receipt accounts without altering the original financial sources',()=>{
 const f=filing(2025);const inputs={accounts:{receiptNo:f.receiptNo,fsDivision:'CFS',collectedAt:'2026-10-08T00:00:00Z',sources:{basicEps:{amount:'10'},parentEquity:{amount:'200'}}},shares:{outstanding:'10',preferred:false,receiptNo:f.receiptNo},price:{value:'100',date:'2025-12-30',source:'FSC'}};
 const result=calculatePeriod(f,undefined,inputs);assert.equal(result.values.per,'10');assert.equal(result.values.pbr,'5');assert.deepEqual(f.accountSources,{});
 assert.equal(calculatePeriod(f,undefined,{...inputs,accounts:{...inputs.accounts,receiptNo:'different'}}).values.eps,null);
});

test('preferred companies have an explicitly combined-class reference BPS only with a reconciled share total',()=>{
 const current=filing(2025,'ANNUAL',{accountSources:{basicEps:{amount:'10'},parentEquity:{amount:'200'}}});
 const row=(stockKind:string,shareClass:string,count:string)=>({stockKind,shareClass,outstandingShares:count,issuedShares:count,treasuryShares:'0',periodEndDate:'2025-12-31'});
 const shares={receiptNo:current.receiptNo,outstanding:'10',preferred:true,rows:[row('보통주','COMMON','10'),row('우선주','PREFERRED','10'),row('합계','TOTAL','20')]};
 const sources={shares,price:{value:'100',date:'2025-12-30',source:'KIS_KRX_UNADJUSTED_CLOSE'},basis:{receiptNo:current.receiptNo,epsPriceCompatible:true,bpsPriceCompatible:true,source:'TEST',verifiedAt:new Date().toISOString()}};
 const result=calculatePeriod(current,undefined,sources);assert.equal(result.values.bps,'10');assert.equal(result.values.pbr,'10');assert.equal(result.provenance.bpsReferenceOnly,true);assert.equal(result.provenance.bpsBasis,'OWNERS_EQUITY_DIV_ALL_OUTSTANDING_REFERENCE');
 const broken=structuredClone(sources);broken.shares.rows[2].outstandingShares='21';assert.equal(calculatePeriod(current,undefined,broken).values.bps,null);
});

test('negative EPS and equity stay signed while PER/PBR are normally inapplicable',()=>{
 const sources={shares:{outstanding:'10',preferred:false,receiptNo:'20260301000001'},price:{value:'100',date:'2025-12-30',source:'FSC'}};
 const f=filing(2025,'ANNUAL',{accountSources:{basicEps:{amount:'-10'},parentEquity:{amount:'-200'}}});
 const result=calculatePeriod(f,undefined,sources);assert.equal(result.values.eps,'-10');assert.equal(result.values.bps,'-20');assert.equal(result.values.per,null);assert.equal(result.values.pbr,null);assert.equal(result.reasons.per,'EPS_NON_POSITIVE');assert.equal(result.reasons.pbr,'BPS_NON_POSITIVE');
 const zero=filing(2025,'ANNUAL',{accountSources:{basicEps:{amount:'0'},parentEquity:{amount:'0'}}});
 assert.equal(calculatePeriod(zero,undefined,sources).values.per,null);assert.equal(calculatePeriod(zero,undefined,sources).values.pbr,null);
});
test('annual closing-parent ROE no longer needs opening capital and ignores unrelated supplements',()=>{
 const f=filing(2015,'ANNUAL',{accountSources:{parentNetIncome:{amount:'20'},parentEquity:{amount:'220'}}});
 const supplemental={accounts:{receiptNo:f.receiptNo,fsDivision:'CFS',collectedAt:'2026-10-17',sources:{openingParentEquity:{amount:'180',periodEnd:'2014-12-31'}}}};
 const result=calculatePeriod(f,undefined,supplemental);assert.equal(result.values.roe,'9.0909');assert.equal(result.provenance.roeDenominator,'CLOSING_PARENT_EQUITY');
 supplemental.accounts.sources.openingParentEquity.periodEnd='2013-12-31';assert.equal(calculatePeriod(f,undefined,supplemental).values.roe,'9.0909');
 supplemental.accounts.sources.openingParentEquity.periodEnd='2014-12-31';supplemental.accounts.receiptNo='wrong';assert.equal(calculatePeriod(f,undefined,supplemental).values.roe,'9.0909');
 supplemental.accounts.receiptNo=f.receiptNo;supplemental.accounts.fsDivision='OFS';assert.equal(calculatePeriod(f,undefined,supplemental).values.roe,'9.0909');
});
test('unverified multiple fiscal durations never invent twelve-month valuation ratios',()=>{
 const f=filing(2025,'ANNUAL',{sourceValidation:{periodResolution:{originalReason:'MULTIPLE_ANNUAL_PERIODS'}}});const result=calculatePeriod(f,undefined,{price:{value:'100',date:'2025-12-30',source:'TEST'}});assert.ok(Object.values(result.values).every(v=>v===null));assert.match(result.reasons.roe!,/회계기간/);assert.equal(result.provenance.calculationState,'FISCAL_DURATION_REVIEW_REQUIRED');
});
test('verified short fiscal period annualizes EPS and ROE using exact fiscal opening equity',()=>{
 const f=filing(2025,'ANNUAL',{sourceValidation:{periodResolution:{}},accountSources:{basicEps:{amount:'5'}}});
 const supplemental={fiscalDuration:{method:'DART_MAJOR_ACCOUNTS_MATCH' as const,receiptNo:f.receiptNo,fsDivision:'CFS',start:'2025-10-01',end:'2025-12-31',months:3,openingEquity:'180',openingDate:'2025-09-30',verifiedAt:new Date().toISOString()},price:{value:'100',date:'2025-12-30',source:'TEST'}};
 const result=calculatePeriod(f,filing(2024,'ANNUAL',{totalEquity:d(1)}),supplemental);assert.equal(result.values.eps,'20');assert.equal(result.values.per,'5');assert.equal(result.values.roe,'40');assert.equal(result.provenance.months,3);
 assert.equal(calculatePeriod(f,undefined,{...supplemental,fiscalDuration:{...supplemental.fiscalDuration,receiptNo:'wrong'}}).values.eps,null);
});
test('unverified flow duration does not block a verified period-end BPS or PBR',()=>{
 const f=filing(2025,'ANNUAL',{sourceValidation:{periodResolution:{}},fsDivision:'OFS'});const r=calculatePeriod(f,undefined,{shares:{receiptNo:f.receiptNo,outstanding:'10',preferred:false},price:{value:'110',date:'2025-12-30',source:'TEST'}});assert.equal(r.values.bps,'22');assert.equal(r.values.pbr,'5');assert.equal(r.values.eps,null);
});
test('irregular formation periods use exact disclosed days, never a rounded calendar quarter',()=>{
 const f=filing(2025,'ANNUAL',{sourceValidation:{periodResolution:{}},accountSources:{basicEps:{amount:'72'}}});
 const fiscalDuration={method:'DART_MAJOR_ACCOUNTS_MATCH' as const,receiptNo:f.receiptNo,fsDivision:'CFS',start:'2025-10-21',end:'2025-12-31',months:3,annualization:'ACT_365' as const,days:72,verifiedAt:new Date().toISOString()};
 assert.equal(calculatePeriod(f,undefined,{fiscalDuration}).values.eps,'365');assert.equal(calculatePeriod(f,undefined,{fiscalDuration:{...fiscalDuration,days:73}}).values.eps,null);
});
