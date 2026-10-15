import test from 'node:test';
import assert from 'node:assert/strict';
import {pageBoundary,pageCondition,collectionPageRoutes} from './collection-pages.js';
import Fastify from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
test('page condition validates dates, bound filter/stream cursors and exact BigInt ties',()=>{
 const first=pageCondition('security-master','runs',{});
 const cursor=Buffer.from(JSON.stringify({v:1,scope:first.scope,at:'2026-10-12T00:00:00.000Z',id:'9007199254740993',ceiling:'9007199254741000'})).toString('base64url');
 assert.equal(pageCondition('security-master','runs',{cursor}).cursor?.id,'9007199254740993');
 assert.throws(()=>pageCondition('security-master','items',{cursor}));assert.throws(()=>pageCondition('market-prices','runs',{cursor}));assert.throws(()=>pageCondition('security-master','runs',{cursor,result:'FAILED'}));
 for(const q of [{limit:'51'},{limit:'NaN'},{result:'NO_FILING'},{from:'2026-02-30'},{from:'2026-10-13',to:'2026-10-12'}])assert.throws(()=>pageCondition('security-master','runs',q));
 assert.equal(pageBoundary('2026-10-12T00:00:00.000Z','9007199254740993','startedAt').OR[1]!.id?.lt,9007199254740993n);
 const targets=pageCondition('security-master','items',{symbol:'005930'}).where as any;
 assert.equal(targets.run.is.jobType,'security-master');assert.equal(targets.runId,undefined);
});
test('actual route applies bounded reads, stable ordering and independent item relation',async()=>{
 const originals={ra:prisma.collectorRun.aggregate,rf:prisma.collectorRun.findMany,ig:prisma.collectorRunItem.groupBy,ia:prisma.collectorRunItem.aggregate,if:prisma.collectorRunItem.findMany};
 prisma.collectorRunItem.groupBy=(async()=>[]) as any;
 const calls:any[]=[];
 prisma.collectorRun.aggregate=(async()=>({_max:{id:100n}})) as any;
 prisma.collectorRunItem.aggregate=(async()=>({_max:{id:500n}})) as any;
 prisma.collectorRun.findMany=(async(q:any)=>{calls.push({stream:'runs',...q});return Array.from({length:51},(_,i)=>({id:BigInt(100-i),startedAt:new Date('2026-10-12'),status:'PARTIAL',successCount:1,failureCount:1,staleCount:0,skippedCount:0,failureReason:'test',metadata:{}}));}) as any;
 prisma.collectorRunItem.findMany=(async(q:any)=>{calls.push({stream:'items',...q});return Array.from({length:51},(_,i)=>({id:BigInt(500-i),symbol:`005930:${2025+i%2}:11011`,createdAt:new Date('2026-10-12'),status:'SUCCESS',message:null,observedAt:null,security:null}));}) as any;
 const app=Fastify();await app.register(collectionPageRoutes,{prefix:'/api'});
 try{
   const r=await app.inject('/api/collection/monitoring/security-master/runs?limit=50');assert.equal(r.statusCode,200);const p=r.json().data;assert.equal(p.rows.length,50);assert.equal(p.hasNext,true);
   await app.inject('/api/collection/monitoring/security-master/runs?limit=50&cursor='+p.nextCursor);
   const t=(await app.inject('/api/collection/monitoring/security-master/items?limit=50')).json().data;assert.equal(t.rows.length,50);assert.notEqual(t.rows[0].symbol,t.rows[1].symbol);
   assert.equal(calls[0].take,51);assert.deepEqual(calls[0].orderBy,[{startedAt:'desc'},{id:'desc'}]);assert.equal(calls[1].where.AND[2].OR[1].id.lt,51n);assert.equal(calls[2].where.AND[0].run.is.jobType,'security-master');assert.equal(calls[2].where.AND[0].runId,undefined);
   assert.equal((await app.inject('/api/collection/monitoring/security-master/items?cursor='+p.nextCursor)).statusCode,400);
 }finally{await app.close();prisma.collectorRun.aggregate=originals.ra;prisma.collectorRun.findMany=originals.rf;prisma.collectorRunItem.groupBy=originals.ig;prisma.collectorRunItem.aggregate=originals.ia;prisma.collectorRunItem.findMany=originals.if;}
});
