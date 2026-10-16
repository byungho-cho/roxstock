import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {Prisma} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {investorTrendRoutes} from './investor-trends.js';
const actors=['INDIVIDUAL','FOREIGN','INSTITUTION'];
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
