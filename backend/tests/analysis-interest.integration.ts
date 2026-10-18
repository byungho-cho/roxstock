import test from 'node:test';import assert from 'node:assert/strict';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {buildApp} from '../src/app.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/roxstock_bugreports_test')throw Error('Isolated DB required');
test('analysis interest scope includes holdings/watch/traded, excludes other accounts and recommended, before paging',async()=>{
 const app=buildApp(),suffix=String(Date.now());let accounts:bigint[]=[],ids:bigint[]=[];
 try{
  for(const name of ['first','other'])accounts.push((await db.account.create({data:{name:name+suffix,brokerName:'TEST'}})).id);
  for(let i=0;i<5;i++)ids.push((await db.security.create({data:{symbol:'T'+suffix.slice(-4)+i,name:'테스트 '+i,marketType:'KOSPI'}})).id);
  for(const [i,listType] of [[0,'HOLDING'],[1,'WATCHLIST'],[3,'RECOMMENDED']] as const)await db.accountWatchlistItem.create({data:{accountId:accounts[0]!,securityId:ids[i]!,listType}});
  await db.accountWatchlistItem.create({data:{accountId:accounts[1]!,securityId:ids[4]!,listType:'WATCHLIST'}});
  const buy=await db.buyTrade.create({data:{accountId:accounts[0]!,securityId:ids[2]!,boughtAt:new Date(),quantity:1,unitPrice:100}});
  await db.sellTrade.create({data:{buyTradeId:buy.id,soldAt:new Date(),quantity:1,unitPrice:100}});
  app.valueReadModel.get=(async()=>({rows:ids.map((id,i)=>({id:String(id),name:'테스트 '+i,symbol:'T'+suffix.slice(-4)+i,market:'KOSPI',w:null})),meta:{}})) as any;
  for(const path of ['value-analysis','financial-statements']){
   let res=await app.inject('/api/'+path+'?year=2025&limit=1');assert.equal(res.statusCode,200,res.body);assert.equal(res.json().data.total,5,'default is all');
   res=await app.inject('/api/'+path+'?year=2025&limit=1&scope=interest&accountId='+accounts[0]);assert.equal(res.statusCode,200,res.body);const data=res.json().data;assert.equal(data.total,3);assert.equal(data.rows.length,1);assert.deepEqual(new Set(data.navigation.map((r:any)=>r.id)),new Set(ids.slice(0,3).map(String)));
   res=await app.inject('/api/'+path+'?year=2025&scope=interest&accountId='+accounts[1]);assert.deepEqual(res.json().data.rows.map((r:any)=>r.id),[String(ids[4])]);
   assert.equal((await app.inject('/api/'+path+'?scope=interest')).statusCode,400);
   assert.equal((await app.inject('/api/'+path+'?scope=invalid')).statusCode,400);
  }
 }finally{await app.close();await db.sellTrade.deleteMany({where:{buyTrade:{accountId:{in:accounts}}}});await db.buyTrade.deleteMany({where:{accountId:{in:accounts}}});await db.accountWatchlistItem.deleteMany({where:{accountId:{in:accounts}}});await db.security.deleteMany({where:{id:{in:ids}}});await db.account.deleteMany({where:{id:{in:accounts}}});await db.$disconnect();}
});
