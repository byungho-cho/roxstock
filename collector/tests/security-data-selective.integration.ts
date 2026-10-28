import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {runSecurityDataCollection} from '../src/security-data-collector.js';

test('explicit retry touches only selected receipts, preserves attempts/history/cursor and does not discover',async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.endsWith('_test'));
 const db=new PrismaClient(),now=new Date(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now).replaceAll('-','');
 const seed=String(Date.now()).slice(-6),ids=[today+seed,today+String((Number(seed)+1)%1000000).padStart(6,'0')];
 const oldCursor=await db.securityDataCursor.findUnique({where:{id:1}}),enabled=process.env.SECURITY_DATA_COLLECTION_ENABLED;let runId:bigint|undefined;
 try{
  if(!oldCursor)await db.securityDataCursor.create({data:{id:1,coverageFrom:today,fromDate:today,throughDate:today,page:1,nextCheckAt:new Date(now.getTime()+3600000)}});
  const cursor=await db.securityDataCursor.findUniqueOrThrow({where:{id:1}});
  assert.equal(await db.dartCorpMapping.count({where:{corpCode:'99999999'}}),0);
  await db.securityDataReceipt.createMany({data:ids.map(receiptNo=>({receiptNo,corpCode:'99999999',disclosedDate:today,report:{report_nm:'사업보고서 (2026.06)'},status:'FAILED',attempts:3,nextAttemptAt:new Date(now.getTime()+86400000)}))});
  const other=await db.securityDataReceipt.findUniqueOrThrow({where:{receiptNo:ids[1]}});
  process.env.SECURITY_DATA_COLLECTION_ENABLED='false';
  const result=await runSecurityDataCollection(db,{apiKey:'test-no-requests',dailyCallLimit:10000,minDelayMs:1,corpRefreshHours:24},now,{receiptAllowlist:[ids[0]!]});
  assert.equal(result.status,'FINISHED');assert.ok('runId' in result);runId=BigInt(result.runId!);
  assert.equal('target' in result?result.target:undefined,1);
  const selected=await db.securityDataReceipt.findUniqueOrThrow({where:{receiptNo:ids[0]}});
  assert.equal(selected.status,'SKIPPED');assert.equal(selected.attempts,4);
  assert.deepEqual(await db.securityDataReceipt.findUniqueOrThrow({where:{receiptNo:ids[1]}}),other);
  assert.deepEqual(await db.securityDataCursor.findUniqueOrThrow({where:{id:1}}),cursor);
  const run=await db.collectorRun.findUniqueOrThrow({where:{id:runId}}),meta=run.metadata as any;
  assert.equal(meta.manualSelective,true);assert.equal(meta.discovery.status,'NOT_RUN');assert.equal(meta.discovery.found,0);
  assert.deepEqual(meta.receiptAllowlist,[ids[0]]);
 }finally{
  if(runId){await db.collectorRunItem.deleteMany({where:{runId}});await db.collectorRun.delete({where:{id:runId}});}
  await db.securityDataReceipt.deleteMany({where:{receiptNo:{in:ids}}});
  if(!oldCursor)await db.securityDataCursor.deleteMany({where:{id:1}});
  if(enabled===undefined)delete process.env.SECURITY_DATA_COLLECTION_ENABLED;else process.env.SECURITY_DATA_COLLECTION_ENABLED=enabled;
  await db.$disconnect();
 }
});
