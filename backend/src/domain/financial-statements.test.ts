import test from 'node:test';
import assert from 'node:assert/strict';
import {financialFields,statementPeriods,yearGrowth,type StoredFinancial} from './financial-statements.js';
const row=(year:number,value:string|null,basis='DART:CFS'):StoredFinancial=>({...Object.fromEntries(financialFields.map(f=>[f,null])),revenue:value,fiscalYear:year,periodType:'ANNUAL',basis,collectedAt:null,isDerived:false} as StoredFinancial);
test('YOY compares the same basis and divides by absolute prior amount',()=>{
 assert.equal(yearGrowth(row(2025,'50'),row(2024,'-100'),'revenue'),'150');
 assert.equal(yearGrowth(row(2025,'0'),row(2024,'100'),'revenue'),'-100');
 assert.equal(yearGrowth(row(2025,'50'),row(2024,'0'),'revenue'),null);
 assert.equal(yearGrowth(row(2025,'50'),row(2024,'100','DART:OFS'),'revenue'),null);
});
test('missing periods stay missing and real zero stays zero',()=>{
 const result=statementPeriods([{key:'2025:ANNUAL',label:'2025',year:2025,quarter:null},{key:'2026:ANNUAL',label:'2026',year:2026,quarter:null}],[row(2025,'0')]);
 assert.equal(result[0].values.revenue,'0');assert.equal(result[1].values.revenue,null);
});
