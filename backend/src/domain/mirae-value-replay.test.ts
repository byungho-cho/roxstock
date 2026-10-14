import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Prisma} from '../generated/prisma/index.js';import {projectValueRows} from '../read-model/value-rows.js';
const evidence=(name:string)=>JSON.parse(readFileSync(new URL('../../../docs/development/evidence/value-financial-cache/'+name,import.meta.url),'utf8')).data;
test('Mirae stored source replay fixes interim list selection without fabricating missing annual ROE or shares',()=>{
 const stored=evidence('mirae-stored-source.json'),value=evidence('value-mirae-before.json').rows[0],financial=evidence('financial-mirae-before.json').rows[0];
 const annual=stored.statements.find((r:any)=>r.fiscalYear===2025&&r.periodType==='ANNUAL');
 const d=(v:string|null)=>v===null?null:new Prisma.Decimal(v);
 const row=projectValueRows([{...stored.security,id:600n,codeRevision:0,marketPrice:{currentPrice:d(value.currentPrice),previousClosePrice:d(value.previousClosePrice),priceUpdatedAt:new Date(value.priceUpdatedAt)},fundamentals:null,valuationMetrics:[],financialStatements:[],dartShareSnapshots:[],dartBackfillTasks:[],periodValuations:stored.periodValuations,dartFinancialFilings:[{fiscalYear:2025,periodType:'ANNUAL',fsDivision:'CFS',periodEndDate:new Date(annual.periodEndDate),receiptNo:annual.dartSource.receiptNo,receiptDate:new Date('2026-03-19'),collectedAt:new Date(annual.dartSource.collectedAt),isWithdrawn:false,accountSources:{},revenueYtd:d(annual.revenue),operatingProfitYtd:d(annual.operatingProfit),netIncomeYtd:d(annual.netIncome),totalAssets:d(annual.totalAssets),totalLiabilities:d(annual.totalLiabilities),totalEquity:d(annual.totalEquity)}]} as any],2026)[0]!;
 assert.equal(financial.metricBasis.period,'Q2');assert.equal(financial.eps,null);assert.equal(financial.netIncome,null);
 assert.equal(row.metricBasis.year,2025);assert.equal(row.eps,'2396');assert.equal(row.eps,value.eps);assert.equal(row.epsYield,value.epsYield);assert.equal(row.netIncome,'10112143837');assert.equal(row.issuedShares,null);assert.equal(row.roe,null);assert.equal(row.w,null);assert.equal(row.collectionStatus,'PARTIAL');
});
