import {randomUUID}from'node:crypto';
import type{PrismaClient}from'@roxstock/shared/prisma';
import{eligibleWhere}from'@roxstock/shared/collection/collection-policy';
import{getSeoulClock}from'@roxstock/shared/collection/time';
import{PrismaCollectorRepository}from'./repository.js';
import{loadKisProductTypes}from'./providers/kis-product-master.js';
/** Metadata only, 100 rows/page; no financial JSON and no price/flow collection. */
export async function collectProductClassifications(db:PrismaClient,now=new Date(),load=loadKisProductTypes){
 const repo=new PrismaCollectorRepository(db),owner=randomUUID(),job='product-classification',day=getSeoulClock(now).dateKey;
 const done=()=>db.collectorRun.findFirst({where:{jobType:job,provider:'KIS_PUBLIC_MASTER',OR:[{status:'SUCCESS',metadata:{path:'$.scheduleDate',equals:day}},{status:'FAILED',startedAt:{gte:new Date(now.getTime()-6*3600000)}},{status:'RUNNING',startedAt:{gte:new Date(now.getTime()-120000)}}]},select:{id:true}});
 if(await done()||!await repo.acquireLock(job,owner,120))return {status:'SKIPPED',updated:0};let id:bigint|undefined,updated=0,verified=0;
 try{if(await done())return {status:'SKIPPED',updated:0};id=await repo.createRun(job,'KIS_PUBLIC_MASTER',{scheduleDate:day,policy:'listed-products-v1'});const types=await load();let cursor=0n;
  for(let page=0;page<100;page++){if(!await repo.renewLock(job,owner,120))throw Error('PRODUCT_CLASSIFICATION_LEASE_LOST');const rows=await db.security.findMany({where:{...eligibleWhere('security-master'),isActive:true,id:{gt:cursor}},select:{id:true,symbol:true,name:true,marketType:true},orderBy:{id:'asc'},take:100});if(!rows.length)break;const items=rows.flatMap(s=>{const productClassification=types.get(s.marketType+':'+s.symbol);return productClassification&&(s.marketType==='KOSPI'||s.marketType==='KOSDAQ')?[{symbol:s.symbol,name:s.name,marketType:s.marketType,productClassification}]:[]});const outcomes=await repo.upsertSecurityMaster(items);await repo.addRunItems(id,outcomes);verified+=outcomes.filter(r=>r.status==='SUCCESS').length;updated+=outcomes.filter(r=>r.diagnostics&&typeof r.diagnostics==='object'&&!Array.isArray(r.diagnostics)&&(r.diagnostics as Record<string,unknown>).classificationChanged===true).length;cursor=rows.at(-1)!.id;if(rows.length<100)break;if(page===99)throw Error('PRODUCT_CLASSIFICATION_PAGE_LIMIT');}
  await repo.finishRun(id,'SUCCESS',{success:verified,failed:0,stale:0,skipped:0});return {status:'SUCCESS',updated,verified};
 }catch(error){if(id)await repo.finishRun(id,'FAILED',{success:verified,failed:1,stale:0,skipped:0},'PRODUCT_MASTER_UNAVAILABLE: 기존 분류 유지 · 공개 마스터 확인 필요');return {status:'FAILED',updated};}finally{await repo.releaseLock(job,owner);}
}
