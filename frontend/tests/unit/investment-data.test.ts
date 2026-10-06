import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateInvestment, money } from '../../src/pages/investment/investmentData.ts';
const snapshot = (date: string, investmentAmount: string | null) => ({date, investmentAmount, totalAssetValue:'83304732', cashBalance:'20167232', stockValue:'63137500', change:null, changeRate:null, updatedAt:'2026-10-06T13:05:33Z'});
test('restored daily cost basis is independent of valuation and migration timestamps', () => {
 const result=calculateInvestment([snapshot('2026-09-29','107199527'),snapshot('2026-09-30','107317732')],[],2026,{date:'2025-12-31',investmentAmount:'62663340',updatedAt:'2026-10-06T13:05:33Z'});
 assert.equal(result.initialInvestment,money('62663340'));
 assert.deepEqual(result.points.map(r=>r.investment),[money('107199527'),money('107317732')]);
 assert.equal(result.evaluation,money('83304732'));
});
test('unknown principal does not fall back to valuation; genuine zero and negative amounts survive',()=>{
 const result=calculateInvestment([snapshot('2026-01-01',null),snapshot('2026-01-02','0'),snapshot('2026-01-03','-123.4567')],[],2026);
 assert.deepEqual(result.points.map(r=>r.investment),[null,0n,money('-123.4567')]);
 assert.equal(result.initialInvestment,0n);assert.equal(result.historicalUnavailable,true);
});
test('deposits must not be added again to stored cost basis',()=>{
 const transfer={id:'1',transactionType:'DEPOSIT' as const,transactionDate:'2026-03-31T00:00:00Z',amount:'5000000',feeTaxAmount:'0',balanceAfter:'0',memo:null,createdAt:'2026-03-31T00:00:00Z',updatedAt:'2026-03-31T00:00:00Z'};
 assert.equal(calculateInvestment([snapshot('2026-10-05','107317732')],[transfer],2026).investment,money('107317732'));
});