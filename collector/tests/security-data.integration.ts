import test from 'node:test';import assert from 'node:assert/strict';
import {prisma} from '@roxstock/shared/lib/prisma';
import {OpenDartProvider} from '../src/dart-provider.js';
import {PrismaDartRepository} from '../src/dart-repository.js';
import {runSecurityDataCollection} from '../src/security-data-collector.js';
test('new inbox discovery rollback, receipt deduplication, restart recovery and bounded attempts never open historical tasks',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:localhost|127\.0\.0\.1):/);
 const old=process.env.SECURITY_DATA_COLLECTION_ENABLED;process.env.SECURITY_DATA_COLLECTION_ENABLED='true';
 const original={page:OpenDartProvider.prototype.listPeriodicPage,sync:PrismaDartRepository.prototype.corpCodeMappingsSyncedAt};let fail=false,calls=0;
 const security=await prisma.security.create({data:{symbol:'T33002',name:'Inbox fixture',isActive:false,marketType:'OTHER',securityType:'STOCK'}});
 const at=new Date(),ymd=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(at).replaceAll('-',''),receipt='20991231999998';
 await prisma.dartCorpMapping.create({data:{securityId:security.id,corpCode:'99330002',stockCode:security.symbol,corpName:'Inbox fixture',syncedAt:at}});
 const beforeTasks=await prisma.dartBackfillTask.count(),config={apiKey:'isolated-fixture',dailyCallLimit:10000,minDelayMs:0,corpRefreshHours:24};
 PrismaDartRepository.prototype.corpCodeMappingsSyncedAt=async()=>new Date();
 try{
  await prisma.securityDataCursor.deleteMany({});
  PrismaDartRepository.prototype.corpCodeMappingsSyncedAt=async()=>new Date();
  OpenDartProvider.prototype.listPeriodicPage=async()=>{calls++;if(fail)throw Error('injected discovery failure');return {rows:[{corp_code:'99330002',rcept_no:receipt,rcept_dt:ymd,report_nm:'반기보고서 (2026.06)'}],totalPages:1};};
  PrismaDartRepository.prototype.corpCodeMappingsSyncedAt=async()=>new Date();
  const first=await runSecurityDataCollection(prisma,config,at);assert.equal(first.status,'FINISHED');assert.equal('skipped' in first&&first.skipped,1);assert.equal(await prisma.securityDataReceipt.count({where:{receiptNo:receipt}}),1);
  await prisma.securityDataCursor.update({where:{id:1},data:{nextCheckAt:at}});await runSecurityDataCollection(prisma,config,at);assert.equal(await prisma.securityDataReceipt.count({where:{receiptNo:receipt}}),1);
  await prisma.securityDataReceipt.update({where:{receiptNo:receipt},data:{status:'PROCESSING',attempts:3}});await prisma.securityDataCursor.update({where:{id:1},data:{nextCheckAt:new Date(+at+3600000)}});await runSecurityDataCollection(prisma,config,at);assert.equal((await prisma.securityDataReceipt.findUniqueOrThrow({where:{receiptNo:receipt}})).status,'UNRESOLVED');assert.equal((await prisma.securityDataReceipt.findUniqueOrThrow({where:{receiptNo:receipt}})).attempts,3);
  await prisma.securityDataCursor.update({where:{id:1},data:{nextCheckAt:at,page:1}});fail=true;const checkpoint=await prisma.securityDataCursor.findUniqueOrThrow({where:{id:1}});await assert.rejects(runSecurityDataCollection(prisma,config,at));const after=await prisma.securityDataCursor.findUniqueOrThrow({where:{id:1}});assert.equal(after.page,checkpoint.page);assert.equal(after.lastCompletedAt?.toISOString(),checkpoint.lastCompletedAt?.toISOString());assert.equal(after.failures,1);assert.ok(after.nextCheckAt>at);
  assert.equal(await prisma.dartBackfillTask.count(),beforeTasks);assert.ok(calls>=3);
 }finally{OpenDartProvider.prototype.listPeriodicPage=original.page;PrismaDartRepository.prototype.corpCodeMappingsSyncedAt=original.sync;if(old===undefined)delete process.env.SECURITY_DATA_COLLECTION_ENABLED;else process.env.SECURITY_DATA_COLLECTION_ENABLED=old;await prisma.securityDataReceipt.deleteMany({where:{receiptNo:receipt}});await prisma.securityDataCursor.deleteMany({});await prisma.collectorRunItem.deleteMany({where:{securityId:security.id}});await prisma.dartCorpMapping.deleteMany({where:{securityId:security.id}});await prisma.security.delete({where:{id:security.id}});await prisma.$disconnect();}
});
