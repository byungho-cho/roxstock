import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { PrismaDartRepository } from '../collector/dart-repository.js';

test('manual refresh POST validates, queues once and GET cannot access another security request', async () => {
  const oldKey=process.env.DART_API_KEY; const oldEnabled=process.env.DART_COLLECTOR_ENABLED;
  const originals={security:prisma.security.findUnique,first:prisma.collectorRun.findFirst,count:prisma.collectorRun.count,create:prisma.collectorRun.create,unique:prisma.collectorRun.findUnique,acquire:PrismaDartRepository.prototype.acquireLock,release:PrismaDartRepository.prototype.releaseLock};
  let run: any=null; let creates=0;
  process.env.DART_API_KEY='test-key';process.env.DART_COLLECTOR_ENABLED='true';
  prisma.security.findUnique=(async()=>({id:1n,isActive:true,securityType:'STOCK'})) as unknown as typeof originals.security;
  prisma.collectorRun.findFirst=(async()=>run) as unknown as typeof originals.first;
  prisma.collectorRun.count=(async()=>run?1:0) as unknown as typeof originals.count;
  prisma.collectorRun.create=(async(args:any)=>{creates++;run={id:99n,...args.data,startedAt:new Date(),finishedAt:null};return run;}) as unknown as typeof originals.create;
  prisma.collectorRun.findUnique=(async()=>run) as unknown as typeof originals.unique;
  PrismaDartRepository.prototype.acquireLock=async()=>true;PrismaDartRepository.prototype.releaseLock=async()=>{};
  const app=buildApp();
  try {
    const invalid=await app.inject({method:'POST',url:'/api/securities/1/financial-refresh',payload:{fiscalYear:2024,period:'Q4'}});assert.equal(invalid.statusCode,400);assert.equal(creates,0);
    const reversed=await app.inject({method:'POST',url:'/api/securities/1/financial-refresh',payload:{startYear:2025,endYear:2024,period:'ALL'}});assert.equal(reversed.statusCode,400);assert.equal(creates,0);
    const accepted=await app.inject({method:'POST',url:'/api/securities/1/financial-refresh',payload:{fiscalYear:2024,period:'Q1'}});assert.equal(accepted.statusCode,202);assert.equal(accepted.json().data.requestId,'99');
    const duplicate=await app.inject({method:'POST',url:'/api/securities/1/financial-refresh',payload:{fiscalYear:2024,period:'ALL'}});assert.equal(duplicate.statusCode,409);assert.equal(creates,1);
    const status=await app.inject('/api/securities/1/financial-refresh/99');assert.equal(status.json().data.state,'QUEUED');assert.equal(creates,1);
    const other=await app.inject('/api/securities/2/financial-refresh/99');assert.equal(other.statusCode,404);
    delete process.env.DART_API_KEY;
    const missing=await app.inject({method:'POST',url:'/api/securities/1/financial-refresh',payload:{fiscalYear:2024,period:'Q1'}});assert.equal(missing.statusCode,503);
  } finally {
    await app.close();prisma.security.findUnique=originals.security;prisma.collectorRun.findFirst=originals.first;prisma.collectorRun.count=originals.count;prisma.collectorRun.create=originals.create;prisma.collectorRun.findUnique=originals.unique;PrismaDartRepository.prototype.acquireLock=originals.acquire;PrismaDartRepository.prototype.releaseLock=originals.release;
    if(oldKey===undefined)delete process.env.DART_API_KEY;else process.env.DART_API_KEY=oldKey;
    if(oldEnabled===undefined)delete process.env.DART_COLLECTOR_ENABLED;else process.env.DART_COLLECTOR_ENABLED=oldEnabled;
  }
});
