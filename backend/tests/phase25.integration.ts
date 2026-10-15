import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {PrismaCollectorRepository} from '../../collector/src/repository.js';
import {buildApp} from '../src/app.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_phase25_test'))throw Error('Isolated DEV database required');
test('real MariaDB expired-owner recovery preserves items and original status; live lease cannot be stolen',async()=>{
  const db=new PrismaClient(),repo=new PrismaCollectorRepository(db);
  const ids:bigint[]=[];
  try{
    assert.equal(await repo.acquireLock('market-prices','phase25-old',30),true);
    const id=await repo.createRun('market-prices','test',{owner:'phase25-old'});ids.push(id);
    await repo.addRunItem(id,{symbol:'005930',status:'SUCCESS'});
    assert.equal(await repo.acquireLock('market-prices','phase25-new',30),false);
    assert.equal(await repo.renewLock('market-prices','wrong-owner',30),false);
    await repo.releaseLock('market-prices','wrong-owner');
    assert.ok(await db.collectorLock.findUnique({where:{jobName:'market-prices'}}));
    await db.collectorLock.update({where:{jobName:'market-prices'},data:{lockedUntil:new Date(Date.now()-1000)}});
    assert.equal(await repo.acquireLock('market-prices','phase25-new',30),true);
    const recovered=await db.collectorRun.findUniqueOrThrow({where:{id}});
    assert.equal(recovered.status,'FAILED');assert.equal(recovered.successCount,1);
    assert.match(recovered.failureReason!,/COLLECTOR_LEASE_EXPIRED/);
    assert.equal((recovered.metadata as any).recovery.originalStatus,'RUNNING');
    assert.equal(await db.collectorRunItem.count({where:{runId:id}}),1);
    assert.equal(await repo.renewLock('market-prices','phase25-old',30),false);
    await repo.releaseLock('market-prices','phase25-old');
    assert.equal((await db.collectorLock.findUniqueOrThrow({where:{jobName:'market-prices'}})).ownerToken,'phase25-new');
  }finally{await db.collectorRunItem.deleteMany({where:{runId:{in:ids}}});await db.collectorRun.deleteMany({where:{id:{in:ids}}});await repo.releaseLock('market-prices','phase25-new');await repo.releaseLock('market-prices','phase25-old');await db.$disconnect();}
});
test('actual summary and paginated API select main run over newer duplicate; completed exclusions stay separate',async()=>{
  const db=new PrismaClient(),repo=new PrismaCollectorRepository(db),app=buildApp();const ids:bigint[]=[];
  try{
    const main=await repo.createRun('market-prices','test',{owner:'phase25-view'});ids.push(main);
    await repo.addRunItem(main,{symbol:'005930',status:'SUCCESS'});
    await repo.addRunItem(main,{symbol:'Z99001',status:'SKIPPED',message:'Z99 코드: 수집 제외'});
    await repo.finishRun(main,'PARTIAL',{success:1,failed:0,stale:0,skipped:1});
    const duplicate=await repo.createRun('market-prices','test');ids.push(duplicate);
    await repo.addRunItem(duplicate,{symbol:'*',status:'SKIPPED',message:'another execution holds the collector lock'});
    await repo.finishRun(duplicate,'SKIPPED',{success:0,failed:0,stale:0,skipped:1});
    const response=await app.inject('/api/collection/monitoring');assert.equal(response.statusCode,200,response.body);
    const feature=response.json().data.features.find((row:any)=>row.id==='market-prices');
    assert.equal(feature.resultScope.runId,String(main));assert.equal(feature.status,'OK');assert.equal(feature.lastExecution.status,'SUCCESS');
    assert.equal(feature.recent.success,1);assert.equal(feature.recent.excluded,1);assert.equal(feature.duplicateRequest.id,String(duplicate));
    const detail=await app.inject('/api/collection/monitoring/market-prices/runs');assert.equal(detail.statusCode,200);
    const row=detail.json().data.rows.find((item:any)=>item.id===String(main));assert.equal(row.status,'SUCCESS');assert.equal(row.originalStatus,'PARTIAL');assert.equal(row.excluded,1);
    const targets=await app.inject('/api/collection/monitoring/market-prices/items?runId='+main);assert.equal(targets.statusCode,200);
    assert.equal(targets.json().data.rows.find((item:any)=>item.symbol==='Z99001').skipKind,'EXCLUDED');
  }finally{await app.close();await db.collectorRunItem.deleteMany({where:{runId:{in:ids}}});await db.collectorRun.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});
