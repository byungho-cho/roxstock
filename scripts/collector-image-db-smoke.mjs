// Executed inside the production collector image against a disposable CI database.
import assert from 'node:assert/strict';
import {PrismaClient} from '/app/shared/dist/generated/prisma/index.js';
import {PrismaCollectorRepository} from '/app/collector/dist/repository.js';
import {collectPrices} from '/app/collector/dist/price-collector.js';
import {MockPriceProvider} from '/app/collector/dist/providers/mock-price-provider.js';
import {warmValueCaches} from '/app/shared/dist/read-model/value-cache.js';
const url=new URL(process.env.DATABASE_URL);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&['/ci','/ci_phase16_test'].includes(url.pathname),'Disposable CI DB required');
const db=new PrismaClient(),repository=new PrismaCollectorRepository(db);
try{
 const security=await db.security.create({data:{symbol:'989991',name:'Image-only mock verification',marketType:'OTHER',securityType:'STOCK'}});
 const result=await collectPrices(repository,new MockPriceProvider(),{delayMs:0,lockTtlSeconds:60,symbols:[security.symbol]});
 assert.equal(result.status,'SUCCESS');assert.equal(result.success,1);
 const price=await db.marketPrice.findUniqueOrThrow({where:{securityId:security.id}});
 assert.equal(price.currentPrice.toString(),'19991');
 assert.equal((await db.collectorRun.findUniqueOrThrow({where:{id:result.runId}})).status,'SUCCESS');
 const owner='image-duplicate-fixture';assert.equal(await repository.acquireLock('market-prices',owner,60),true);
 try{const duplicate=await collectPrices(repository,new MockPriceProvider(),{delayMs:0,lockTtlSeconds:60,symbols:[security.symbol]});assert.equal(duplicate.skipReason,'LOCK_CONFLICT');}
 finally{await repository.releaseLock('market-prices',owner);}
 await warmValueCaches(db);
 const year=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4);
 const cache=await db.analysisReadCache.findUniqueOrThrow({where:{key:'value:'+year}});
 assert.ok(Array.isArray(cache.payload.rows));
 console.log('Production collector image: mock source -> stored price -> run status -> duplicate fence -> value cache passed');
}finally{await db.$disconnect();}
