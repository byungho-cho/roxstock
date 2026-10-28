import test from 'node:test';import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {buildApp} from '../src/app.js';
import {passwordHash,randomToken} from '../src/auth/crypto.js';
import {hash} from '@roxstock/shared/news/policy';
import {profitTotals} from '../src/domain/investment-profit.js';
import {saveBugEvent,scanCollectionBugs} from '../src/domain/collection-bug-reports.js';
test('real auth: user scraps, original profit totals, 50-row stable paging and reporting epoch preserve history',async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&(/_test$/.test(url.pathname)||process.env.CI==='true'));
 process.env.AUTH_PUBLIC_ORIGIN='http://127.0.0.1:3000';const raw=new PrismaClient(),app=buildApp(),suffix=randomToken().slice(0,10),password='Abc12345!';
 const users=await Promise.all(['ADMIN','USER'].map(async role=>raw.authUser.create({data:{email:`np-${suffix}-${role}@example.invalid`,role,verifiedAt:new Date(),passwordHash:await passwordHash(password)}})));
 const accounts=await Promise.all(users.map((u,i)=>raw.account.create({data:{userId:u.id,name:'NP test '+i,brokerName:'TEST',cashBalance:0}})));
 const stocks=await Promise.all(['987451','987452'].map(symbol=>raw.security.create({data:{symbol,name:'NP isolated '+symbol,marketType:'KOSPI'}})));
 const login=async(i:number)=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:process.env.AUTH_PUBLIC_ORIGIN},payload:{email:users[i]!.email,password}});assert.equal(r.statusCode,200,r.body);const cookie=(r.headers['set-cookie'] as string[]).map(v=>v.split(';')[0]).join('; ');return {cookie,origin:process.env.AUTH_PUBLIC_ORIGIN!,'x-csrf-token':/rox_csrf=([^;]+)/.exec(cookie)![1]!};};
 const originalWindow=await raw.collectionBugReportingWindow.findUniqueOrThrow({where:{id:1}}),feature='np-report-'+suffix;let runId:bigint|undefined;
 try{
  const a=await login(0),b=await login(1),accountId=accounts[0]!.id,securityId=stocks[0]!.id,prefix=`/api/accounts/${accountId}`;
  const get=async(path:string,headers=a,status=200)=>{const r=await app.inject({url:path,headers});assert.equal(r.statusCode,status,r.body);return r.json();};
  const buy=await raw.buyTrade.create({data:{accountId,securityId,boughtAt:new Date('2009-01-02T00:00:00Z'),quantity:200,unitPrice:100}});
  await raw.sellTrade.createMany({data:Array.from({length:61},(_,i)=>({buyTradeId:buy.id,soldAt:new Date(i<11?'2024-02-23T06:00:00Z':'2025-10-23T06:00:00Z'),quantity:1,unitPrice:110}))});
  for(let i=0;i<55;i++){const cash=await raw.cashTransaction.create({data:{accountId,transactionType:'DIVIDEND',transactionDate:new Date('2025-10-23T06:00:00Z'),amount:3,balanceAfter:3}});await raw.dividend.create({data:{accountId,securityId,cashTransactionId:cash.id,receivedDate:new Date('2025-10-23'),grossAmount:3,netAmount:3}});}
  const other=await raw.buyTrade.create({data:{accountId,securityId:stocks[1]!.id,boughtAt:new Date('2023-01-02'),quantity:1,unitPrice:100}});await raw.sellTrade.create({data:{buyTradeId:other.id,soldAt:new Date('2025-10-23T07:00:00Z'),quantity:1,unitPrice:150}});
  const foreign=await raw.buyTrade.create({data:{accountId:accounts[1]!.id,securityId,boughtAt:new Date('2025-01-02'),quantity:1,unitPrice:100}});await raw.sellTrade.create({data:{buyTradeId:foreign.id,soldAt:new Date('2025-10-23'),quantity:1,unitPrice:999999}});
  const before=await raw.buyTrade.findMany({where:{accountId}});
  const n=[];for(let i=0;i<3;i++)n.push(await raw.stockNewsItem.create({data:{provider:'NP_TEST',providerId:suffix+i,canonicalHash:hash(suffix+'u'+i),fingerprint:hash(suffix+'f'+i),title:'테스트 공개 소식 '+i,originalUrl:'https://www.hankyung.com/article/nptest'+i,sourceName:'TEST',materialType:'ARTICLE',priority:1,publishedAt:new Date(),collectedAt:new Date(Date.now()+i),securities:{create:{securityId}}}}));
  await raw.accountWatchlistItem.createMany({data:accounts.map(account=>({accountId:account.id,securityId,listType:'WATCHLIST'}))});
  const scrapPath=(i:number)=>prefix+'/stock-news/'+n[i]!.id+'/scrap';
  assert.equal((await app.inject({url:prefix+'/stock-news'})).statusCode,401);
  assert.equal((await app.inject({method:'PUT',url:scrapPath(0),headers:{...a,'x-csrf-token':'wrong'},payload:{saved:true}})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url:scrapPath(0),headers:b,payload:{saved:true}})).statusCode,404);
  for(const i of [0,1,0])assert.equal((await app.inject({method:'PUT',url:scrapPath(i),headers:a,payload:{saved:true}})).statusCode,200);
  assert.equal(await raw.stockNewsScrap.count({where:{userId:users[0]!.id}}),2);
  const list=await get(prefix+'/stock-news?type=SCRAP');assert.equal(list.meta.total,2);assert.ok(list.data.every((r:any)=>r.isScrapped));
  const userList=await get(`/api/accounts/${accounts[1]!.id}/stock-news?type=SCRAP`,b);assert.equal(userList.meta.total,0);
  const detail=await get(prefix+'/stock-news/'+n[1]!.id+'?'+new URLSearchParams({type:'SCRAP',snapshot:list.meta.snapshot}));assert.equal(detail.meta.nextId,String(n[0]!.id));assert.equal(detail.meta.previousId,null);
  const relogged=await login(0);assert.equal((await get(prefix+'/stock-news?type=SCRAP',relogged)).meta.total,2);
  assert.equal((await app.inject({method:'PUT',url:scrapPath(1),headers:a,payload:{saved:false}})).statusCode,200);
  const removed=await get(prefix+'/stock-news/'+n[1]!.id+'?'+new URLSearchParams({type:'SCRAP',snapshot:list.meta.snapshot}));assert.equal(removed.data.isScrapped,false);assert.equal(removed.meta.nextId,String(n[0]!.id));
  const extras=[];for(let i=3;i<15;i++)extras.push(await raw.stockNewsItem.create({data:{provider:'NP_TEST',providerId:suffix+i,canonicalHash:hash(suffix+'u'+i),fingerprint:hash(suffix+'f'+i),title:'Paging fixture',originalUrl:'https://www.hankyung.com/article/nptest'+i,sourceName:'TEST',materialType:'ARTICLE',priority:1,publishedAt:new Date(),collectedAt:new Date(Date.now()+i),securities:{create:{securityId}}}}));
  await raw.stockNewsScrap.createMany({data:extras.map(news=>({userId:users[0]!.id,newsId:news.id}))});
  const firstScraps=await get(prefix+'/stock-news?type=SCRAP');assert.equal(firstScraps.data.length,10);assert.equal(firstScraps.meta.total,13);const removedCursor=firstScraps.meta.nextCursor;
  assert.equal((await app.inject({method:'PUT',url:prefix+'/stock-news/'+removedCursor+'/scrap',headers:a,payload:{saved:false}})).statusCode,200);
  const nextScraps=await get(prefix+'/stock-news?'+new URLSearchParams({type:'SCRAP',snapshot:firstScraps.meta.snapshot,cursor:removedCursor}));assert.equal(nextScraps.data.length,3);assert.ok(nextScraps.data.every((r:any)=>!firstScraps.data.some((p:any)=>p.id===r.id)));
  await raw.stockNewsScrap.deleteMany({where:{newsId:{in:extras.map(n=>n.id)}}});
  const measured=Date.now(),stats=await get(prefix+'/investment-profit/statistics?securityId='+securityId);assert.equal(stats.meta.completeHistory,true);assert.deepEqual(stats.data.years.map((y:any)=>y.year),[2025,2024,2009]);assert.equal('events' in stats.data,false);assert.ok(stats.data.years.every((y:any)=>!('events' in y)));
  const legacy=await get(prefix+'/investment-profit?securityId='+securityId);const expected=profitTotals(legacy.data.events);let page=await get(prefix+'/investment-profit/entries?securityId='+securityId),all=page.data.rows;assert.equal(page.data.total,116);assert.equal(all.length,50);assert.deepEqual(page.data.totals,expected);assert.equal(page.data.months[0].totals.total,'665.00000000');const snapshot=page.data.snapshot;
  while(page.data.nextCursor){page=await get(prefix+'/investment-profit/entries?'+new URLSearchParams({securityId:String(securityId),snapshot,cursor:page.data.nextCursor}));all.push(...page.data.rows);}
  assert.equal(all.length,116);assert.equal(new Set(all.map((r:any)=>r.key)).size,116);assert.equal(all.reduce((s:number,r:any)=>s+Number(r.amount),0),775);assert.ok(all.every((r:any)=>r.security.id===String(securityId)));assert.deepEqual(all.map((r:any)=>r.at),all.map((r:any)=>r.at).sort().reverse());
  const monthly=await get(prefix+'/investment-profit/entries?'+new URLSearchParams({year:'2025',month:'10'}));assert.equal(monthly.data.total,106);assert.equal(monthly.data.totals.total,'715.00000000');
  await get(prefix+'/investment-profit/statistics?securityId='+securityId,b,404);await get(prefix+'/investment-profit/entries',b,404);await get(prefix+'/investment-profit/entries?month=10',a,400);await get(prefix+'/investment-profit/entries?year=2025&month=13',a,400);
  assert.deepEqual(await raw.buyTrade.findMany({where:{accountId}}),before);
  await raw.cashTransaction.create({data:{accountId,transactionType:'DEPOSIT',transactionDate:new Date(),amount:1,balanceAfter:1}});
  await get(prefix+'/investment-profit/entries?'+new URLSearchParams({securityId:String(securityId),snapshot}),a,409);
  console.log('NP_STATISTICS_MEASUREMENT',JSON.stringify({ms:Date.now()-measured,years:stats.data.years.length,statisticsBytes:Buffer.byteLength(JSON.stringify(stats)),rows:all.length}));
  const cut=new Date(Date.now()-2000);
  const old={sourceKey:'np-old-'+suffix,feature,code:'DATABASE_WRITE_FAILED',severity:'ERROR' as const,summary:'보존 검증',observedAt:new Date(+cut-1)};await saveBugEvent(raw,old);const archived=await raw.collectionBugReport.findFirstOrThrow({where:{feature}});await raw.collectionBugReportingWindow.update({where:{id:1},data:{reportingFrom:cut}});assert.equal(await saveBugEvent(raw,{...old,code:'COLLECTION_FAILED'}),false);
  assert.equal((await get('/api/collection/bug-reports?state=ALL')).data.rows.some((r:any)=>r.feature===feature),false);
  await saveBugEvent(raw,{...old,sourceKey:'np-new-'+suffix,observedAt:new Date(+cut+1)});const visible=(await get('/api/collection/bug-reports?state=ALL')).data.rows.find((r:any)=>r.feature===feature);assert.equal(visible.occurrences,1);assert.notEqual(visible.id,String(archived.id));assert.deepEqual(await raw.collectionBugReport.findUnique({where:{id:archived.id}}),archived);
  assert.equal((await get('/api/collection/bug-reports/'+visible.id)).data.events.length,1);await get('/api/collection/bug-reports/'+archived.id,a,404);
  runId=(await raw.collectorRun.create({data:{jobType:'dart-financial-statements',provider:'NP_TEST',status:'FAILED',finishedAt:new Date(),failureCount:1,metadata:{phase:'CURRENT'}}})).id;
  await raw.collectorRunItem.create({data:{runId,status:'FAILED',symbol:'987451',message:'DATABASE_WRITE_FAILED'}});await scanCollectionBugs(raw);assert.ok(await raw.collectionBugOccurrence.count({where:{runId}}),'Actual CURRENT failures remain reported');
  await app.close();const restarted=buildApp();try{const r=await restarted.inject({url:prefix+'/stock-news?type=SCRAP',headers:relogged});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().meta.total,1);assert.equal((await raw.collectionBugReportingWindow.findUniqueOrThrow({where:{id:1}})).reportingFrom.toISOString(),cut.toISOString());}finally{await restarted.close();}
 }finally{
  await raw.collectionBugReportingWindow.update({where:{id:1},data:{reportingFrom:originalWindow.reportingFrom}});
  const reports=await raw.collectionBugReport.findMany({where:{OR:[{feature},{events:{some:{runId:runId??0n}}}]},select:{id:true}});await raw.collectionBugOccurrence.deleteMany({where:{reportId:{in:reports.map(r=>r.id)}}});await raw.collectionBugReport.deleteMany({where:{id:{in:reports.map(r=>r.id)}}});if(runId){await raw.collectorRunItem.deleteMany({where:{runId}});await raw.collectorRun.delete({where:{id:runId}});}
  const ids=accounts.map(a=>a.id);await raw.stockNewsItem.deleteMany({where:{provider:'NP_TEST',providerId:{startsWith:suffix}}});await raw.accountWatchlistItem.deleteMany({where:{accountId:{in:ids}}});await raw.dividend.deleteMany({where:{accountId:{in:ids}}});await raw.cashTransaction.deleteMany({where:{accountId:{in:ids}}});await raw.sellTrade.deleteMany({where:{buyTrade:{accountId:{in:ids}}}});await raw.buyTrade.deleteMany({where:{accountId:{in:ids}}});await raw.account.deleteMany({where:{id:{in:ids}}});await raw.security.deleteMany({where:{id:{in:stocks.map(s=>s.id)}}});await raw.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await app.close();await raw.$disconnect();await prisma.$disconnect();
 }
});
