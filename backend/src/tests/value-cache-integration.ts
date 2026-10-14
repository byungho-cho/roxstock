import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {PrismaClient,Prisma} from '../generated/prisma/index.js';
import {collectionClient} from '../lib/collection-client.js';
import {buildApp} from '../app.js';
import {ValueReadModel} from '../read-model/value-cache.js';
import {loadValueRows,valueFinancialInclude,projectValueRows,publicValueRows} from '../read-model/value-rows.js';
import {selectValueListAnalysis} from '../domain/value-list-analysis.js';
import {sortAnalysisRows,parseAnalysisSort} from '../domain/analysis-sort.js';
const raw=new PrismaClient({log:[{emit:'event',level:'query'}]});let sql=0;raw.$on('query',()=>sql++);
const db=collectionClient(raw),year=2026,created:bigint[]=[];
const app=buildApp();app.valueReadModel=new ValueReadModel(db);
async function measure(name:string,request:()=>Promise<unknown>,count=5){
 const samples=[];for(let i=0;i<count;i++){const before=sql,start=performance.now();const result=await request();samples.push({ms:performance.now()-start,dbQueries:sql-before,cache:(result as any)?.data?.cache?.status??(result as any)?.meta?.status??'BASELINE'});}
 const times=samples.map(s=>s.ms).sort((a,b)=>a-b);return {name,count,medianMs:times[Math.floor(count/2)],minMs:times[0],maxMs:times.at(-1),samples};
}
try{
 await db.analysisReadCache.deleteMany({where:{key:`value:${year}`}});
 for(let i=0;i<50;i++){
  const s=await db.security.create({data:{symbol:'VC'+String(i).padStart(4,'0'),name:'캐시 검증 '+i,marketType:'KOSPI',securityType:'STOCK'}});created.push(s.id);
  await db.marketPrice.create({data:{securityId:s.id,currentPrice:'100',previousClosePrice:'90',priceUpdatedAt:new Date('2026-10-13T11:00:00Z')}});
  await db.financialStatement.create({data:{securityId:s.id,fiscalYear:2025,periodType:'ANNUAL',periodEndDate:new Date('2025-12-31'),netIncome:String(i-25),totalEquity:'1000',revenue:'2000'}});
  await db.periodValuation.create({data:{securityId:s.id,fiscalYear:2025,periodType:'ANNUAL',status:'SUCCESS',values:{eps:String(i-25),bps:'100',roe:'10',per:null,pbr:null},provenance:{periodEnd:'2025-12-31',fsDivision:'OFS',roeBasis:'TOTAL_SAME_DIVISION',source:'MANUAL_VERIFIED'},reasons:{}}});
 }
 const loadFinancials=()=>db.security.findMany({where:{isActive:true},include:valueFinancialInclude(year)});
 let financials:Awaited<ReturnType<typeof loadFinancials>>|undefined;
 const baseline=async(cold=false)=>{
  if(cold||!financials)financials=await loadFinancials();
  const prices=await db.security.findMany({where:{isActive:true},select:{id:true,marketPrice:true}});
  const map=new Map(prices.map(p=>[String(p.id),p.marketPrice]));
  const rows=publicValueRows(projectValueRows(financials!.map(s=>({...s,marketPrice:map.get(String(s.id))??null})),year)).filter(r=>r.name.includes('캐시'));
  return {data:{rows:sortAnalysisRows(rows,parseAnalysisSort()),total:rows.length,year,query:'캐시'}};
 };
 app.get<{Querystring:{cold?:string}}>('/baseline-value',async request=>baseline(request.query.cold==='1'));
 const baselineRequest=async(cold=false)=>{const response=await app.inject('/baseline-value'+(cold?'?cold=1':''));assert.equal(response.statusCode,200,response.body);return response.json();};

 const request=async()=>{const response=await app.inject('/api/value-analysis?year=2026&query=%EC%BA%90%EC%8B%9C&sorts=w:desc');assert.equal(response.statusCode,200,response.body);return response.json();};
 const measurements=[];
 measurements.push(await measure('before structure: 60s financial cache MISS + live price + full calculation',()=>baselineRequest(true)));
 await baselineRequest(true);measurements.push(await measure('before structure: 60s financial cache HIT + live price + full calculation',()=>baselineRequest()));
 measurements.push(await measure('after: no daily cache fallback',request));
 await app.valueReadModel.warm(year);measurements.push(await measure('after: daily cache HIT, same query/year/W sort',request));
 measurements.push(await measure('after: restart persisted cache HIT',async()=>new ValueReadModel(db).get(year)));
 const first=created[0]!,before=(await db.analysisRevision.findUnique({where:{key:'financial'}}))!.revision;
 await assert.rejects(db.$transaction(async tx=>{await tx.financialStatement.update({where:{securityId_fiscalYear_periodType:{securityId:first,fiscalYear:2025,periodType:'ANNUAL'}},data:{netIncome:'555'}});throw Error('ROLLBACK_PROBE');}));
 assert.equal((await db.analysisRevision.findUnique({where:{key:'financial'}}))!.revision,before,'revision triggers must roll back with source writes');
 await db.marketPrice.update({where:{securityId:first},data:{currentPrice:'200'}});
 assert.equal((await app.valueReadModel.get(year)).rows.find(r=>r.id===String(first))!.currentPrice,'100','intraday writes do not change daily snapshot');
 let touched:bigint[]|undefined;const targeted=new ValueReadModel(db,async(y,ids,previous)=>{touched=ids;return loadValueRows(y,ids,previous,db);});
 await db.financialStatement.update({where:{securityId_fiscalYear_periodType:{securityId:first,fiscalYear:2025,periodType:'ANNUAL'}},data:{netIncome:'-75'}});
 const changed=await targeted.get(year);assert.deepEqual(touched,[first]);assert.equal(changed.rows.find(r=>r.id===String(first))!.netIncome,'-75');assert.equal(changed.rows.find(r=>r.id===String(first))!.currentPrice,'100');
 const restarted=new ValueReadModel(db);await restarted.get(year);await targeted.warm(year);assert.equal((await restarted.get(year)).rows.find(r=>r.id===String(first))!.currentPrice,'200','another process observes new price generation');
 const detailPath=`/api/financial-statements/${first}?endYear=2026`;
 const detail1=(await app.inject(detailPath)).json(),detail2=(await app.inject(detailPath)).json();assert.equal(detail1.cache.status,'MISS');assert.equal(detail2.cache.status,'HIT');
 await db.financialStatement.update({where:{securityId_fiscalYear_periodType:{securityId:first,fiscalYear:2025,periodType:'ANNUAL'}},data:{netIncome:'0'}});
 const detail3=(await app.inject(detailPath)).json();assert.equal(detail3.cache.status,'MISS');assert.equal(detail3.data.rows.find((r:any)=>r.year===2025).values.netIncome,'0');
 const output={environment:'Isolated CI MariaDB; Fastify inject; no external collection; 50 synthetic securities + migration fixtures',timestamp:new Date().toISOString(),year,query:'캐시',sorts:'w:desc',concurrency:1,measurements,verified:['source transaction rollback preserves revision','targeted financial refresh only one security','intraday price independence','restart persisted hit','cross-process evening price generation','financial detail revision invalidation','zero and negative financial values'],limitations:'Before structure is reproduced with the shared selection function; production post-deploy timings are not measured. Cache hit/miss states are explicit; measurements are API/service time, not browser paint time.'};
 await mkdir('test-results/value-cache',{recursive:true});await writeFile('test-results/value-cache/performance.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
}finally{
 await app.close();await db.analysisReadCache.deleteMany({where:{key:`value:${year}`}});
 await db.marketPrice.deleteMany({where:{securityId:{in:created}}});await db.financialStatement.deleteMany({where:{securityId:{in:created}}});await db.periodValuation.deleteMany({where:{securityId:{in:created}}});await db.security.deleteMany({where:{id:{in:created}}});await raw.$disconnect();
}
