import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../src/app.js';
import {prisma} from '@roxstock/shared/lib/prisma';
import {readProfitYears,publishProfitYear} from '../src/routes/investment-profit.js';
import {recentBuys} from '../../frontend/src/pages/dashboard/recentBuysData.js';
import {calculateProfit,amount,totals,groups} from '../../frontend/src/pages/investment-profit/profitData.js';
import type {TradeDto,CashTransactionDto,BuyLotDto} from '../../frontend/src/data/roxstockApi.js';

test('real DB: recent ranges equal legacy; annual aggregates invalidate, reject stale publication and reuse unaffected years',async()=>{
 const app=buildApp(),account=await prisma.account.create({data:{name:'Phase18 test',brokerName:'test',cashBalance:'0'}}),security=await prisma.security.create({data:{symbol:'989118',name:'Phase18 stock',marketType:'OTHER'}});
 const get=async(path:string)=>{const r=await app.inject({method:'GET',url:`/api/accounts/${account.id}/${path}`});assert.equal(r.statusCode,200,r.body);return r.json();};
 try{
  await prisma.marketPrice.create({data:{securityId:security.id,currentPrice:'150.1234',previousClosePrice:'100',priceUpdatedAt:new Date()}});
  const now=new Date(),kst=new Date(now.getTime()+9*3600000),year=kst.getUTCFullYear(),today=kst.toISOString().slice(0,10);
  const buys=[];
  for(let i=0;i<12;i++)buys.push(await prisma.buyTrade.create({data:{accountId:account.id,securityId:security.id,boughtAt:new Date(Date.UTC(year,kst.getUTCMonth()-i,3)),quantity:'10.1234',unitPrice:'100.1234'}}));
  const historical=await prisma.buyTrade.create({data:{accountId:account.id,securityId:security.id,boughtAt:new Date(`${year-2}-01-01T00:00:00Z`),quantity:'10.1234',unitPrice:'100.1234'}});
  await prisma.sellTrade.create({data:{buyTradeId:historical.id,soldAt:new Date(`${year-1}-12-31T14:59:59Z`),quantity:'2.1234',unitPrice:'90.1234'}});
  const cash=await prisma.cashTransaction.create({data:{accountId:account.id,transactionType:'DIVIDEND',transactionDate:new Date(`${year-1}-01-01T00:00:00Z`),amount:'80',balanceAfter:'0'}});
  const dividend=await prisma.dividend.create({data:{accountId:account.id,securityId:security.id,cashTransactionId:cash.id,receivedDate:new Date(`${year-1}-01-01`),grossAmount:'100',netAmount:'80'}});
  const snap=await prisma.dailyAccountSnapshot.create({data:{accountId:account.id,snapshotDate:new Date(`${year-1}-12-31`),cashBalance:'0',stockValue:'100',totalAssetValue:'100',investmentAmount:'90'}});
  const all=await get('buy-lots?remainingOnly=false');
  for(const months of [0,1,4,24]){
   const expected=recentBuys(all.data as BuyLotDto[],today,months),actual=await get(`recent-buys?months=${months}`);
   assert.deepEqual(actual.data.map((x:BuyLotDto)=>x.id),expected.rows.map(x=>x.id));assert.equal(actual.meta.count,expected.count);assert.equal(actual.meta.more,expected.more);assert.equal(actual.meta.total,all.data.length);
   for(let i=0;i<actual.data.length;i++)for(const field of ['quantity','remainingQuantity','unitPrice','currentPrice','profitLoss','returnRate','remainingPurchaseAmount'] as const)assert.equal(actual.data[i][field],expected.rows[i]![field]);
   if(months===0){assert.equal(actual.data.length,5);assert.ok(JSON.stringify(actual).length<JSON.stringify(all).length);}
  }
  const revision=async()=> (await prisma.accountProfitRevision.findUniqueOrThrow({where:{accountId:account.id}})).revision;
  const source=await revision(),years=await readProfitYears(account.id,today,source);assert.ok(years);
  const legacy=calculateProfit((await get(`trades?to=${today}`)).data as TradeDto[],(await get(`cash-transactions?types=DIVIDEND&to=${today}&limit=100`)).data as CashTransactionDto[],today);
  const events=years.flatMap(y=>y.events).map(e=>({...e,buy:amount(e.buy),sell:amount(e.sell),cost:amount(e.cost),trading:amount(e.trading),dividend:amount(e.dividend)}));
  assert.deepEqual(totals(events),legacy.totals);
  for(const by of ['year','stock','month'] as const){const summary=(rows:typeof events)=>groups(rows,by).map(({id,label,totals})=>({id,label,totals}));assert.deepEqual(summary(events),summary(legacy.events));}
  const persisted=await prisma.investmentYearAggregate.findMany({where:{accountId:account.id},orderBy:{year:'asc'}});assert.equal(persisted.length,2);assert.ok(persisted.every(x=>x.state==='VALID'));
  await prisma.dividend.update({where:{id:dividend.id},data:{netAmount:'81'}});
  assert.ok(await revision()>source);assert.equal(await publishProfitYear(account.id,source,years.find(x=>x.year===year-1)!),false);
  assert.equal((await prisma.investmentYearAggregate.findUniqueOrThrow({where:{accountId_year:{accountId:account.id,year:year-1}}})).state,'DIRTY');
  const updated=await get('investment-profit');assert.equal(updated.meta.state,'VALID');assert.equal((await get('investment-profit')).meta.cacheHit,true);assert.ok(updated.data.events.some((e:{dividend:string})=>amount(e.dividend)===amount('81')));
  const unaffected=await prisma.investmentYearAggregate.findUniqueOrThrow({where:{accountId_year:{accountId:account.id,year:year-2}}});assert.equal(unaffected.calculatedAt.getTime(),persisted[0]!.calculatedAt.getTime());
  await prisma.dailyAccountSnapshot.update({where:{id:snap.id},data:{investmentAmount:'91'}});assert.equal((await get('investment-profit')).data.capital.find((x:{year:number})=>x.year===year-1).investmentAmount,'91');
  await prisma.buyTrade.update({where:{id:historical.id},data:{unitPrice:'101.1234'}});assert.ok((await prisma.investmentYearAggregate.findMany({where:{accountId:account.id}})).every(x=>x.state==='DIRTY'));await get('investment-profit');
  await prisma.cashTransaction.update({where:{id:cash.id},data:{transactionDate:new Date(`${year-2}-06-01T00:00:00Z`)}});await get('investment-profit');
  await prisma.dividend.delete({where:{id:dividend.id}});await prisma.cashTransaction.delete({where:{id:cash.id}});assert.ok(!(await get('investment-profit')).data.events.some((e:{kind:string})=>e.kind==='DIVIDEND'));
  // Legacy backdated sells can precede a corrected buy date; connected cost changes must dirty that earlier year too.
  const future=await prisma.buyTrade.create({data:{accountId:account.id,securityId:security.id,boughtAt:new Date(`${year+1}-01-01T00:00:00Z`),quantity:'2',unitPrice:'100'}});
  const backdated=await prisma.sellTrade.create({data:{buyTradeId:future.id,soldAt:new Date(`${year-3}-01-01T00:00:00Z`),quantity:'1',unitPrice:'110'}});
  await get('investment-profit');
  await prisma.buyTrade.update({where:{id:future.id},data:{unitPrice:'101'}});
  assert.equal((await prisma.investmentYearAggregate.findUniqueOrThrow({where:{accountId_year:{accountId:account.id,year:year-3}}})).state,'DIRTY');
  const corrected=await get('investment-profit');assert.ok(corrected.data.events.some((e:{date:string;trading:string})=>e.date.startsWith(String(year-3))&&amount(e.trading)===amount('9')));
  await prisma.sellTrade.delete({where:{id:backdated.id}});await prisma.buyTrade.delete({where:{id:future.id}});await get('investment-profit');
  const raceRevision=await revision(),raceYears=await readProfitYears(account.id,today,raceRevision);assert.ok(raceYears);
  let locked!:()=>void,release!:()=>void;const lockReady=new Promise<void>(r=>{locked=r;}),resume=new Promise<void>(r=>{release=r;});
  const writer=prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM accounts WHERE id=${account.id} FOR UPDATE`;locked();await resume;await tx.cashTransaction.create({data:{accountId:account.id,transactionType:'DEPOSIT',transactionDate:new Date(`${year-1}-01-01`),amount:'1',balanceAfter:'1'}});});
  await lockReady;const publication=publishProfitYear(account.id,raceRevision,raceYears.find(y=>y.year===year-1)!);release();await writer;assert.equal(await publication,false);
  const basic=await get('compound-plans?view=basic');assert.equal(basic.data.currentAssets,null);
 }finally{
  await prisma.dividend.deleteMany({where:{accountId:account.id}});await prisma.cashTransaction.deleteMany({where:{accountId:account.id}});await prisma.sellTrade.deleteMany({where:{buyTrade:{accountId:account.id}}});await prisma.buyTrade.deleteMany({where:{accountId:account.id}});await prisma.dailyAccountSnapshot.deleteMany({where:{accountId:account.id}});await prisma.account.delete({where:{id:account.id}});await prisma.marketPrice.deleteMany({where:{securityId:security.id}});await prisma.security.delete({where:{id:security.id}});await app.close();await prisma.$disconnect();
 }
});

test('phase26: same account other stock and same stock other account stay isolated through cached annual API',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/);
 const app=buildApp(),accounts=await Promise.all(['A','B'].map(name=>prisma.account.create({data:{name:'Phase26 '+name,brokerName:'CI',cashBalance:'0'}}))),securities=await Promise.all(['P26001','P26002'].map(symbol=>prisma.security.create({data:{symbol,name:'Phase26 '+symbol,marketType:'OTHER'}})));
 try{
  for(const [a,s,buyPrice,sellPrice,net] of [[0,0,'100','150','20'],[0,1,'100','50','99'],[1,0,'400','500','7']] as const){
   const buy=await prisma.buyTrade.create({data:{accountId:accounts[a].id,securityId:securities[s].id,boughtAt:new Date('2025-01-02T00:00:00Z'),quantity:'10',unitPrice:buyPrice}});
   await prisma.sellTrade.create({data:{buyTradeId:buy.id,soldAt:new Date('2025-02-02T00:00:00Z'),quantity:'2',unitPrice:sellPrice}});
   const cash=await prisma.cashTransaction.create({data:{accountId:accounts[a].id,transactionType:'DIVIDEND',transactionDate:new Date('2025-03-03'),amount:net,balanceAfter:net}});
   await prisma.dividend.create({data:{accountId:accounts[a].id,securityId:securities[s].id,cashTransactionId:cash.id,receivedDate:new Date('2025-03-03'),grossAmount:net,netAmount:net}});
  }
  const results=[];
  for(const [a,s,profit,dividendValue] of [[0,0,'100','20'],[0,1,'-100','99'],[1,0,'200','7'],[0,0,'100','20']] as const){
   const response=await app.inject(`/api/accounts/${accounts[a].id}/investment-profit?securityId=${securities[s].id}`);assert.equal(response.statusCode,200,response.body);const data=response.json().data;
   assert.equal(data.accountId,String(accounts[a].id));assert.equal(data.securityId,String(securities[s].id));assert.equal(data.capital.length,0);assert.ok(data.events.every((e:any)=>e.securityId===data.securityId));
   const t=totals(data.events.map((e:any)=>({...e,buy:amount(e.buy),sell:amount(e.sell),cost:amount(e.cost),trading:amount(e.trading),dividend:amount(e.dividend)})));assert.equal(t.trading,amount(profit));assert.equal(t.dividend,amount(dividendValue));results.push({account:String(accounts[a].id),security:String(securities[s].id),profit,dividend:dividendValue,count:data.events.length});
  }
  assert.equal((await app.inject(`/api/accounts/${accounts[0].id}/investment-profit?securityId=bad`)).statusCode,400);
  console.log('PHASE26_SCOPE_PROOF',JSON.stringify(results));
 }finally{
  const ids=accounts.map(a=>a.id);await prisma.dividend.deleteMany({where:{accountId:{in:ids}}});await prisma.cashTransaction.deleteMany({where:{accountId:{in:ids}}});await prisma.sellTrade.deleteMany({where:{buyTrade:{accountId:{in:ids}}}});await prisma.buyTrade.deleteMany({where:{accountId:{in:ids}}});await prisma.account.deleteMany({where:{id:{in:ids}}});await prisma.security.deleteMany({where:{id:{in:securities.map(s=>s.id)}}});await app.close();await prisma.$disconnect();
 }
});
