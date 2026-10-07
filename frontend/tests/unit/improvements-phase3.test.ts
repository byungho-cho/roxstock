import assert from 'node:assert/strict';
import test from 'node:test';
import { sortStocks } from '../../src/pages/stocks/stockMath.ts';
import { rate } from '../../src/pages/investment-profit/profitData.ts';
import { currentHoldingProfit } from '../../src/pages/investment/investmentData.ts';
import { recentBuys, monthStart } from '../../src/pages/dashboard/recentBuysData.ts';
import type { StockItem } from '../../src/types/models.ts';
import type { BuyLotDto } from '../../src/data/roxstockApi.ts';

const stock = (profit: number, id: string): StockItem => ({id,name:id,symbol:id,listType:'holding',currentPrice:10,priceChangeRate:0,quantity:1,purchaseAmount:100,marketValue:100+profit,profitAmount:profit,profitRate:profit});
test('profit groups stay positive/zero/loss/missing for both directions and metrics', () => {
  const rows=[stock(-10,'n10'),stock(0,'zero'),stock(100,'p100'),stock(NaN,'missing'),stock(-100,'n100'),stock(10,'p10')];
  for (const key of ['profitAmount','profitRate'] as const) {
    assert.deepEqual(sortStocks(rows,key,true,new Set(['n10','missing'])).map(s=>s.id),['p100','p10','zero','n100','n10','missing']);
    assert.deepEqual(sortStocks(rows,key,false).map(s=>s.id),['p10','p100','zero','n10','n100','missing']);
  }
  assert.deepEqual(sortStocks([stock(10,'b'),stock(10,'a')],'profitAmount',true).map(s=>s.id),['a','b']);
});
const lot=(id:string,date:string,remaining='1',price:string|null='150'):BuyLotDto=>({id,buyDate:date,boughtAt:`${date}T03:00:00Z`,holdingDays:1,currentPrice:price,returnRate:'50',profitLoss:'50',priceUpdatedAt:`${date}T03:00:00Z`,valuationStatus:price?'AVAILABLE':'UNAVAILABLE',security:{id:'1',symbol:'000001',name:'종목',marketType:'KOSPI'},quantity:'10',soldQuantity:'9',remainingQuantity:remaining,unitPrice:'100',remainingPurchaseAmount:'100',memo:null,sellTrades:[]});
test('year valuation includes prior-year remainder, excludes sold quantity, preserves fractional precision and missing quotes',()=>{
  assert.equal(currentHoldingProfit([lot('1','2025-01-01','2'),lot('2','2026-01-01','0',null)]),10000000000n);
  assert.equal(currentHoldingProfit([lot('1','2025-01-01','0.0001','100.0001')]),1n);
  assert.equal(currentHoldingProfit([lot('1','2025-01-01','1',null)]),null);
  assert.equal(currentHoldingProfit([]),0n);
  assert.equal(rate(130000000000n,0n,true),'—');
  assert.equal(rate(130000000000n,10000000000000n,true),'+1.3%');
});
test('recent buys keeps default old rows, counts displayed rows using Korean buy dates, expands calendar months without duplicates',()=>{
  const rows=[...Array.from({length:3},(_,i)=>lot(String(i),'2026-10-01')),...Array.from({length:6},(_,i)=>lot(String(10+i),'2026-09-03')),lot('20','2026-08-01'),lot('21','2026-07-31')];
  rows.push(rows[0]);
  assert.equal(monthStart('2026-01-31',1),'2025-12-01');
  assert.equal(recentBuys(rows,'2026-10-07',0).count,5);
  assert.equal(recentBuys(rows,'2026-10-07',0).rows.length,5);
  const expanded=recentBuys(rows,'2026-10-07',1);assert.equal(expanded.rows.length,9);assert.equal(expanded.count,9);assert.equal(expanded.more,true);
  assert.equal(recentBuys(rows,'2026-10-07',3).rows.length,11);assert.equal(recentBuys(rows,'2026-10-07',3).more,false);
  assert.equal(recentBuys([lot('1','2026-09-30')],'2026-10-07',0).count,1);
  const midnight={...lot('1',''),buyDate:'',boughtAt:'2026-09-30T15:00:00Z'};assert.equal(recentBuys([midnight],'2026-10-07',0).count,1);
});
