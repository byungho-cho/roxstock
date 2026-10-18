import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {calculatePeriod} from './period-valuation.js';
import {mergeStatements,growth,fairPrice,combinedValuation,financialRows,periods} from './value-analysis.js';
import {selectValueListAnalysis} from './value-list-analysis.js';
import {valueCompletion} from './collection-status.js';
import {valueCollectionStatus} from './value-collection-status.js';
const filing=(currency:string,year=2024,periodType='ANNUAL')=>({securityId:1n,fiscalYear:year,periodType,receiptNo:String(year)+'0101000001',fsDivision:'OFS',periodEndDate:new Date(`${year}-12-31`),receiptDate:new Date(`${year+1}-03-01`),collectedAt:new Date(),sourceValidation:{currency},accountSources:{basicEps:{amount:'2.125',ytdAmount:'2.125'}},totalAssets:new Prisma.Decimal('200.25'),totalLiabilities:new Prisma.Decimal('100.125'),totalEquity:new Prisma.Decimal('100.125'),netIncomeYtd:new Prisma.Decimal('10.0125'),revenueYtd:new Prisma.Decimal('999999999999999999999999999999.123456789'),netIncomeQuarter:null,revenueQuarter:null,operatingProfitYtd:null,isWithdrawn:false}) as unknown as DartFinancialFiling;
for(const currency of ['KRW','USD','CNY','JPY'])test(`${currency}: original decimals and same-currency ROE; FX price ratios blocked`,()=>{
 const f=filing(currency),previous=filing(currency,2023);
 const result=calculatePeriod(f,previous,{price:{value:'100',date:'2024-12-31',source:'FIXTURE'}});
 assert.equal(result.values.roe,'10');assert.equal(result.values.eps,'2.125');
 assert.equal(result.provenance.currency,currency);
 assert.equal(result.values.per===null,currency!=='KRW');
 if(currency!=='KRW')assert.equal(result.reasons.per,'CURRENCY_CONVERSION_REQUIRED');
 const rows=mergeStatements([],[f]);assert.equal(rows[0]!.revenue,'999999999999999999999999999999.123456789');assert.equal(rows[0]!.currency,currency);
});
test('mixed currencies cannot enter opening-equity average, growth or annual-minus-Q3',()=>{
 assert.equal(calculatePeriod(filing('USD'),filing('CNY',2023)).values.roe,null);
 const a=mergeStatements([],[filing('USD')])[0]!,b=mergeStatements([],[filing('CNY',2023)])[0]!;
 assert.equal(growth(a,b,'revenue'),null);
 assert.equal(mergeStatements([],[filing('USD'),filing('CNY',2024,'Q3')]).some(r=>r.periodType==='Q4'),false);
});
test('foreign financials cannot merge with legacy KRW manual fields or legacy price metrics',()=>{
 const f=filing('USD'),manual={fiscalYear:2024,periodType:'ANNUAL',revenue:new Prisma.Decimal(123),periodEndDate:new Date('2024-12-31')} as any;
 assert.equal(mergeStatements([manual],[f])[0]!.revenue,f.revenueYtd!.toFixed());
 const calculated={fiscalYear:2024,periodType:'ANNUAL',values:{eps:'2',bps:'10',roe:'10',per:'50',pbr:'10'},provenance:{currency:'USD',fsDivision:'OFS'},status:'PARTIAL',supplemental:{}} as any;
 const metric=combinedValuation({metricDate:'2024-12-31',eps:'10',bps:'10',roe:'10',per:'10',pbr:'10'},[calculated]);
 assert.equal(metric?.per,null);assert.equal(fairPrice(metric,'0.8'),null);
 const chart=financialRows(periods(2024,null,1),mergeStatements([],[f]),[],[calculated])[0]!;assert.equal(chart.per,null);assert.equal(chart.pbr,null);assert.equal(chart.currency,'USD');
 const list=selectValueListAnalysis({year:2025,price:'100',filings:[f],manual:[],metrics:[],periods:[calculated]});
 assert.equal(list.currency,'USD');assert.equal(list.w,null);assert.equal(list.targetPrice,null);assert.equal(list.epsYield,null);assert.equal(list.shareholderValue,null);assert.equal(list.capitalBasis?.unit,'USD');
 assert.equal(list.missingReasons.targetPrice,'CURRENCY_CONVERSION_REQUIRED');
});
test('conversion required is not collection failure; ratios may be not applicable',()=>{
 const values={eps:'1',bps:'2',roe:'10',per:null,pbr:null};
 assert.equal(valueCompletion(values,'USD').complete,true);
 assert.equal(valueCompletion(values).complete,false);
 assert.equal(valueCollectionStatus({per:'CURRENCY_CONVERSION_REQUIRED'},{status:'PARTIAL',values,reasons:{per:'CURRENCY_CONVERSION_REQUIRED'}} as any,[]).collectionStatus,'PARTIAL');
});

test('legacy KRW metrics are never relabelled as a foreign filing currency',()=>{
 const f=filing('USD');
 const old={metricDate:new Date('2024-12-31'),eps:new Prisma.Decimal(10),bps:new Prisma.Decimal(20),roe:new Prisma.Decimal(10),per:new Prisma.Decimal(5),pbr:new Prisma.Decimal(2)} as any;
 const list=selectValueListAnalysis({year:2025,price:'100',filings:[f],manual:[],metrics:[old],periods:[]});
 assert.equal(list.eps,null);assert.equal(list.targetPrice,null);assert.equal(list.currency,'USD');
});

test('same-currency Q4 subtraction preserves more than 20 significant digits',()=>{
 const annual=filing('USD'),q3={...filing('USD',2024,'Q3'),revenueYtd:new Prisma.Decimal('1.125')};
 const q4=mergeStatements([],[annual,q3]).find(r=>r.periodType==='Q4');
 assert.equal(q4?.revenue,'999999999999999999999999999997.998456789');
});
