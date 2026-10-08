import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../src/app.js';
import {prisma} from '../src/lib/prisma.js';
test('cash12 real MariaDB: account latest, backdated dates, historical edits, deletions and competing writes',async()=>{
 const app=buildApp();const accounts=await Promise.all([1,2].map(i=>prisma.account.create({data:{name:`Cash12 integration ${i}`,brokerName:'TEST',cashBalance:'99999'}})));const [a,b]=accounts;
 const call=async(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,payload?:any,expected=200)=>{const r=await app.inject({method,url:'/api'+url,...(payload?{payload}:{})});assert.equal(r.statusCode,expected,r.body);return r.json().data;};
 const deposit=(accountId:bigint,amount:string)=>call('POST','/cash-transactions',{accountId:String(accountId),transactionType:'DEPOSIT',transactionDate:'2000-01-01T00:00:00Z',amount},201);
 const latest=()=>prisma.cashTransaction.findFirst({where:{accountId:a.id},orderBy:[{createdAt:'desc'},{id:'desc'}]});
 const consistent=async()=>{const row=await latest(),expected=row?.balanceAfter.toString()??null;const overview=await call('GET',`/accounts/${a.id}/cash-overview?year=2020&month=2`);assert.equal(overview.account.currentBalance,expected);assert.equal(overview.account.latestTransactionId,row?.id.toString()??null);assert.equal(overview.recentTransactions[0]?.balanceAfter??null,expected);const list=await call('GET','/accounts');assert.equal(list.find((x:any)=>x.id===String(a.id)).cashBalance,expected);const dashboard=await call('GET',`/accounts/${a.id}/dashboard`);assert.equal(dashboard.cashBalance,expected);assert.equal(dashboard.totalAssetValue,expected);if(row)assert.equal((await prisma.account.findUniqueOrThrow({where:{id:a.id}})).cashBalance.toString(),expected);};
 try{
  await consistent();await call('POST','/cash-transactions',{accountId:String(a.id),transactionType:'WITHDRAWAL',transactionDate:'2000-01-01T00:00:00Z',amount:'1'},409);
  const first=await deposit(a.id,'1000');await deposit(b.id,'9000');const second=await deposit(a.id,'100');await consistent();const stamp=(await latest())!.createdAt;
  await call('PATCH',`/cash-transactions/${first.id}`,{accountId:String(a.id),balanceAfter:'800'});assert.equal((await latest())!.balanceAfter.toString(),'1100');await consistent();
  await call('PATCH',`/cash-transactions/${second.id}`,{accountId:String(a.id),expectedLatestId:second.id,balanceAfter:'1200'});assert.deepEqual((await latest())!.createdAt,stamp);await consistent();
  await call('PATCH',`/cash-transactions/${second.id}`,{accountId:String(b.id),balanceAfter:'1'},404);await call('DELETE',`/cash-transactions/${first.id}?accountId=${a.id}`,undefined,409);
  await call('DELETE',`/cash-transactions/${second.id}?accountId=${a.id}`);await consistent();assert.equal((await latest())!.balanceAfter.toString(),'800');
  const tieTime=new Date('2026-01-01');await prisma.cashTransaction.update({where:{id:BigInt(first.id)},data:{createdAt:tieTime}});
  const tied=await prisma.cashTransaction.create({data:{accountId:a.id,transactionType:'DEPOSIT',transactionDate:new Date('1999-01-01'),createdAt:tieTime,amount:'1',balanceAfter:'850'}});await prisma.account.update({where:{id:a.id},data:{cashBalance:'850'}});assert.equal((await latest())!.id,tied.id);await consistent();
  await Promise.all([deposit(a.id,'10'),deposit(a.id,'20')]);assert.equal((await latest())!.balanceAfter.toString(),'880');await consistent();
  for(let i=0;i<3;i++){
   const before=(await latest())!;const results=await Promise.all([
    app.inject({method:'POST',url:'/api/cash-transactions',payload:{accountId:String(a.id),transactionType:'DEPOSIT',transactionDate:'1990-01-01T00:00:00Z',amount:'5'}}),
    app.inject({method:'PATCH',url:`/api/cash-transactions/${before.id}`,payload:{accountId:String(a.id),expectedLatestId:String(before.id),balanceAfter:'900'}}),
    app.inject({method:'DELETE',url:`/api/cash-transactions/${before.id}?accountId=${a.id}`})
   ]);assert.equal(results[0].statusCode,201,results[0].body);for(const r of results.slice(1))assert.ok([200,404,409].includes(r.statusCode),r.body);await consistent();
  }
  while(await latest()){const row=(await latest())!;await call('DELETE',`/cash-transactions/${row.id}?accountId=${a.id}`);}await consistent();assert.equal((await call('GET',`/accounts/${b.id}/cash-overview`)).account.currentBalance,'9000');
 }finally{await prisma.cashTransaction.deleteMany({where:{accountId:{in:accounts.map(x=>x.id)}}});await prisma.account.deleteMany({where:{id:{in:accounts.map(x=>x.id)}}});await app.close();await prisma.$disconnect();}
});
