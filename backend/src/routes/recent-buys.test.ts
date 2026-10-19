import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma} from '@roxstock/shared/prisma';
import {recentBuysResult} from './recent-buys.js';
const decimal=(n:string)=>new Prisma.Decimal(n);
const now=new Date('2026-10-19T03:00:00Z');
const lot=(id:bigint,sold:string[],price:string|null='150.125')=>({id,securityId:1n,boughtAt:new Date('2026-10-01T00:00:00Z'),quantity:decimal('10.125'),unitPrice:decimal('100.125'),security:{id:1n,symbol:'P32',name:'same security',marketType:'OTHER' as const,marketPrice:price===null?null:{securityId:1n,currentPrice:decimal(price),previousClosePrice:decimal('100'),priceUpdatedAt:now}},sellTrades:sold.map(quantity=>({quantity:decimal(quantity)}))});
test('recent buys excludes fully sold Lot independently and values only remaining decimal quantity',()=>{
 const result=recentBuysResult([lot(3n,['10.125']),lot(2n,['2','4']),lot(1n,[])],2,1n,0,now);
 assert.deepEqual(result.data.map(r=>r.id),['2','1']);
 const row=result.data[0]!;
 assert.deepEqual([row.remainingQuantity,row.remainingPurchaseAmount,row.remainingMarketValue,row.profitLoss],['4.125','413.015625','619.265625','206.25']);
 assert.equal(result.data[1]!.profitLoss,'506.25');
 assert.deepEqual([result.meta.count,result.meta.total,result.meta.more],[2,2,false]);
});
test('missing price preserves held Lot and cost while valuation remains unavailable',()=>{
 const row=recentBuysResult([lot(1n,['6'],null)],1,1n,0,now).data[0]!;
 assert.equal(row.remainingPurchaseAmount,'413.015625');
 assert.deepEqual([row.currentPrice,row.profitLoss,row.remainingMarketValue,row.valuationStatus],[null,null,null,'UNAVAILABLE']);
});
