import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {collectionPageRoutes} from '../src/routes/collection-pages.js';
test('real MariaDB API: 0/49/50/51/105 rows, independent targets, filtered cursors and concurrent insert boundaries',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/,'Only isolated local CI database allowed');
 const app=Fastify();await app.register(collectionPageRoutes,{prefix:'/api'});
 const ids:bigint[]=[];const at=new Date('2036-01-01T00:00:00.000Z');
 const get=async(stream:string,cursor?:string)=>{
  const url=`/api/collection/monitoring/security-master/${stream}?from=2036-01-01&to=2036-01-01&limit=50${cursor?'&cursor='+cursor:''}`;
  const r=await app.inject(url);assert.equal(r.statusCode,200,r.body);const data=r.json().data;
  console.log(JSON.stringify({stream,limit:50,cursor:!!cursor,returned:data.rows.length,hasNext:data.hasNext}));return data;
 };
 const add=async(n:number)=>{for(let i=0;i<n;i++){const run=await prisma.collectorRun.create({data:{jobType:'security-master',provider:'phase21-isolated-test',status:'PARTIAL',startedAt:at,successCount:1,failureCount:1}});ids.push(run.id);await prisma.collectorRunItem.create({data:{runId:run.id,symbol:`005930:${2025+ids.length%2}:11011`,status:'SUCCESS',createdAt:at}});}};
 try{
  for(const total of [0,49,50,51,105]){
   await add(total-ids.length);
   for(const stream of ['runs','items']) {let page=await get(stream);assert.equal(page.rows.length,Math.min(50,total));assert.equal(page.hasNext,total>50);const all=page.rows.slice();while(page.hasNext){page=await get(stream,page.nextCursor);all.push(...page.rows);}assert.equal(all.length,total);assert.equal(new Set(all.map((r:any)=>r.id)).size,total);}
  }
  const first=await get('runs');await add(1);let page=first,all=first.rows.slice();while(page.hasNext){page=await get('runs',page.nextCursor);all.push(...page.rows);}assert.equal(all.length,105);assert.equal(all.some((r:any)=>r.id===ids.at(-1)!.toString()),false);
  const targets=await get('items');assert.equal(targets.rows.length,50);assert.equal(new Set(targets.rows.map((r:any)=>r.symbol)).size,2);
  assert.equal((await app.inject('/api/collection/monitoring/security-master/runs?result=SUCCESS&cursor='+first.nextCursor)).statusCode,400);
  const filtered=(await app.inject('/api/collection/monitoring/security-master/runs?result=SUCCESS&from=2036-01-01&limit=50')).json().data;assert.equal(filtered.rows.length,0);
 }finally{await prisma.collectorRun.deleteMany({where:{id:{in:ids},provider:'phase21-isolated-test'}});await app.close();await prisma.$disconnect();}
});
