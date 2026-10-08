import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
import { buildApp } from '../app.js';
const d=(v:number)=>new Prisma.Decimal(v);
function fixture(type='DEPOSIT') {
 const cash:any={id:2n,accountId:1n,transactionType:type,amount:d(100),feeTaxAmount:d(type==='BUY'?-10:10),balanceAfter:d(900),transactionDate:new Date(),createdAt:new Date('2026-10-01'),updatedAt:new Date(),memo:null,dividend:type==='DIVIDEND'?{id:3n,securityId:4n,grossAmount:d(110)}:null};
 let rows:any[]=[{...cash,id:1n,balanceAfter:d(700),createdAt:new Date('2026-09-01')},cash,{...cash,id:3n,balanceAfter:d(1200),createdAt:new Date('2026-10-02')}];
 const writes:any[]=[];const reads:any[]=[];const locks:bigint[]=[];
 const tx:any={$queryRaw:async(_parts:any,accountId:bigint)=>{locks.push(accountId);},cashTransaction:{
 findUnique:async({where}:any)=>rows.find(x=>x.id===where.id)??null,
 findFirst:async(args:any)=>{reads.push(args);assert.deepEqual(args.orderBy,[{createdAt:'desc'},{id:'desc'}]);return rows.filter(x=>x.accountId===args.where.accountId).sort((a,b)=>b.createdAt-a.createdAt||Number(b.id-a.id))[0]??null;},
 update:async({where,data}:any)=>{Object.assign(rows.find(x=>x.id===where.id),data);},
 delete:async({where}:any)=>{rows=rows.filter(x=>x.id!==where.id);},
 create:async({data}:any)=>{const entry={...cash,...data,id:BigInt(Math.max(...rows.map(x=>Number(x.id)),0)+1),createdAt:new Date()};rows.push(entry);return entry;}
 },account:{findUnique:async()=>({isActive:true,cashBalance:d(99999)}),update:async(args:any)=>{writes.push(args);}},security:{findUnique:async()=>({isActive:true})},dividend:{update:async()=>({}),delete:async()=>({})}};
 return {tx,cash,writes,reads,locks,rows:()=>rows,setRows:(values:any[])=>{rows=values;}};
}
async function withApp(f:ReturnType<typeof fixture>,run:(app:ReturnType<typeof buildApp>)=>Promise<void>){const original=prisma.$transaction;prisma.$transaction=(async(fn:any,options:any)=>{assert.equal(options.isolationLevel,'Serializable');return fn(f.tx);}) as any;const app=buildApp();try{await run(app);}finally{await app.close();prisma.$transaction=original;}}
for(const type of ['DEPOSIT','WITHDRAWAL','BUY','SELL','DIVIDEND']) test(`${type}: past edit preserves current; latest edit and delete sync only compatibility cache`,async()=>{
 const f=fixture(type);await withApp(f,async app=>{
  const patch=(id:string,balance:string)=>app.inject({method:'PATCH',url:`/api/cash-transactions/${id}`,payload:{accountId:'1',balanceAfter:balance,memo:'수정'}});
  const past=await patch('2','880');assert.equal(past.statusCode,200,past.body);assert.equal(past.json().data.currentBalance,'1200');assert.equal(past.json().data.cashBalanceAdjusted,false);assert.equal(f.writes.length,0);assert.equal(f.cash.amount.toString(),'100');assert.equal(f.cash.createdAt.toISOString(),'2026-10-01T00:00:00.000Z');
  assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/2?accountId=1'})).statusCode,409);
  const latest=await patch('3','1300');assert.equal(latest.statusCode,200,latest.body);assert.equal(latest.json().data.currentBalance,'1300');assert.equal(latest.json().data.cashBalanceAdjusted,true);assert.equal(f.writes.at(-1).data.cashBalance.toString(),'1300');
  const deleted=await app.inject({method:'DELETE',url:'/api/cash-transactions/3?accountId=1'});assert.equal(deleted.statusCode,200,deleted.body);assert.equal(deleted.json().data.currentBalance,'880');assert.equal(f.writes.at(-1).data.cashBalance.toString(),'880');
  assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/3'})).statusCode,404);
  assert.ok(f.locks.every(id=>id===1n)); // No source trade/snapshot update method is supplied: any cascade fails.
 });
});
test('scope mismatch, concurrent new latest, malformed values and retired balance endpoint reject writes',async()=>{
 const f=fixture('BUY');await withApp(f,async app=>{
  for(const field of ['feeTaxAmount','balanceAfter'])for(const value of field==='balanceAfter'?['','-1','NaN']:['','NaN'])assert.equal((await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{[field]:value}})).statusCode,400);
  assert.equal((await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{accountId:'2',balanceAfter:'20'}})).statusCode,404);
  assert.equal((await app.inject({method:'DELETE',url:'/api/cash-transactions/3?accountId=2'})).statusCode,404);
  const stale=await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{expectedLatestId:'2',balanceAfter:'20'}});assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'LATEST_CASH_CHANGED');assert.equal(f.cash.balanceAfter.toString(),'900');
  assert.equal((await app.inject({method:'PATCH',url:'/api/accounts/1/cash-balance',payload:{amount:'20'}})).statusCode,409);assert.equal(f.writes.length,0);
 });
});
test('signed tax on legacy buy remains editable without changing original trade',async()=>{
 const f=fixture('BUY');await withApp(f,async app=>{const result=await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{feeTaxAmount:'-10',balanceAfter:'900'}});assert.equal(result.statusCode,200,result.body);assert.equal(f.cash.feeTaxAmount.toString(),'-10');assert.equal(f.cash.amount.toString(),'100');assert.equal(f.writes.length,0);});
});
test('deleting last row returns explicit missing state without old cache fallback',async()=>{
 const f=fixture();f.setRows([f.cash]);await withApp(f,async app=>{const result=await app.inject({method:'DELETE',url:'/api/cash-transactions/2'});assert.equal(result.statusCode,200,result.body);assert.equal(result.json().data.currentBalance,null);assert.equal(result.json().data.balanceStatus,'NO_TRANSACTIONS');assert.equal(f.writes.length,0);});
});
test('backdated new deposit uses latest ledger, tie IDs and account scope; unknown basis fails',async()=>{
 const f=fixture();f.setRows([...f.rows(),{...f.cash,id:4n,createdAt:new Date('2026-10-02'),balanceAfter:d(1500)},{...f.cash,id:100n,accountId:2n,createdAt:new Date(),balanceAfter:d(9999)}]);
 await withApp(f,async app=>{
  const post=(type='DEPOSIT')=>app.inject({method:'POST',url:'/api/cash-transactions',payload:{accountId:'1',transactionType:type,amount:'100',transactionDate:'2000-01-01T00:00:00Z'}});
  const result=await post();assert.equal(result.statusCode,201,result.body);assert.equal(result.json().data.balanceAfter,'1600');assert.equal(f.rows().at(-1).transactionDate.toISOString(),'2000-01-01T00:00:00.000Z');
  f.setRows([{...f.cash,balanceAfter:null}]);assert.equal((await post()).statusCode,409);
  f.setRows([]);assert.equal((await post('WITHDRAWAL')).statusCode,409);const first=await post();assert.equal(first.statusCode,201,first.body);assert.equal(first.json().data.balanceAfter,'100');
 });
});
test('latest is re-read after acquiring account lock, so concurrent deletion cannot edit a stale row',async()=>{
 const f=fixture();f.tx.$queryRaw=async()=>f.setRows([]);await withApp(f,async app=>{const result=await app.inject({method:'PATCH',url:'/api/cash-transactions/2',payload:{balanceAfter:'200'}});assert.equal(result.statusCode,409,result.body);assert.equal(result.json().error.code,'CASH_CHANGED');assert.equal(f.writes.length,0);});
});
