import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInvestment, money } from '../../src/pages/investment/investmentData.ts';
const snapshot = (date: string, value: string) => ({date, totalAssetValue:value, investmentAmount:'100', cashBalance:'0', stockValue:value, change:null, changeRate:null});
const transaction = (type: string, value: string) => ({id:type,transactionType:type,transactionDate:'2026-01-01T03:00:00Z',amount:value});
test('external deposit/withdrawal excluded; internal trades and dividend remain profit', () => {
  for (const [type, value, closing, expected] of [['DEPOSIT','50','150','0'],['WITHDRAWAL','30','70','0'],['BUY','50','100','0'],['SELL','50','110','10'],['DIVIDEND','10','110','10']]) {
    const data=calculateInvestment([snapshot('2025-12-31','100'),snapshot('2026-01-01',closing)], [transaction(type,value)] as any,2026);
    assert.equal(data.points.length,1);assert.equal(data.points[0].dailyProfit,money(expected));
  }
});
test('calendar-day gaps unavailable; quarter boundary uses preceding stored snapshot', () => {
  const data=calculateInvestment([snapshot('2026-03-31','100'),snapshot('2026-04-01','120'),snapshot('2026-04-03','150')],[],2026);
  assert.equal(data.points[1].dailyProfit,money('20'));assert.equal(data.points[2].dailyProfit,null);
});
