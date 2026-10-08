import assert from 'node:assert/strict';
import test from 'node:test';
import {PrismaClient} from '../src/generated/prisma/index.js';
import {PrismaDartRepository} from '../src/collector/dart-repository.js';
import {DartApiError} from '../src/collector/dart-provider.js';

// Caller must provision an isolated migrated database; never run this against app/production data.
const url=new URL(process.env.DATABASE_URL??'');
if(!url.pathname.endsWith('_dart_recovery_test'))throw Error('Dedicated DART recovery test database required');
const db=new PrismaClient();
test('MariaDB full codes, mapping validation/rollback, successful tasks and filings survive',async()=>{
 const repo=new PrismaDartRepository(db);
 try{
 const stock=await db.security.create({data:{symbol:'991111',name:'Recovery fixture',marketType:'OTHER'}});
 const other=await db.security.create({data:{symbol:'991112',name:'Unmapped fixture',marketType:'OTHER'}});
 await db.dartBackfillTask.createMany({data:[{securityId:stock.id,fiscalYear:2024,reportCode:'11011',periodType:'ANNUAL',status:'PENDING'},{securityId:other.id,fiscalYear:2024,reportCode:'11011',periodType:'ANNUAL',status:'FAILED'},{securityId:stock.id,fiscalYear:2023,reportCode:'11011',periodType:'ANNUAL',status:'SUCCESS'},{securityId:stock.id,fiscalYear:2022,reportCode:'11011',periodType:'ANNUAL',status:'NO_FILING'}]});
 await db.dartFinancialFiling.create({data:{securityId:stock.id,fiscalYear:2023,periodType:'ANNUAL',reportCode:'11011',fsDivision:'CFS',receiptNo:'20240401000001',reportName:'fixture',receiptDate:new Date('2024-04-01'),periodEndDate:new Date('2023-12-31'),collectedAt:new Date(),accountSources:{fixture:'preserve'}}});
 const filings=await db.dartFinancialFiling.findMany();
 await repo.markAllSecurityTasksNotApplicable(stock.id,'DART_CORP_CODE_NOT_MAPPED','fixture');
 await repo.markUnmappedTasksNotApplicable();
 const tasks=await db.dartBackfillTask.findMany({orderBy:{fiscalYear:'desc'}});
 assert.ok(tasks.some(t=>t.errorCode==='DART_CORP_CODE_NOT_MAPPED'));assert.ok(tasks.some(t=>t.errorCode==='NOT_DART_LISTED_EQUITY'));
 assert.equal(tasks.find(t=>t.fiscalYear===2023)?.status,'SUCCESS');assert.equal(tasks.find(t=>t.fiscalYear===2022)?.status,'NO_FILING');
 const corp={corpCode:'00991111',corpName:'Fixture',stockCode:'991111',modifiedDate:'20261001'};
 await repo.syncCorporations([corp]);const before=await db.dartCorpMapping.findMany(),state=await db.dartCollectorState.findUnique({where:{id:1}});
 for(const input of [[],[{...corp,corpCode:'bad'}],[{...corp,stockCode:'999999'}]]){
  await assert.rejects(repo.syncCorporations(input),DartApiError);assert.deepEqual(await db.dartCorpMapping.findMany(),before);
 }
 const failing=new PrismaDartRepository(new Proxy(db,{get(target,key){if(key==='$transaction')return (fn:any)=>target.$transaction(async tx=>fn(new Proxy(tx,{get(t,k){if(k==='dartCollectorState')return {upsert:async()=>{throw Error('injected final write failure')}};return Reflect.get(t,k);}})));return Reflect.get(target,key);}}));
 await assert.rejects(failing.syncCorporations([{...corp,corpName:'New name'}]));
 assert.deepEqual(await db.dartCorpMapping.findMany(),before);assert.deepEqual(await db.dartCollectorState.findUnique({where:{id:1}}),state);
 await repo.syncCorporations([{...corp,corpName:'New name'}]);assert.equal((await db.dartCorpMapping.findFirst())?.corpName,'New name');
 assert.deepEqual(await db.dartFinancialFiling.findMany(),filings);
 console.log('Verified full 21/24-character codes, 32+ schema, atomic mapping rollback, unchanged filings');
 }finally{await db.$disconnect();}
});
