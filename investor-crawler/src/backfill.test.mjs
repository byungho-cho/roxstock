import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backfillPage,runInvestorBackfill} from './backfill.mjs';

function fixture(){
 let campaign=null,items=[],owner=null;const stored=new Map();let failCommit=false,stolen=false;
 const security={id:1n,symbol:'005930',isActive:true,collectionExcluded:false,collectionRevision:0,excludedFeatures:null,buyTrades:[],accountWatchlistItems:[]};
 const db={collectorLock:{updateMany:async({data})=>{if(owner)return {count:0};owner=data.ownerToken;return {count:1};},create:async()=>{throw Object.assign(new Error(),{code:'P2002'});},deleteMany:async()=>{owner=null;}},collectorRun:{findFirst:async()=>campaign,create:async({data})=>(campaign={id:1n,...data}),update:async({data})=>(campaign={...campaign,...data})},collectorRunItem:{findMany:async()=>items.map(item=>({...item,diagnostics:{...item.diagnostics}})),create:async({data})=>{const item={id:BigInt(items.length+1),...data};items.push(item);return item;},update:async({where,data})=>{const index=items.findIndex(item=>item.id===where.id);items[index]={...items[index],...data};return items[index];}},security:{findMany:async()=>[security],findUnique:async()=>security}};
 db.$transaction=async callback=>{
  const writes=[];let itemWrite=null;
  const tx={security:db.security,$queryRaw:async()=>[{owner_token:stolen?'other-owner':owner}],investorFlowDaily:{upsert:async input=>writes.push(input)},collectorRunItem:{update:async input=>{itemWrite=input;}}};
  await callback(tx);if(failCommit)throw Error('commit failed');
  for(const write of writes){const row=write.create;stored.set(row.tradeDate.toISOString()+':'+row.investorCode,row);}
  if(itemWrite)await db.collectorRunItem.update(itemWrite);
 };
 return {db,stored,items:()=>items,campaign:()=>campaign,security,fail:()=>{failCommit=true;},steal:()=>{stolen=true;}};
}
const rows=day=>['INDIVIDUAL','FOREIGN','INSTITUTION'].map(investorCode=>({tradeDate:day,investorCode,source:'KIS_API',exchangeScope:'KRX',raw:{},netAmount:'1000000'}));
test('adding markets resumes the same campaign without refetching completed stocks',async()=>{
 const f=fixture();const kis={stockFlows:async()=>rows('2020-01-01')};
 await runInvestorBackfill({db:f.db,kis});let stockCalls=0,marketCalls=[];
 kis.stockFlows=async()=>{stockCalls++;return [];};kis.marketFlows=async market=>{marketCalls.push(market);return rows('2020-01-01').map(row=>({...row,exchangeScope:'KIS_MARKET'}));};
 const result=await runInvestorBackfill({db:f.db,kis});assert.equal(stockCalls,0);assert.deepEqual(marketCalls,['KOSPI','KOSDAQ']);assert.equal(result.total,3);assert.equal(result.complete,3);
 await runInvestorBackfill({db:f.db,kis});assert.equal(marketCalls.length,2);
});
test('reverse page includes boundary, rejects future rows and always moves cursor backwards',()=>{
 const result=backfillPage([...rows('2020-01-02'),...rows('2019-12-30')],'2020-02-01','2020-01-01');
 assert.equal(result.rows.length,3);assert.equal(result.complete,true);assert.equal(result.nextCursor,'2019-12-29');
 assert.throws(()=>backfillPage(rows('2026-10-16'),'2026-10-15','2020-01-01'),{code:'BACKFILL_FUTURE_RESPONSE'});
});
test('committed cursor resumes, completed targets stop requesting and only new held/watch targets are queued',async()=>{
 const f=fixture(),dates=[];const kis={stockFlows:async(symbol,cursor)=>{dates.push({symbol,cursor});return rows(dates.length===1?'2026-10-01':'2020-01-01');}};
 await runInvestorBackfill({db:f.db,kis,requestLimit:1});
 assert.equal(f.items()[0].diagnostics.cursor,'2026-09-30');assert.equal(f.stored.size,3);
 await runInvestorBackfill({db:f.db,kis,requestLimit:1});assert.equal(dates[1].cursor,'2026-09-30');assert.equal(f.items()[0].diagnostics.state,'COMPLETE');assert.equal(f.stored.size,6);
 await runInvestorBackfill({db:f.db,kis,requestLimit:1});assert.equal(dates.length,2);
 f.security.symbol='000660';await runInvestorBackfill({db:f.db,kis,requestLimit:1});assert.equal(dates.length,2);
 f.security.accountWatchlistItems=[{listType:'WATCHLIST'}];await runInvestorBackfill({db:f.db,kis,requestLimit:1});assert.equal(dates.length,3);assert.equal(f.items().length,2);
});
test('row transaction failure never advances cursor; lease ownership is required',async()=>{
 const f=fixture();f.fail();const kis={stockFlows:async()=>rows('2026-10-01')};await runInvestorBackfill({db:f.db,kis,requestLimit:1});
 assert.equal(f.stored.size,0);assert.equal(f.items()[0].diagnostics.cursor,f.items()[0].diagnostics.until);assert.equal(f.items()[0].diagnostics.pages,0);assert.equal(f.items()[0].status,'FAILED');
 const stolen=fixture();stolen.steal();await assert.rejects(runInvestorBackfill({db:stolen.db,kis,requestLimit:1}),{code:'LOCK_OWNERSHIP_LOST'});assert.equal(stolen.stored.size,0);assert.equal(stolen.items()[0].diagnostics.pages,0);
});
test('excluded target is not requested',async()=>{
 const f=fixture();f.security.collectionExcluded=true;let calls=0;
 await runInvestorBackfill({db:f.db,kis:{stockFlows:async()=>{calls++;return [];}}});assert.equal(calls,0);
});
test('empty initial history is not complete and successive requests are at least two seconds apart',async()=>{
 const f=fixture(),times=[];await runInvestorBackfill({db:f.db,kis:{stockFlows:async()=>{times.push(Date.now());return [];}}});
 assert.equal(times.length,2);assert.ok(times[1]-times[0]>=1950);assert.equal(f.items()[0].diagnostics.state,'BLOCKED');assert.equal(f.items()[0].message,'BACKFILL_NO_HISTORY');assert.equal(f.stored.size,0);
});
