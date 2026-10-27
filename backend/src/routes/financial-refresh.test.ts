import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../auth/route-test-app.js';
import { prisma } from '@roxstock/shared/lib/prisma';
import { CollectionJobRepository as PrismaDartRepository } from '@roxstock/shared/collection/job-repository';

test('retired refresh POST never queues; saved manual history remains scoped and readable', async () => {
  const oldKey=process.env.DART_API_KEY; const oldEnabled=process.env.DART_COLLECTOR_ENABLED;
  const originals={security:prisma.security.findUnique,first:prisma.collectorRun.findFirst,count:prisma.collectorRun.count,create:prisma.collectorRun.create,unique:prisma.collectorRun.findUnique,acquire:PrismaDartRepository.prototype.acquireLock,release:PrismaDartRepository.prototype.releaseLock};
  const oldLease=prisma.collectorLock.findUnique;prisma.collectorLock.findUnique=(async()=>null) as typeof oldLease;
  let run: any=null; let creates=0;
  process.env.DART_API_KEY='test-key';process.env.DART_COLLECTOR_ENABLED='true';
  prisma.security.findUnique=(async()=>({id:1n,symbol:'005930',collectionRevision:0,collectionExcluded:false,excludedFeatures:[],isActive:true,securityType:'STOCK'})) as unknown as typeof originals.security;
  prisma.collectorRun.findFirst=(async()=>run) as unknown as typeof originals.first;
  prisma.collectorRun.count=(async()=>run?1:0) as unknown as typeof originals.count;
  prisma.collectorRun.create=(async(args:any)=>{creates++;run={id:99n,...args.data,startedAt:new Date(),finishedAt:null};return run;}) as unknown as typeof originals.create;
  prisma.collectorRun.findUnique=(async()=>run) as unknown as typeof originals.unique;
  PrismaDartRepository.prototype.acquireLock=async()=>true;PrismaDartRepository.prototype.releaseLock=async()=>{};
  const app=buildApp();
  try {
    for(const payload of [{fiscalYear:2024,period:'Q4'},{startYear:2025,endYear:2024,period:'ALL'},{fiscalYear:2024,period:'Q1'}]){
      const retired=await app.inject({method:'POST',url:'/api/securities/1/financial-refresh',payload});assert.equal(retired.statusCode,410);assert.equal(retired.json().error.code,'HISTORICAL_REFRESH_RETIRED');
    }
    assert.equal(creates,0);
    run={id:99n,jobType:'dart-financial-statements',status:'RUNNING',startedAt:new Date(),finishedAt:null,metadata:{phase:'MANUAL',securityId:'1',manualState:'QUEUED',fiscalYear:2024,period:'Q1',results:[]}};
    const status=await app.inject('/api/securities/1/financial-refresh/99');assert.equal(status.json().data.state,'QUEUED');assert.equal(creates,0);
    run.metadata.progress={currentYear:2024,currentPeriod:'Q1',stage:'VALUATION',completed:0,total:1};
    const processing=await app.inject('/api/securities/1/financial-refresh/99');assert.deepEqual(processing.json().data.progress,run.metadata.progress);
    const active=await app.inject('/api/securities/1/financial-refresh/active');assert.equal(active.statusCode,200);assert.equal(active.json().data.requestId,'99');assert.equal(active.json().data.counts.disclosureCompleted,0);
    const other=await app.inject('/api/securities/2/financial-refresh/99');assert.equal(other.statusCode,404);
    delete process.env.DART_API_KEY;
    const missing=await app.inject({method:'POST',url:'/api/securities/1/financial-refresh',payload:{fiscalYear:2024,period:'Q1'}});assert.equal(missing.statusCode,410);
  } finally {
    await app.close();prisma.collectorLock.findUnique=oldLease;prisma.security.findUnique=originals.security;prisma.collectorRun.findFirst=originals.first;prisma.collectorRun.count=originals.count;prisma.collectorRun.create=originals.create;prisma.collectorRun.findUnique=originals.unique;PrismaDartRepository.prototype.acquireLock=originals.acquire;PrismaDartRepository.prototype.releaseLock=originals.release;
    if(oldKey===undefined)delete process.env.DART_API_KEY;else process.env.DART_API_KEY=oldKey;
    if(oldEnabled===undefined)delete process.env.DART_COLLECTOR_ENABLED;else process.env.DART_COLLECTOR_ENABLED=oldEnabled;
  }
});
