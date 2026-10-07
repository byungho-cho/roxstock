import assert from 'node:assert/strict';
import test from 'node:test';
import { annualInvestmentCapital } from './investment-capital.js';
const row = (date:string, value:string|null) => ({snapshotDate:new Date(`${date}T00:00:00Z`),investmentAmount:value});
test('past capital requires exact year-end; current capital uses latest valid in-year snapshot including zero',()=>{
 const data=annualInvestmentCapital([row('2023-12-30','12'),row('2024-12-31','50'),row('2025-12-31',null),row('2026-09-30','100'),row('2026-10-01','0'),row('2026-10-05',null),row('2026-10-08','500')],'2026-10-07');
 assert.deepEqual(data.find(r=>r.year===2023),{year:2023,date:null,investmentAmount:null,status:'YEAR_END_MISSING'});
 assert.equal(data.find(r=>r.year===2024)?.investmentAmount,'50');
 assert.equal(data.find(r=>r.year===2025)?.status,'AMOUNT_MISSING');
 assert.deepEqual(data[0],{year:2026,date:'2026-10-01',investmentAmount:'0',status:'AVAILABLE'});
 assert.equal(annualInvestmentCapital([row('2025-12-31','10')],'2026-10-07')[0]?.status,'NOT_COLLECTED');
});
