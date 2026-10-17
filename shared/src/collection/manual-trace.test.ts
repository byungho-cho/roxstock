import test from 'node:test';
import assert from 'node:assert/strict';
import {manualTrace,leaseOwnerId,expireManualRun,sweepManualRequests,manualLimits} from './manual-requests.js';
import type {PrismaClient,CollectorRun} from '../generated/prisma/index.js';
const now=new Date();
const run=()=>({id:7n,status:'RUNNING',startedAt:now,metadata:{phase:'MANUAL',manualState:'QUEUED',securityId:'1',fiscalYear:2021,period:'ANNUAL'}} as unknown as CollectorRun);
for(const scenario of ['automatic','manual','unidentified','expired','stale'] as const)test(`wait evidence: ${scenario}`,async()=>{
 const row=run();let stored:any;
 const owner='secret-test-owner';
 const db={collectorLock:{findUnique:async()=>({ownerToken:owner,lockedUntil:new Date(Date.now()+(scenario==='expired'?-1:60000)),updatedAt:new Date(Date.now()-(scenario==='stale'?180000:0))})},collectorRun:{findFirst:async()=>scenario==='unidentified'?null:{id:9n,metadata:{phase:scenario==='manual'?'MANUAL':'BACKFILL',ownerId:leaseOwnerId(owner)}},updateMany:async(q:any)=>{stored=q.data.metadata;return {count:1};}}} as unknown as PrismaClient;
 const trace=await manualTrace(db,row);
 assert.equal(trace.waitReason,{automatic:'AUTOMATIC',manual:'PREVIOUS_REQUEST',unidentified:'LOCK',expired:'CHECKING',stale:'CHECKING'}[scenario]);
 assert.ok(!JSON.stringify(trace).includes(owner));assert.equal(trace.executionStartedAt,null);assert.equal(trace.acceptedAt,now.toISOString());
 assert.equal(stored.waitReason,trace.waitReason);
});
test('expiry sweep runs without HTTP polling, keeps completed results and never deletes a lease',async()=>{
 const row=run();row.startedAt=new Date(Date.now()-manualLimits.queueMs-1);row.metadata={...row.metadata as object,results:[{fiscalYear:2021,period:'ANNUAL',status:'SUCCESS'}]};
 let terminal:any;
 const db={collectorRun:{findMany:async()=>[row],updateMany:async(q:any)=>{assert.deepEqual(q.where.metadata.equals,row.metadata);terminal=q.data;return {count:1};}},collectorLock:{deleteMany:async()=>{throw Error('must not remove a lease');}}} as unknown as PrismaClient;
 await sweepManualRequests(db);assert.equal(terminal.status,'PARTIAL');assert.equal(terminal.metadata.results[0].status,'SUCCESS');assert.equal(terminal.metadata.terminalCode,'MANUAL_RUN_TIMEOUT');
});
test('a stale expiration snapshot cannot overwrite execution progress',async()=>{
 const row=run();row.startedAt=new Date(Date.now()-manualLimits.queueMs-1);
 const db={collectorRun:{updateMany:async(q:any)=>{assert.deepEqual(q.where.metadata.equals,row.metadata);return {count:0};}}} as unknown as PrismaClient;
 assert.equal(await expireManualRun(db,row),false);
});
for(const scenario of ['owned','absent','other-owner','expired','stale'] as const)test(`PROCESSING needs a current owner and activity: ${scenario}`,async()=>{
 const row=run();row.metadata={...row.metadata as object,manualState:'PROCESSING',lockOwner:'owner',lastProgressAt:new Date(Date.now()-(scenario==='stale'?180000:0)).toISOString()};
 const db={collectorLock:{findUnique:async()=>scenario==='absent'?null:{ownerToken:scenario==='other-owner'?'other':'owner',lockedUntil:new Date(Date.now()+(scenario==='expired'?-1:60000)),updatedAt:new Date(Date.now()-(scenario==='stale'?180000:0))}}} as unknown as PrismaClient;
 const trace=await manualTrace(db,row);assert.equal(trace.activityState,scenario==='owned'?'ACTIVE':'CHECKING');
 if(scenario!=='owned')assert.equal(trace.waitReason,'CHECKING');
});
