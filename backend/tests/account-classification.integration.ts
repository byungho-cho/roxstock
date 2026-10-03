import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { PrismaCollectorRepository } from '../src/collector/repository.js';

// Real Fastify routes + real Prisma + disposable MariaDB, no route/DB mocks.
test('account classifications, migration preservation, trade replay and connected-Lot corrections', async () => {
 const app=buildApp();
 const call=async(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,payload?:Record<string,unknown>,expected=200)=>{
  const response=await app.inject({method,url:'/api'+url,...(payload?{payload}:{})});
  assert.equal(response.statusCode,expected,`${method} ${url}: ${response.body}`);return response.json();
 };
 try {
  const owners=await prisma.account.findMany({orderBy:{id:'asc'}});const a=owners[0],b=owners[1];assert.ok(a&&b);
  const original=await prisma.watchlistItem.findMany({include:{security:true}});assert.equal(original.length,3);
  const copied=await prisma.accountWatchlistItem.findMany({include:{security:true}});assert.equal(copied.length,3);
  assert.equal(copied.find(x=>x.security.symbol==='990001')?.accountId,a.id);assert.equal(copied.find(x=>x.security.symbol==='990002')?.accountId,a.id);
  assert.equal(copied.find(x=>x.security.symbol==='990003')?.accountId,b.id);assert.ok(copied.every(x=>x.memo==='preserved'&&x.priority===3&&x.targetBuyPrice?.toString()==='123'));
  assert.equal((await prisma.account.findUniqueOrThrow({where:{id:a.id}})).cashBalance.toString(),'1000000');assert.equal(await prisma.dailyAccountSnapshot.count(),1);
  const aid=a.id.toString(),bid=b.id.toString();
  const s=await prisma.security.create({data:{symbol:'990004',name:'Functional isolation',marketType:'OTHER'}});const sid=s.id.toString();
  await prisma.marketPrice.create({data:{securityId:s.id,currentPrice:'200',priceUpdatedAt:new Date('2026-01-01')}});
  const classify=async(accountId:string,listType:string,expected=201)=>call('POST','/watchlist-items',{accountId,securityId:sid,listType},expected);
  const manual=(await classify(aid,'HOLDING')).data;await classify(bid,'WATCHLIST');
  assert.equal(await prisma.buyTrade.count({where:{accountId:a.id,securityId:s.id}}),0);
  assert.ok(!(await call('GET',`/accounts/${aid}/holdings`)).data.some((x:{securityId:string})=>x.securityId===sid));
  const listing=async(accountId:string)=> (await call('GET',`/securities?accountId=${accountId}&registeredOnly=true`)).data;
  const type=async(accountId:string)=>(await listing(accountId)).find((x:{id:string})=>x.id===sid).listType;
  assert.equal(await type(aid),'HOLDING');assert.equal(await type(bid),'WATCHLIST');
  await call('PATCH',`/watchlist-items/${manual.watchlistItemId}`,{accountId:aid,listType:'WATCHLIST'});assert.equal(await type(aid),'WATCHLIST');
  await call('PATCH',`/watchlist-items/${manual.watchlistItemId}`,{accountId:bid,listType:'WATCHLIST'},404);
  await call('PATCH',`/watchlist-items/${manual.watchlistItemId}`,{accountId:aid,listType:'HOLDING'});assert.equal(await type(aid),'HOLDING');
  await classify(aid,'HOLDING');await classify(aid,'RECOMMENDED',400);assert.equal(await prisma.accountWatchlistItem.count({where:{accountId:a.id,securityId:s.id}}),1);
  await classify(aid,'TRADED',400);
  const buy={accountId:aid,securityId:sid,boughtAt:'2026-01-02T03:00:00Z',quantity:'10',unitPrice:'100',feeTaxAmount:'0',requestId:randomUUID()};
  const first=(await call('POST','/buy-trades',buy,201)).data;
  assert.deepEqual((await call('POST','/buy-trades',buy,201)).data,first);assert.equal(await prisma.buyTrade.count({where:{accountId:a.id,securityId:s.id}}),1);assert.equal(await prisma.cashTransaction.count({where:{buyTradeId:BigInt(first.id)}}),1);assert.equal((await prisma.account.findUniqueOrThrow({where:{id:a.id}})).cashBalance.toString(),'999000');
  await call('POST','/buy-trades',{...buy,quantity:'11'},409);assert.equal(await type(aid),'HOLDING');assert.equal(await type(bid),'WATCHLIST');
  await call('PATCH',`/watchlist-items/${manual.watchlistItemId}`,{accountId:aid,listType:'WATCHLIST'});assert.equal(await type(aid),'HOLDING');

  const sell={accountId:aid,buyTradeId:first.id,soldAt:'2026-01-03T03:00:00Z',quantity:'4',unitPrice:'200',feeTaxAmount:'0',requestId:randomUUID()};
  const partial=(await call('POST','/sell-trades',sell,201)).data;assert.equal(partial.remainingQuantity,'6');assert.equal(partial.realizedProfitLoss,'400');
  assert.deepEqual((await call('POST','/sell-trades',sell,201)).data,partial);
  const lot= (await call('GET',`/accounts/${aid}/buy-lots?securityId=${sid}`)).data[0];assert.equal(lot.remainingQuantity,'6');assert.equal(lot.profitLoss,'600');assert.equal(lot.returnRate,'100');
  const before=await prisma.account.findUniqueOrThrow({where:{id:a.id}});const cashFields={id:true,accountId:true,transactionType:true,transactionDate:true,amount:true,feeTaxAmount:true,balanceAfter:true,memo:true,createdAt:true,updatedAt:true} as const;const cash=await prisma.cashTransaction.findMany({where:{accountId:a.id},select:cashFields});const snapshot=await prisma.dailyAccountSnapshot.findMany({where:{accountId:a.id}});const positions=await prisma.dailyPositionSnapshot.findMany();
  await call('PATCH',`/sell-trades/${partial.id}`,{accountId:bid,quantity:'1'},404);
  await call('PATCH',`/sell-trades/${partial.id}`,{accountId:aid,quantity:'11'},409);
  await call('PATCH',`/sell-trades/${partial.id}`,{accountId:aid,quantity:'10'});assert.equal(await type(aid),'TRADED');
  assert.ok(!(await call('GET',`/accounts/${aid}/holdings`)).data.some((x:{securityId:string})=>x.securityId===sid));
  assert.equal((await call('GET',`/accounts/${aid}/trades?securityId=${sid}`)).summary.realizedProfitLoss,'1000');
  await call('PATCH',`/watchlist-items/${manual.watchlistItemId}`,{accountId:aid,listType:'HOLDING'});assert.equal(await type(aid),'TRADED');
  const candidates=await call('GET',`/securities?accountId=${aid}&excludeRegistered=true`);assert.ok(candidates.data.some((x:{id:string})=>x.id===sid));
  assert.ok(!(await call('GET',`/securities?accountId=${bid}&excludeRegistered=true`)).data.some((x:{id:string})=>x.id===sid));
  await call('DELETE',`/sell-trades/${partial.id}?accountId=${bid}`,undefined,404);
  await call('DELETE',`/sell-trades/${partial.id}?accountId=${aid}`);await call('DELETE',`/sell-trades/${partial.id}?accountId=${aid}`,undefined,404);
  assert.equal(await type(aid),'HOLDING');assert.equal((await call('GET',`/buy-trades/${first.id}?accountId=${aid}`)).data.remainingQuantity,'10');
  await call('GET',`/buy-trades/${first.id}?accountId=${bid}`,undefined,404);
  await call('PATCH',`/buy-trades/${first.id}`,{accountId:aid,unitPrice:'120'});
  assert.equal((await prisma.account.findUniqueOrThrow({where:{id:a.id}})).cashBalance.toString(),before.cashBalance.toString());assert.deepEqual(await prisma.cashTransaction.findMany({where:{accountId:a.id},select:cashFields}),cash);assert.deepEqual(await prisma.dailyAccountSnapshot.findMany({where:{accountId:a.id}}),snapshot);assert.deepEqual(await prisma.dailyPositionSnapshot.findMany(),positions);
  const next={...buy,quantity:'2',unitPrice:'300',requestId:randomUUID()};const concurrent=await Promise.all([call('POST','/buy-trades',next,201),call('POST','/buy-trades',next,201)]);assert.deepEqual(concurrent[0].data,concurrent[1].data);assert.equal(await prisma.cashTransaction.count({where:{buyTradeId:BigInt(concurrent[0].data.id)}}),1);
  const sellOwn=(await call('POST','/sell-trades',{...sell,buyTradeId:concurrent[0].data.id,quantity:'2',unitPrice:'350',requestId:randomUUID()},201)).data;assert.equal(sellOwn.realizedProfitLoss,'100');
  await call('DELETE',`/buy-trades/${concurrent[0].data.id}?accountId=${aid}&cascadeSells=true`);await call('DELETE',`/buy-trades/${first.id}?accountId=${aid}`);assert.equal(await type(aid),'HOLDING');
  const denied={...buy,quantity:'99999999',requestId:randomUUID()};await call('POST','/buy-trades',denied,409);assert.equal(await prisma.tradeRequest.count({where:{requestId:denied.requestId}}),0);
  // A new connection/HTTP app reads the persisted account categories.
  const other=buildApp();const reload=await other.inject(`/api/securities?accountId=${bid}&registeredOnly=true`);assert.equal(reload.json().data.find((x:{id:string})=>x.id===sid).listType,'WATCHLIST');await other.close();
  const direct=(await call('POST','/securities',{accountId:aid,symbol:'990005',name:'Manual listing',marketType:'KOSPI',listType:'HOLDING',listingYear:new Date().getFullYear()},201)).data;assert.equal(direct.listingYear,new Date().getFullYear());assert.equal(await prisma.buyTrade.count({where:{securityId:BigInt(direct.id)}}),0);
  await call('POST','/securities',{accountId:aid,symbol:'990005',name:'Duplicate',marketType:'KOSDAQ',listType:'HOLDING'},409);
  await call('POST','/securities',{accountId:aid,symbol:'990006',name:'Bad year',marketType:'KOSPI',listType:'HOLDING',listingYear:new Date().getFullYear()+1},400);
  assert.equal(await prisma.watchlistItem.count({where:{listType:'RECOMMENDED'}}),1);assert.equal(await prisma.accountWatchlistItem.count({where:{listType:'RECOMMENDED'}}),1);
  const targets=await new PrismaCollectorRepository(prisma).listRealtimeSecurities(100);assert.equal(targets.filter(x=>x.id===s.id).length,1);
 } finally {await app.close();await prisma.$disconnect();}
});
