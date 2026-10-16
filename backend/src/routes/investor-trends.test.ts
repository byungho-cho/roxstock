import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {Prisma} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {investorTrendRoutes} from './investor-trends.js';
const actors=['INDIVIDUAL','FOREIGN','INSTITUTION'];
test('committed provider trading dates skip holidays but preserve genuine missing-trading-day gaps',async()=>{
 const observations=['2026-10-08','2026-10-12'].flatMap((day,index)=>actors.map(investorCode=>({tradeDate:new Date(day+'T00:00:00Z'),investorCode,investorName:investorCode,source:'KIS_API',exchangeScope:'KRX',quantityUnit:'SHARE',amountUnit:'KRW',publicationStatus:'UNSPECIFIED',reason:null,buyQuantity:new Prisma.Decimal(index+1),sellQuantity:new Prisma.Decimal(0),netQuantity:new Prisma.Decimal(index+1),buyAmount:null,sellAmount:null,netAmount:null,updatedAt:new Date('2026-10-16T00:00:00Z')})));
 const coverage={tradingDates:['2026-10-08','2026-10-12'],from:'2026-10-01',until:'2026-10-12',oldest:'2026-10-08'};
 const fake={investorFlowDaily:{findMany:async()=>observations},collectorRunItem:{findFirst:async()=>({diagnostics:coverage})}} as unknown as typeof prisma;
 const app=Fastify();await app.register(investorTrendRoutes,{db:fake});
 try{
  const path='/investor-trends?type=STOCK&target=005930&date=2026-10-12&metric=quantity';
  const good=(await app.inject(path)).json().data;assert.deepEqual(good.points.map((point:any)=>point.date),['2026-10-08','2026-10-12']);assert.equal(good.points[1].values.INDIVIDUAL,'3');
  coverage.tradingDates.push('2026-10-09');const missing=(await app.inject(path)).json().data;assert.equal(missing.points.find((point:any)=>point.date==='2026-10-09').values.INDIVIDUAL,null);assert.equal(missing.points.at(-1).values.INDIVIDUAL,null);
 }finally{await app.close();}
});
test('complete KIS day takes precedence without summing NAVER or mixing incomplete source actors',async()=>{
 const observations=['KIS_API','NAVER_WEB'].flatMap(source=>actors.map(investorCode=>({tradeDate:new Date('2026-10-15T00:00:00Z'),investorCode,investorName:investorCode,source,exchangeScope:'KRX',amountUnit:'KRW',quantityUnit:'SHARE',publicationStatus:'UNSPECIFIED',reason:null,buyQuantity:new Prisma.Decimal(source==='KIS_API'?10:100),sellQuantity:new Prisma.Decimal(0),netQuantity:new Prisma.Decimal(source==='KIS_API'?10:100),buyAmount:source==='KIS_API'?new Prisma.Decimal(1000000):null,sellAmount:source==='KIS_API'?new Prisma.Decimal(0):null,netAmount:source==='KIS_API'?new Prisma.Decimal(1000000):null,updatedAt:new Date('2026-10-16T00:00:00Z')})));
 const fake={investorFlowDaily:{findMany:async()=>observations}} as unknown as typeof prisma;
 observations.push({...observations[0]!,investorCode:'BANK',netAmount:new Prisma.Decimal(999999999)});
 const app=Fastify();await app.register(investorTrendRoutes,{db:fake});
 try{
  const path='/investor-trends?type=STOCK&target=005930&date=2026-10-15';
  const quantity=(await app.inject(path+'&metric=quantity')).json().data;
  assert.equal(quantity.rows.length,3);assert.ok(quantity.rows.every((row:any)=>row.source==='KIS_API'));assert.equal(quantity.points[0].values.INDIVIDUAL,'10');
  const money=(await app.inject(path+'&metric=amount')).json().data;assert.equal(money.points[0].values.INDIVIDUAL,'1000000');
  observations.shift();const fallback=(await app.inject(path+'&metric=quantity')).json().data;
  assert.equal(fallback.rows.length,3);assert.ok(fallback.rows.every((row:any)=>row.source==='NAVER_WEB'));assert.equal(fallback.points[0].values.INDIVIDUAL,'100');
 }finally{await app.close();}
});
test('daily history pages 50 dates, retains the last row provider change and rejects unverified amounts',async()=>{
 const observations=Array.from({length:57},(_,index)=>actors.map(investorCode=>({tradeDate:new Date(Date.UTC(2026,0,index+1)),investorCode,source:'NAVER_WEB',exchangeScope:'KRX',quantityUnit:'SHARE',amountUnit:'KRW',netQuantity:new Prisma.Decimal(index),netAmount:new Prisma.Decimal(index===56?'-9007199254740993':0),raw:{closingPrice:String(100+index),closeChange:index?'1':null}}))).flat();
 const matches=(row:any,where:any)=>where.tradeDate.in?where.tradeDate.in.some((day:Date)=>day.getTime()===row.tradeDate.getTime()):row.tradeDate<=where.tradeDate.lte&&(!where.tradeDate.lt||row.tradeDate<where.tradeDate.lt);
 const fake={investorFlowDaily:{groupBy:async({where,take}:any)=>[...new Set(observations.filter(row=>matches(row,where)).map(row=>row.tradeDate.getTime()))].sort((a,b)=>b-a).slice(0,take).map(value=>({tradeDate:new Date(value)})),findMany:async({where}:any)=>observations.filter(row=>matches(row,where))}} as unknown as typeof prisma;
 const app=Fastify();await app.register(investorTrendRoutes,{db:fake});
 try{
  const path='/investor-trends/history?type=STOCK&target=005930&date=2026-10-15&metric=amount';
  const first=(await app.inject(path)).json().data;
  assert.equal(first.rows.length,50);assert.equal(first.rows[0].values.INDIVIDUAL,'-9007199254740993');assert.equal(first.rows[49].closeChange,'1');
  const second=(await app.inject(path+'&cursor='+first.nextCursor)).json().data;
  assert.equal(second.rows.length,7);assert.equal(second.nextCursor,null);assert.equal(second.rows.at(-1).closeChange,null);
  assert.equal(new Set([...first.rows,...second.rows].map(row=>row.date)).size,57);
  observations[observations.length-1]!.exchangeScope='UNVERIFIED';
  const limited=(await app.inject(path)).json().data;assert.equal(limited.rows[0].values.INSTITUTION,null);
  assert.equal((await app.inject(path+'&cursor=invalid')).statusCode,400);
 }finally{await app.close();}
});
test('stored one-off data before automatic collection start remains readable without inventing amounts',async()=>{
 const tradeDate=new Date('2026-10-15T00:00:00Z');
 const observations=actors.map(investorCode=>({tradeDate,investorCode,investorName:investorCode,source:'NAVER_WEB',exchangeScope:'KRX',publicationStatus:'UNSPECIFIED',reason:'quantity only',buyQuantity:new Prisma.Decimal(12),sellQuantity:new Prisma.Decimal(5),netQuantity:new Prisma.Decimal(7),buyAmount:null,sellAmount:null,netAmount:null,updatedAt:tradeDate}));
 const fake={investorFlowDaily:{findMany:async({where}:any)=>observations.filter(row=>row.tradeDate>=where.tradeDate.gte&&row.tradeDate<=where.tradeDate.lte)}} as unknown as typeof prisma;
 const app=Fastify();await app.register(investorTrendRoutes,{db:fake});
 try{
  const path='/investor-trends?type=STOCK&target=005930&date=2026-10-15';
  const quantity=(await app.inject(path+'&metric=quantity')).json().data;
  assert.equal(quantity.collectionStartDate,'2026-10-16');
  assert.equal(quantity.actualFrom,'2026-10-15');assert.equal(quantity.rows.length,3);
  assert.ok(quantity.rows.every((row:any)=>row.net==='7'));assert.equal(quantity.points[0].values.INDIVIDUAL,'7');
  const money=(await app.inject(path+'&metric=amount')).json().data;
  assert.ok(money.rows.every((row:any)=>row.net===null));assert.equal(money.points.length,0);assert.equal(money.unit,null);
 }finally{await app.close();}
});
test('stored-only trends preserve decimal precision, real zero, unavailable money and cumulative gaps',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-21T00:00:00Z')});
 const observations=['2026-10-16','2026-10-20'].flatMap((day,i)=>actors.map((actor,j)=>({tradeDate:new Date(day+'T00:00:00Z'),investorCode:actor,investorName:actor,source:'NAVER_WEB',exchangeScope:'KRX',publicationStatus:'UNSPECIFIED',reason:'partial',buyQuantity:new Prisma.Decimal(j?0:'9007199254740993'),sellQuantity:new Prisma.Decimal(0),netQuantity:new Prisma.Decimal(i?'-1':j?'0':'9007199254740993'),buyAmount:null,sellAmount:null,netAmount:null,updatedAt:new Date('2026-10-20T10:00:00Z')})));
 const fake={investorFlowDaily:{findMany:async()=>observations},account:{findUnique:async()=>({isActive:true})},security:{findMany:async()=>[]}} as unknown as typeof prisma;
 const app=Fastify();app.setErrorHandler((e:any,_q,r)=>r.code(e.statusCode??500).send({error:{code:e.code}}));await app.register(investorTrendRoutes,{db:fake});
 try{
  const selected=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const reply=await app.inject(`/investor-trends?type=STOCK&target=005930&date=${selected}&metric=quantity&period=30`);
  assert.equal(reply.statusCode,200);const result=reply.json().data;
  assert.equal(result.points[0].values.INDIVIDUAL,'9007199254740993');assert.equal(result.points[0].values.FOREIGN,'0');
  assert.equal(result.points.find((p:any)=>p.date==='2026-10-19').values.INDIVIDUAL,null);assert.equal(result.points.at(-1).values.INDIVIDUAL,null);
  const money=(await app.inject(`/investor-trends?type=STOCK&target=005930&date=${selected}&metric=amount`)).json().data;
  assert.ok(money.rows.every((r:any)=>r.net===null));assert.equal(money.points.length,0);
  for(const suffix of ['target=invalid','date=2026-02-30','period=999','metric=unknown'])assert.equal((await app.inject('/investor-trends?'+suffix)).statusCode,400);
 }finally{await app.close();}
});
test('account target classification uses holdings then watch then trade history',async()=>{
 const fake={account:{findUnique:async()=>({isActive:true})},security:{findMany:async()=>[
  {id:1n,symbol:'005930',name:'A',buyTrades:[{quantity:new Prisma.Decimal(2),sellTrades:[{quantity:new Prisma.Decimal(1)}]}],accountWatchlistItems:[{listType:'WATCHLIST'}]},
  {id:2n,symbol:'000660',name:'B',buyTrades:[{quantity:new Prisma.Decimal(1),sellTrades:[{quantity:new Prisma.Decimal(1)}]}],accountWatchlistItems:[{listType:'WATCHLIST'}]},
  {id:3n,symbol:'005380',name:'C',buyTrades:[{quantity:new Prisma.Decimal(1),sellTrades:[{quantity:new Prisma.Decimal(1)}]}],accountWatchlistItems:[]},
 ]}} as unknown as typeof prisma;
 const app=Fastify();await app.register(investorTrendRoutes,{db:fake});try{const reply=await app.inject('/accounts/1/investor-targets');assert.equal(reply.statusCode,200);assert.deepEqual(reply.json().data.map((r:any)=>r.classification),['보유','관심','거래']);}finally{await app.close();}
});
