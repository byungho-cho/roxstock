import assert from 'node:assert/strict';
import test,{after,before} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PrismaClient,Prisma} from '@roxstock/shared/prisma';
import {CollectionJobRepository} from '@roxstock/shared/collection/job-repository';
import {withFinancialLease,FinancialLeaseLost} from '@roxstock/shared/collection/financial-lease';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {claimSupplement,recoverSupplementTasks,finishSupplement,dueSupplementIds,scanSupplementCandidates,candidateRows,registerCandidate,supplementSourceVersion} from '../src/valuation-supplement-queue.js';
import {runIndependentSupplement} from '../src/independent-valuation-supplement.js';
import {processManualRefresh} from '../src/dart-manual-refresh.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_valuation_queue_phase16_test'))throw Error('Dedicated queue fixture DB required');
const db=new PrismaClient(),repo=new CollectionJobRepository(db),wrapped=collectionClient(db);
const now=()=>new Date();
before(async()=>{
 await db.valuationSupplementTask.deleteMany();await db.valuationSupplementBudget.deleteMany();await db.valuationSupplementScan.deleteMany();
 await db.periodValuation.deleteMany({where:{securityId:{gte:10000000n,lt:10010000n}}});await db.dartFinancialFiling.deleteMany({where:{securityId:{gte:10000000n,lt:10010000n}}});await db.security.deleteMany({where:{id:{gte:10000000n,lt:10010000n}}});
});
let fixtureId=99999999n;
async function task(){return db.valuationSupplementTask.create({data:{securityId:fixtureId--,fiscalYear:2020,periodType:'ANNUAL',filingId:1n,sourceVersion:'f'.repeat(64),nextAttemptAt:new Date(Date.now()-1000)}});}
after(async()=>{await db.$disconnect();});
test('concurrent atomic claims reserve once and restart resumes without duplicating a logical period',async()=>{
 const t=await task();const claims=await Promise.all(['one','two'].map(owner=>claimSupplement(db,t.id,owner,now())));
 assert.equal(claims.filter(Boolean).length,1);assert.equal((await db.valuationSupplementTask.findUniqueOrThrow({where:{id:t.id}})).attempts,1);
 const other=new PrismaClient();try{assert.equal(await claimSupplement(other,t.id,'restart',now()),null);}finally{await other.$disconnect();}
 await db.valuationSupplementTask.delete({where:{id:t.id}});
});
test('concurrent workers cannot reserve beyond the final daily slot',async()=>{
 await db.valuationSupplementBudget.updateMany({data:{reserved:199}});
 const tasks=[];for(let i=0;i<10;i++)tasks.push(await task());
 const results=await Promise.all(tasks.map((row,i)=>claimSupplement(db,row.id,'quota-fixture-'+i,now())));
 assert.equal(results.filter(Boolean).length,1);assert.equal((await db.valuationSupplementBudget.findFirstOrThrow()).reserved,200);
 await db.valuationSupplementTask.deleteMany({where:{id:{in:tasks.map(row=>row.id)}}});await db.valuationSupplementBudget.deleteMany();
});
test('forced process exit recovers within renewable TTL and old owners cannot finish or store',async()=>{
 const t=await task();execFileSync(process.execPath,['--import','tsx',fileURLToPath(new URL('./valuation-queue-crash.ts',import.meta.url)),String(t.id)],{stdio:'pipe'});
 const lease=await db.collectorLock.findUniqueOrThrow({where:{jobName:'dart-financial-statements'}}),start=Date.now();
 assert.ok(lease.lockedUntil.getTime()-Date.now()<=90_000);assert.ok(lease.lockedUntil.getTime()-Date.now()>85_000);
 assert.equal(await repo.acquireLock('recovery-fixture',900),false);
 await new Promise(resolve=>setTimeout(resolve,Math.max(1,lease.lockedUntil.getTime()-Date.now()+100)));
 assert.equal(await recoverSupplementTasks(db,now()),1);
 assert.equal(await repo.acquireLock('recovery-fixture',900),true);
 const recovered=await claimSupplement(db,t.id,'recovery-fixture',now());assert.ok(recovered);
 assert.equal((await finishSupplement(db,t,'fixture-crashed-owner',{status:'COMPLETE'},now())).count,0);
 await assert.rejects(withFinancialLease('fixture-crashed-owner',()=>wrapped.$transaction(async()=>{})),FinancialLeaseLost);
 console.log(JSON.stringify({scenario:'hard_exit_recovery',waitMs:Date.now()-start,attempts:recovered.attempts}));
 await finishSupplement(db,recovered,'recovery-fixture',{status:'COMPLETE'},now());await repo.releaseLock('recovery-fixture');await db.valuationSupplementTask.delete({where:{id:t.id}});
});
test('short transaction expiry rolls back financial writes and keeps existing values/cache revision',async()=>{
 const security=await db.security.create({data:{symbol:'VQSAFE',name:'lease fixture',marketType:'KOSPI'}});
 const where={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:2020,periodType:'ANNUAL'}};
 await db.periodValuation.create({data:{securityId:security.id,fiscalYear:2020,periodType:'ANNUAL',status:'SUCCESS',values:{per:'5',pbr:'1',eps:'10',bps:'50',roe:'0'},provenance:{},reasons:{}}});
 const revision=await db.analysisRevision.findUnique({where:{key:'financial'}});assert.equal(await repo.acquireLock('transaction-fixture',90),true);
 await assert.rejects(withFinancialLease('transaction-fixture',()=>wrapped.$transaction(async tx=>{
  await tx.periodValuation.update({where,data:{values:{per:'999'}}});
  await tx.collectorLock.update({where:{jobName:'dart-financial-statements'},data:{lockedUntil:new Date(Date.now()-1000)}});
 })),FinancialLeaseLost);
 assert.equal((await db.periodValuation.findUniqueOrThrow({where})).values&&((await db.periodValuation.findUniqueOrThrow({where})).values as any).per,'5');
 assert.deepEqual(await db.analysisRevision.findUnique({where:{key:'financial'}}),revision);
 await repo.releaseLock('transaction-fixture');await db.periodValuation.delete({where});await db.security.delete({where:{id:security.id}});
});
test('empty candidates and exhausted quota never call external loaders or hold an execution lease',async()=>{
 await db.valuationSupplementTask.deleteMany();await db.valuationSupplementBudget.deleteMany();
 let calls=0;const result=await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},now(),{load:async()=>{calls++;throw Error('Unexpected source');}});
 assert.equal(result.status,'IDLE');assert.equal(calls,0);assert.equal(await db.collectorLock.count({where:{jobName:'dart-financial-statements'}}),0);
 await db.valuationSupplementBudget.updateMany({data:{reserved:200}});
 assert.equal((await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},now(),{load:async()=>{calls++;throw Error('Unexpected source');}})).status,'QUOTA_BLOCKED');assert.equal(calls,0);
 await db.valuationSupplementBudget.deleteMany();
});
test('manual priority yields outside the lease; an aged automatic turn cannot be starved by continuous requests',async()=>{
 const t=await task(),accepted=await db.collectorRun.create({data:{jobType:'dart-financial-statements',provider:'FIXTURE',metadata:{phase:'MANUAL',manualState:'QUEUED',executionMode:'MANUAL_PROTOTYPE',securityId:'99999998',fiscalYear:2020,period:'ANNUAL'}}});
 const finishManual=()=>db.collectorRun.update({where:{id:accepted.id},data:{status:'SUCCESS',finishedAt:now()}});let served=0;
 const options={serviceManual:async()=>{served++;assert.equal(await db.collectorLock.count({where:{jobName:'dart-financial-statements'}}),0);await finishManual();return true;},sleep:async()=>{}};
 assert.equal((await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},now(),options)).status,'YIELDED');assert.equal(served,1);
 await db.collectorRun.update({where:{id:accepted.id},data:{status:'RUNNING',finishedAt:null}});
 await db.valuationSupplementScan.update({where:{id:1},data:{lastAutomaticAt:new Date(Date.now()-700000)}});
 const history=[];for(let i=0;i<3;i++)history.push((await db.collectorRun.create({data:{jobType:'dart-financial-statements',provider:'FIXTURE',status:'SUCCESS',finishedAt:now(),metadata:{phase:'MANUAL'}}})).id);
 assert.equal(await repo.acquireLock('existing-manual-fixture',90),true);
 await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},now(),options);assert.equal(served,1);
 const state=await db.valuationSupplementScan.findUniqueOrThrow({where:{id:1}});assert.ok(state.automaticTurnUntil&&state.automaticTurnUntil>now());
 assert.equal(await processManualRefresh(db,{enabled:false,apiKey:'',dailyCallLimit:1,minDelayMs:0}),true);
 await repo.releaseLock('existing-manual-fixture');
 const resumed=await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},now(),options);assert.equal(resumed.processed,1);assert.equal(served,1);
 await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},now(),options);assert.equal(served,2);
 await db.collectorRun.deleteMany({where:{id:{in:[accepted.id,...history]}}});await db.valuationSupplementTask.delete({where:{id:t.id}});
});
test('KIS annual supplement respects the shared execution lease while preserving its current reference snapshot',async()=>{
 const {runKisSupplements}=await import('../../investor-crawler/src/kis-supplements.mjs');
 const security=await db.security.create({data:{symbol:'989199',name:'KIS lease fixture',marketType:'KOSPI'}}),where={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:2020,periodType:'ANNUAL'}};
 await db.periodValuation.create({data:{securityId:security.id,fiscalYear:2020,periodType:'ANNUAL',status:'PARTIAL',values:{eps:null,bps:null,roe:null},provenance:{},reasons:{}}});
 assert.equal(await repo.acquireLock('manual-common-fixture',90),true);
 const observation={per:null,pbr:null,eps:null,bps:null,listedShares:'1000',foreignHoldingShares:'0',foreignExhaustionRate:'0',collectedAt:now(),raw:{}};
 try{
  const result=await runKisSupplements({db,symbols:[security.symbol],kis:{currentFundamentals:async()=>observation,annualFundamentals:async()=>[{fiscalYear:2020}]},sleep:async()=>{}});
  assert.equal(result.stored,1);assert.equal(result.annualFailures,1);assert.deepEqual((await db.periodValuation.findUniqueOrThrow({where})).values,{eps:null,bps:null,roe:null});
  assert.equal(await db.fundamentalSnapshot.count({where:{securityId:security.id}}),1);assert.equal((await db.collectorLock.findUniqueOrThrow({where:{jobName:'dart-financial-statements'}})).ownerToken,'manual-common-fixture');
 }finally{await repo.releaseLock('manual-common-fixture');await db.fundamentalSnapshot.deleteMany({where:{securityId:security.id}});await db.periodValuation.delete({where});await db.security.delete({where:{id:security.id}});}
});
const digits='(SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)';
async function seed(size:number){
 await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS valuation_fixture_numbers (n INT PRIMARY KEY)');
 await db.$executeRawUnsafe(`INSERT IGNORE INTO valuation_fixture_numbers SELECT 1+a.n+10*b.n+100*c.n+1000*d.n+10000*e.n FROM ${digits} a CROSS JOIN ${digits} b CROSS JOIN ${digits} c CROSS JOIN ${digits} d CROSS JOIN ${digits} e WHERE 1+a.n+10*b.n+100*c.n+1000*d.n+10000*e.n<=${size}`);
 await db.$executeRawUnsafe(`INSERT IGNORE INTO securities (id,symbol,name,market_type,security_type,is_active,created_at,updated_at) SELECT 10000000+FLOOR((n-1)/40),CONCAT('Q',LPAD(FLOOR((n-1)/40),5,'0')),'queue fixture','KOSPI','STOCK',1,NOW(3),NOW(3) FROM valuation_fixture_numbers WHERE MOD(n-1,40)=0 AND n<=${size}`);
 await db.$executeRawUnsafe(`INSERT IGNORE INTO dart_financial_filings (security_id,fiscal_year,period_type,report_code,fs_division,receipt_no,report_name,period_end_date,receipt_date,collected_at,normalization_version,source_validation,account_sources)
 SELECT 10000000+FLOOR((n-1)/40),2015+FLOOR(MOD(n-1,40)/4),ELT(1+MOD(n-1,4),'ANNUAL','Q1','Q2','Q3'),ELT(1+MOD(n-1,4),'11011','11013','11012','11014'),'OFS',LPAD(70000000000000+n,14,'0'),'fixture','2024-12-31','2025-03-01','2026-10-01',3,JSON_OBJECT('currency','KRW'),JSON_OBJECT('payload',REPEAT('x',2048)) FROM valuation_fixture_numbers WHERE n<=${size}`);
}
test('1000 vs 70000 large-JSON rows stay within the same key pages, query and memory caps',async()=>{
 const results:any[]=[];
 for(const size of [1000,70000]){
  await seed(size);await db.valuationSupplementTask.deleteMany();await db.valuationSupplementScan.deleteMany();
  const output=execFileSync(process.execPath,['--max-old-space-size=128','--expose-gc','--import','tsx',fileURLToPath(new URL('./valuation-queue-memory.ts',import.meta.url))],{encoding:'utf8',maxBuffer:20000});
  const measured=JSON.parse(output.trim().split('\n').at(-1)!);results.push({size,...measured});
 }
 assert.ok(Math.abs(results[1].queries-results[0].queries)<=10);
 console.log(JSON.stringify({scenario:'bounded_memory',results}));
 const plans=await db.$queryRaw<any[]>`EXPLAIN SELECT id FROM valuation_supplement_tasks WHERE ready=1 AND next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY next_attempt_at,priority,id LIMIT 10`;
 assert.equal(plans[0].key,'valuation_supplement_due_idx');assert.ok(!String(plans[0].Extra).includes('filesort'));
 const keys=await dueSupplementIds(db,now(),10);assert.equal(keys.length,10);
 // Normalized states mean unchanged unavailable records stay dormant; a corrected source reopens them.
 const t=await db.valuationSupplementTask.findUniqueOrThrow({where:{id:keys[0]!.id}});
 await db.valuationSupplementTask.update({where:{id:t.id},data:{status:'UNAVAILABLE',ready:false,attempts:3}});
 const row=(await candidateRows(db,[t.filingId],2026))[0]!;await registerCandidate(db,row,now());
 assert.equal((await db.valuationSupplementTask.findUniqueOrThrow({where:{id:t.id}})).status,'UNAVAILABLE');
 await db.dartFinancialFiling.update({where:{id:t.filingId},data:{collectedAt:now()}});
 await registerCandidate(db,(await candidateRows(db,[t.filingId],2026))[0]!,now());
 assert.equal((await db.valuationSupplementTask.findUniqueOrThrow({where:{id:t.id}})).status,'PENDING');
 console.log(JSON.stringify({scenario:'due_index',key:plans[0].key,extra:plans[0].Extra}));
});
test('large fixture executes at most ten periods sequentially and retains original JSON',async()=>{
 await db.valuationSupplementBudget.deleteMany();let active=0,peak=0,calls=0;
 const first=await db.dartFinancialFiling.findFirstOrThrow({orderBy:{id:'asc'},select:{id:true,accountSources:true}}),original=JSON.stringify(first.accountSources);
 const result=await runIndependentSupplement(db,{windowStartHour:0,windowEndHour:24},now(),{sleep:async()=>{},load:async(_f,saved)=>{active++;peak=Math.max(peak,active);calls++;try{await new Promise(r=>setTimeout(r,1));return saved;}finally{active--;}}});
 console.log(JSON.stringify({scenario:'sequential_periods',processed:result.processed,sourceLoads:calls,peakConcurrent:peak}));
 assert.equal(result.processed,10);assert.equal(peak,1);assert.ok(calls>0&&calls<=20,'source loads: '+calls);
 assert.equal(JSON.stringify((await db.dartFinancialFiling.findUniqueOrThrow({where:{id:first.id}})).accountSources),original);
});
test('SQL selection distinguishes string-positive, NULL, zero, loss and native-currency conversion',async()=>{
 const f=await db.dartFinancialFiling.findFirstOrThrow({orderBy:{id:'asc'}}),where={securityId_fiscalYear_periodType:{securityId:f.securityId,fiscalYear:f.fiscalYear,periodType:f.periodType}};
 await db.dartFinancialFiling.update({where:{id:f.id},data:{revenueYtd:'0',netIncomeYtd:'0',totalEquity:'0',totalAssets:'0',totalLiabilities:'0'}});
 const data={status:'SUCCESS',values:{eps:'10',bps:'10',roe:'0',per:null,pbr:'1'},provenance:{},reasons:{},supplemental:{accounts:{receiptNo:f.receiptNo,fsDivision:'OFS',sources:{}},shares:{receiptNo:f.receiptNo,rows:[{shareClass:'COMMON',issuedShares:'0',treasuryShares:'0',outstandingShares:'0'}]}}};
 await db.periodValuation.upsert({where,create:{securityId:f.securityId,fiscalYear:f.fiscalYear,periodType:f.periodType,...data},update:data});
 assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.needed),1);
 for(const eps of ['0','-10']){await db.periodValuation.update({where,data:{values:{eps,bps:'10',roe:'0',per:null,pbr:'1'}}});assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.needed),0);}
 await db.periodValuation.update({where,data:{values:{eps:null,bps:'10',roe:'0',per:null,pbr:'1'}}});assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.needed),1);
 await db.dartFinancialFiling.update({where:{id:f.id},data:{sourceValidation:{currency:'USD'}}});
 assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.unsupported),0);
 assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.needed),1,'missing EPS or mismatched legacy metric currency needs a supplement');
 await db.periodValuation.update({where,data:{values:{eps:'10',bps:'10',roe:'0',per:null,pbr:null},provenance:{currency:'USD'}}});
 assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.needed),0,'conversion-only PER/PBR absence does not requeue');
 await db.periodValuation.update({where,data:{provenance:{currency:'KRW'}}});
 assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.needed),1,'cross-currency old metrics must be recalculated');
 await db.dartFinancialFiling.update({where:{id:f.id},data:{fsDivision:'BAD'}});
 assert.equal(Number((await candidateRows(db,[f.id],2026))[0]!.unsupported),1,'unsupported accounting division remains held');
 await db.dartFinancialFiling.update({where:{id:f.id},data:{fsDivision:f.fsDivision}});
});
test('a changed prior capital supplement reopens dependent input; timestamp-only retries do not',async()=>{
 const f=await db.dartFinancialFiling.findFirstOrThrow({where:{fiscalYear:2016,periodType:'ANNUAL'},orderBy:{id:'asc'}}),prior=await db.dartFinancialFiling.findFirstOrThrow({where:{securityId:f.securityId,fiscalYear:2015,periodType:'ANNUAL'}});
 const where={securityId_fiscalYear_periodType:{securityId:f.securityId,fiscalYear:2015,periodType:'ANNUAL'}};
 const version=()=>candidateRows(db,[f.id],2026).then(rows=>supplementSourceVersion(rows[0]!));
 const before=await version(),supplemental={accounts:{receiptNo:prior.receiptNo,fsDivision:'OFS',collectedAt:now().toISOString(),sources:{totalEquity:{amount:'500'}}}};
 await db.periodValuation.upsert({where,create:{securityId:f.securityId,fiscalYear:2015,periodType:'ANNUAL',status:'PARTIAL',values:{},provenance:{},reasons:{},supplemental},update:{supplemental}});
 const changed=await version();assert.notEqual(changed,before);
 supplemental.accounts.collectedAt=new Date(Date.now()+1000).toISOString();await db.periodValuation.update({where,data:{supplemental}});assert.equal(await version(),changed);
});
