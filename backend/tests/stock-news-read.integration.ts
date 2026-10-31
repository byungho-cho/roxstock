import assert from 'node:assert/strict';
import test from 'node:test';
import {prisma} from '@roxstock/shared/lib/prisma';
import {authContext} from '../src/auth/context.js';
import {loadStockNews,loadStockNewsDetail,markStockNewsRead,markAllStockNewsRead} from '../src/routes/stock-news.js';

test('personal news reads: durable, idempotent, account-safe, bounded bulk and unchanged source',async()=>{
 assert.equal(new URL(process.env.DATABASE_URL!).pathname,'/roxstock_news_read_test');
 const stamp=new Date('2026-10-31T06:00:00Z'),suffix=Date.now().toString();
 const users=await Promise.all(['a','b'].map(s=>prisma.authUser.create({data:{email:`news-read-${suffix}-${s}@example.invalid`}})));
 const accounts=await Promise.all(users.map(u=>prisma.account.create({data:{userId:u.id,name:'NEWS READ TEST',brokerName:'CI',cashBalance:'0'}})));
 const security=await prisma.security.create({data:{symbol:'NR'+suffix.slice(-4),name:'읽음 검증',marketType:'OTHER'}});
 const provider='READ_TEST_'+suffix;
 const as=(index:number,fn:()=>Promise<any>)=>authContext.run({userId:users[index]!.id,role:'USER',sessionId:'read-test',mustChangePassword:false},fn);
 const create=(i:number)=>prisma.stockNewsItem.create({data:{provider,providerId:String(i),canonicalHash:provider+'url'+i,fingerprint:provider+'event'+i,title:'소식 '+i,originalUrl:'https://www.hankyung.com/article/read'+suffix+i,sourceName:'검증',publishedAt:stamp,publishedPrecision:'TIME',materialType:i%3===0?'REPORT':'ARTICLE',priority:1,accessCondition:'FREE',collectedAt:stamp,securities:{create:{securityId:security.id}}}});
 try{
  await prisma.accountWatchlistItem.createMany({data:accounts.map(a=>({accountId:a.id,securityId:security.id}))});
  const source=await Promise.all(Array.from({length:15},(_,i)=>create(i)));
  const first=await as(0,()=>loadStockNews(accounts[0]!.id));assert.equal(first.meta.total,15);assert.ok(first.data.every((r:any)=>!r.isRead));
  const newsId=source[0]!.id;
  // Viewing the list or fetching the summary must never mutate read state.
  assert.equal((await as(0,()=>loadStockNewsDetail(accounts[0]!.id,newsId))).data.isRead,false);
  assert.equal(await prisma.stockNewsRead.count(),0);
  await as(0,()=>markStockNewsRead(accounts[0]!.id,newsId));
  const originalRead=await prisma.stockNewsRead.findUniqueOrThrow({where:{userId_newsId:{userId:users[0]!.id,newsId}}});
  await as(0,()=>markStockNewsRead(accounts[0]!.id,newsId));
  assert.deepEqual(await prisma.stockNewsRead.findUniqueOrThrow({where:{userId_newsId:{userId:users[0]!.id,newsId}}}),originalRead);
  assert.equal((await as(0,()=>loadStockNewsDetail(accounts[0]!.id,newsId))).data.isRead,true);
  assert.equal((await as(1,()=>loadStockNewsDetail(accounts[1]!.id,newsId))).data.isRead,false);
  await assert.rejects(as(0,()=>markStockNewsRead(accounts[1]!.id,newsId)),(e:any)=>e.statusCode===404||e.status===404);
  await assert.rejects(as(0,()=>markAllStockNewsRead(accounts[0]!.id,{})));
  const articles=await as(0,()=>loadStockNews(accounts[0]!.id,{type:'ARTICLE'}));
  const late=await create(16);
  const bulk=await as(0,()=>markAllStockNewsRead(accounts[0]!.id,{type:'ARTICLE',snapshot:articles.meta.snapshot}));assert.equal(bulk.data.count,10);
  assert.equal((await as(0,()=>loadStockNewsDetail(accounts[0]!.id,late.id))).data.isRead,false);
  assert.equal((await as(0,()=>markAllStockNewsRead(accounts[0]!.id,{type:'ARTICLE',snapshot:articles.meta.snapshot}))).data.count,0);
  const all=await as(0,()=>markAllStockNewsRead(accounts[0]!.id,{snapshot:first.meta.snapshot}));assert.equal(all.data.count,4);
  assert.equal(await prisma.stockNewsRead.count({where:{userId:users[0]!.id}}),15);
  assert.equal(await prisma.stockNewsRead.count({where:{userId:users[1]!.id}}),0);
  // New client/request reads persisted state, and collection/source records are unmodified.
  assert.ok((await as(0,()=>loadStockNews(accounts[0]!.id,{snapshot:first.meta.snapshot}))).data.every((r:any)=>r.isRead));
  assert.deepEqual(await prisma.stockNewsItem.findMany({where:{id:{in:source.map(r=>r.id)}},orderBy:{id:'asc'}}),[...source].sort((a,b)=>a.id<b.id?-1:1));
 }finally{
  await prisma.stockNewsItem.deleteMany({where:{provider}});
  await prisma.accountWatchlistItem.deleteMany({where:{accountId:{in:accounts.map(a=>a.id)}}});
  await prisma.account.deleteMany({where:{id:{in:accounts.map(a=>a.id)}}});
  await prisma.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
  await prisma.security.delete({where:{id:security.id}});await prisma.$disconnect();
 }
});
