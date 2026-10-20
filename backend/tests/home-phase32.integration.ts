import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../src/auth/route-test-app.js';
import {prisma} from '@roxstock/shared/lib/prisma';
import {realtimePriceCache} from '../src/realtime/price-cache.js';

test('phase32 real DB: filter each remaining Lot before limit/count; partial values, expanded windows, home cache and history agree',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);
 const app=buildApp();
 const account=await prisma.account.create({data:{name:'Phase32',brokerName:'CI',cashBalance:'0'}});
 const security=await prisma.security.create({data:{symbol:'989132',name:'Phase32 stock',marketType:'OTHER'}});
 const get=async(path:string)=>{const r=await app.inject(`/api/${path}`);assert.equal(r.statusCode,200,r.body);return r.json();};
 try{
  await prisma.marketPrice.create({data:{securityId:security.id,currentPrice:'150.125',previousClosePrice:'100',priceUpdatedAt:new Date()}});
  const lots=[];
  // The newest five buys are all sold. Older Lots in this same security still remain.
  for(let i=0;i<12;i++){
   const lot=await prisma.buyTrade.create({data:{accountId:account.id,securityId:security.id,boughtAt:new Date(Date.now()-(i+1)*86400000),quantity:'10.125',unitPrice:'100.125'}});lots.push(lot);
   if(i<5)await prisma.sellTrade.create({data:{buyTradeId:lot.id,soldAt:new Date(),quantity:'10.125',unitPrice:'120'}});
  }
  await prisma.sellTrade.create({data:{buyTradeId:lots[5]!.id,soldAt:new Date(),quantity:'6',unitPrice:'120'}});
  const path=`accounts/${account.id}`;
  const initial=await get(`${path}/recent-buys`);
  assert.deepEqual(initial.data.map((r:any)=>r.id),lots.slice(5,10).map(l=>String(l.id)));
  assert.deepEqual([initial.meta.count,initial.meta.total,initial.meta.more],[5,7,true]);
  const partial=initial.data[0];
  assert.deepEqual([partial.quantity,partial.remainingQuantity,partial.soldQuantity,partial.remainingPurchaseAmount,partial.remainingMarketValue,partial.profitLoss],['10.125','4.125','6','413.015625','619.265625','206.25']);
  const expanded=await get(`${path}/recent-buys?months=2400`);
  assert.deepEqual(expanded.data.map((r:any)=>r.id),lots.slice(5).map(l=>String(l.id)));
  assert.deepEqual([expanded.meta.count,expanded.meta.total,expanded.meta.more],[7,7,false]);
  const home=await get(`pages/home?accountId=${account.id}`);
  assert.deepEqual(home.data.recent.data.map((r:any)=>r.id),initial.data.map((r:any)=>r.id));
  assert.deepEqual([home.data.recent.meta.count,home.data.recent.meta.total,home.data.recent.meta.more],[5,7,true]);
  assert.equal(home.data.recent.data[0].profitLoss,'206.25');
  // A refreshed market snapshot clears the existing page cache, without rewriting trades.
  await prisma.sellTrade.create({data:{buyTradeId:lots[5]!.id,soldAt:new Date(),quantity:'4.125',unitPrice:'120'}});
  realtimePriceCache.ingest([{securityId:String(security.id),symbol:'989132',name:security.name,currentPrice:'150.125',previousClosePrice:'100',observedAt:new Date().toISOString(),marketStatus:'CLOSED'}]);
  const refreshed=await get(`pages/home?accountId=${account.id}`);
  assert.deepEqual(refreshed.data.recent.data.map((r:any)=>r.id),lots.slice(6,11).map(l=>String(l.id)));
  assert.equal(refreshed.data.recent.meta.total,6);
  assert.equal((await get(`${path}/buy-lots?remainingOnly=false`)).data.length,12);
  assert.equal(await prisma.buyTrade.count({where:{accountId:account.id}}),12);
  assert.equal(await prisma.sellTrade.count({where:{buyTrade:{accountId:account.id}}}),7);
  console.log('PHASE32_DB_PROOF',JSON.stringify({initial:5,held:7,expanded:7,afterSaleHeld:6,historyBuys:12,historySells:7,partial:{quantity:partial.remainingQuantity,cost:partial.remainingPurchaseAmount,value:partial.remainingMarketValue,profit:partial.profitLoss}}));
 }finally{
  await prisma.sellTrade.deleteMany({where:{buyTrade:{accountId:account.id}}});await prisma.buyTrade.deleteMany({where:{accountId:account.id}});await prisma.account.delete({where:{id:account.id}});await prisma.marketPrice.deleteMany({where:{securityId:security.id}});await prisma.security.delete({where:{id:security.id}});await app.close();await prisma.$disconnect();
 }
});
