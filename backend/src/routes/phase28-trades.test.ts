import test from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../app.js';
import {prisma} from '../lib/prisma.js';
import {Prisma} from '../generated/prisma/index.js';
test('phase28 scoped trade API returns all years and >50 buys/split sells in one response',async()=>{
 const original={account:prisma.account.findUnique,buy:prisma.buyTrade.findMany,sell:prisma.sellTrade.findMany};
 const security={id:9n,symbol:'000009',name:'검증 종목',marketType:'KOSPI'},d=(n:number)=>new Prisma.Decimal(n);
 const buys=Array.from({length:80},(_,i)=>({id:BigInt(i+1),security,quantity:d(1),unitPrice:d(100),boughtAt:new Date(`${i<40?'2024':'2026'}-01-01T03:00:00Z`),memo:null}));
 prisma.account.findUnique=(async(args:any)=>{assert.equal(args.where.id,7n);return {id:7n,isActive:true};}) as any;
 prisma.buyTrade.findMany=(async(args:any)=>{assert.deepEqual(args.where,{accountId:7n,securityId:9n});assert.equal(args.take,undefined);assert.equal(args.skip,undefined);return buys;}) as any;
 prisma.sellTrade.findMany=(async(args:any)=>{assert.deepEqual(args.where,{buyTrade:{accountId:7n,securityId:9n}});return buys.map((buy,i)=>({id:BigInt(i+1),buyTradeId:buy.id,buyTrade:buy,quantity:d(1),unitPrice:d(120),soldAt:new Date(`${i<40?'2024':'2026'}-02-01T03:00:00Z`),memo:null}));}) as any;
 const app=buildApp();
 try{const response=await app.inject('/api/accounts/7/trades?securityId=9');assert.equal(response.statusCode,200,response.body);const body=response.json();assert.equal(body.meta.count,160);assert.equal(body.meta.accountId,'7');assert.equal(body.data.length,160);assert.equal(new Set(body.data.map((r:any)=>r.type+':'+r.id)).size,160);assert.equal(body.summary.realizedProfitLoss,'1600');assert.equal(body.summary.buyAmount,'8000');assert.equal(body.summary.sellAmount,'9600');assert.ok(body.data.every((r:any)=>r.security.id==='9'));assert.equal(body.daily.reduce((n:number,r:any)=>n+r.buyCount+r.sellCount,0),160);}
 finally{await app.close();prisma.account.findUnique=original.account;prisma.buyTrade.findMany=original.buy;prisma.sellTrade.findMany=original.sell;}
});
