import test from 'node:test';
import assert from 'node:assert/strict';
import {processIndependentRefresh,runIndependentPeriod,manualLimits,expireManualRun} from './manual-refresh-jobs.js';
import {boundedManualJob,checkedManualDb,manualFetch} from './manual-job-budget.js';
import {NaverAnnualProvider,parseNaverAnnual,NaverAnnualError} from './naver-annual.js';
import {OpenDartProvider,DartApiError} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import {Prisma,type PrismaClient,type CollectorRun} from '@roxstock/shared/prisma';
import type {DartCollectorConfig} from './dart-collector.js';
import type {ManualRefreshMetadata} from './dart-manual-refresh.js';
import {refreshSummary} from '@roxstock/shared/collection/refresh-summary';

const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()))-1;
const source=()=>parseNaverAnnual(`<table><thead><tr><th>연간</th></tr><tr><th>${year}/12 (IFRS연결)</th></tr></thead><tbody>${[['EPS(원)','100'],['BPS(원)','1000'],['PER(배)','10'],['PBR(배)','1'],['ROE(%)','0']].map(([k,v])=>`<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`,'005930','단위 : 억원, %, 배, 주; 보통주수정주가(기말)/EPS; 보통주+우선주; [기준:2026.10.07]');
const config={enabled:true,apiKey:'test',minDelayMs:0,dailyCallLimit:10} as DartCollectorConfig;
function fixture(mode:'FULL'|'SUPPLEMENT'='FULL',oldValues:Record<string,string|null>={}){
 let valuation:any={securityId:1n,fiscalYear:year,periodType:'ANNUAL',status:'PARTIAL',values:oldValues,provenance:{},supplemental:{price:{value:'1000',date:`${year}-12-30`,source:'KIS_KRX_UNADJUSTED_CLOSE',shareBasis:'ORIGINAL_EQUALS_ADJUSTED'},shares:{receiptNo:'20260301000001',outstanding:'1',preferred:false,rows:[{stockKind:'보통주',shareClass:'COMMON',issuedShares:'1',treasuryShares:'0',outstandingShares:'1',periodEndDate:`${year}-12-31`}]}},reasons:{}};
 const run:any={id:1n,jobType:'dart-financial-statements',status:'RUNNING',startedAt:new Date(),metadata:{phase:'MANUAL',executionMode:'MANUAL_PROTOTYPE',refreshMode:mode,securityId:'1',startYear:year,endYear:year,fiscalYear:year,period:'ANNUAL',manualState:'QUEUED'}};
 let releases=0,writes=0;const snapshots:ManualRefreshMetadata[]=[];
 const filing={securityId:1n,normalizationVersion:3,receiptDate:new Date(`${year+1}-03-01`),receiptNo:'20260301000001',fiscalYear:year,periodType:'ANNUAL',fsDivision:'CFS',revenueYtd:new Prisma.Decimal(0),operatingProfitYtd:new Prisma.Decimal(0),netIncomeYtd:new Prisma.Decimal(0),totalAssets:new Prisma.Decimal(1050),totalLiabilities:new Prisma.Decimal(50),totalEquity:new Prisma.Decimal(1000),accountSources:{investingCashFlow:{amount:'0'},financingCashFlow:{amount:'0'},cashEquivalents:{amount:'0'},basicEps:{amount:'100'},parentEquity:{amount:'1000'},parentNetIncome:{amount:'0'}},periodEndDate:new Date(`${year}-12-31`)};
 let db:any;db={dartShareSnapshot:{findUnique:async()=>null,upsert:async()=>({})},collectorRunItem:{createMany:async()=>({count:1})},$executeRaw:async()=>1,$queryRaw:async(q:any)=>String(q).includes('owner_token')?[{owner_token:run.metadata.lockOwner,valid:1}]:[], $transaction:async(fn:any)=>fn(db),collectorRun:{findUnique:async()=>run,updateMany:async(q:any)=>{if(run.status!=='RUNNING')return {count:0};Object.assign(run,q.data);snapshots.push(structuredClone(run.metadata));return {count:1};}},security:{findMany:async()=>[],findUnique:async()=>({id:1n,symbol:'005930',collectionRevision:0,collectionExcluded:false,excludedFeatures:[],marketType:'KOSPI',securityType:'STOCK',isActive:true,dartCorpMapping:{corpCode:'00126380'}})},dartFinancialFiling:{findFirst:async(q:any)=>({...filing,fiscalYear:q.where.fiscalYear??year}),update:async()=>{writes++;}},periodValuation:{findUnique:async()=>valuation,upsert:async(q:any)=>{valuation={...valuation,...q.update};return valuation;},update:async(q:any)=>{valuation={...valuation,...q.data};return valuation;}},collectorLock:{findUnique:async()=>null,deleteMany:async()=>{releases++;return {count:1};}}} as unknown as PrismaClient;
 return {db,run:run as CollectorRun,record:()=>valuation,filingWrites:()=>writes,snapshots,releases:()=>releases};
}
for(const scenario of ['dart-error','dart-timeout','supplement','both-fail'] as const)test(`durable independent worker: ${scenario}`,async()=>{
 const old={acquire:PrismaDartRepository.prototype.acquireLock,list:OpenDartProvider.prototype.listPeriodicReports,naver:NaverAnnualProvider.prototype.annual,limit:manualLimits.taskMs};
 let dartCalls=0;const f=fixture(scenario==='supplement'?'SUPPLEMENT':'FULL',scenario==='supplement'?{roe:'0'}:{});
 PrismaDartRepository.prototype.acquireLock=async()=>true;
 OpenDartProvider.prototype.listPeriodicReports=async()=>{dartCalls++;if(scenario==='dart-timeout')return new Promise(()=>{});throw new DartApiError('HTTP_ERROR','unavailable');};
 NaverAnnualProvider.prototype.annual=async()=>{throw Error('Past annual must not crawl Naver');};
 if(scenario==='both-fail'){const read=f.db.periodValuation.findUnique;let failed=false;f.db.periodValuation.findUnique=async(...args:any[])=>{if(!failed){failed=true;throw Error('VALUATION_DB_UNAVAILABLE');}return (read as any)(...args);};}
 // Real parsing work must not share a 30ms CI scheduling deadline with the injected hang.
 // The hanging DART request still times out; production limits are unchanged.
 manualLimits.taskMs=1000;
 try{
  await processIndependentRefresh(f.db,config,f.run);
  const m=f.run.metadata as unknown as ManualRefreshMetadata,result=m.results![0];assert.ok(result);
  assert.equal(m.manualState,'FINISHED');assert.equal(f.releases(),1);assert.equal(f.filingWrites(),0);
  assert.equal(dartCalls,scenario==='supplement'?0:1);
  assert.equal(result.tasks?.dart.state,scenario==='supplement'?'SKIPPED':'FAILED');
  assert.equal(result.tasks?.valuation.state,scenario==='both-fail'?'FAILED':'SUCCESS');
  assert.equal(f.run.status,scenario==='both-fail'?'FAILED':scenario==='supplement'?'SUCCESS':'PARTIAL');
  if(scenario!=='both-fail'){assert.ok(Number.isFinite(Date.parse(f.record().supplemental.verifiedAt)));assert.equal(f.record().values.roe,'0');assert.equal(refreshSummary(m.results!).valuationCompleted,1);}
  if(scenario==='dart-timeout')assert.equal(result.tasks?.dart.code,'DART_TIMEOUT');
  assert.ok(f.snapshots.some(s=>s.progress?.tasks?.valuation.state==='SUCCESS'||scenario==='both-fail'));
 }finally{PrismaDartRepository.prototype.acquireLock=old.acquire;OpenDartProvider.prototype.listPeriodicReports=old.list;NaverAnnualProvider.prototype.annual=old.naver;manualLimits.taskMs=old.limit;}
});
test('a cancelled late source cannot write; fetch cancellation and transaction delegates are fenced',async()=>{
 let release:()=>void=()=>{},writes=0;const pending=new Promise<void>(resolve=>{release=resolve;});
 const db=checkedManualDb({record:{update:async()=>{writes++;}},$transaction:async(fn:(tx:any)=>Promise<void>)=>fn({record:{update:async()=>{writes++;}}})});
 let late:Promise<unknown>|undefined;
 await assert.rejects(boundedManualJob(async()=>{late=(async()=>{await pending;await db.$transaction(async tx=>{await tx.record.update();});})();return late;},10),{code:'MANUAL_JOB_TIMEOUT'});
 release();await assert.rejects(late!);assert.equal(writes,0);
 const oldFetch=globalThis.fetch;let cancelled=false;
 globalThis.fetch=((_,init)=>new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>{cancelled=true;reject(init.signal?.reason);}))) as typeof fetch;
 try{await assert.rejects(boundedManualJob(()=>manualFetch('https://example.invalid'),10));assert.equal(cancelled,true);}finally{globalThis.fetch=oldFetch;}
});
test('unavailable valuation does not roll back a successful financial task',async()=>{
 const result=await runIndependentPeriod({dart:async()=>({state:'SUCCESS'}),valuation:async()=>({state:'UNAVAILABLE',code:'BASE_MISSING'})});
 assert.equal(result.dart.state,'SUCCESS');assert.equal(result.valuation.state,'UNAVAILABLE');
});
test('orphan expiration is terminal without deleting the active owner lease',async()=>{
 const f=fixture();(f.run.metadata as unknown as ManualRefreshMetadata).lockOwner='active-owner';f.run.startedAt=new Date(Date.now()-manualLimits.queueMs-1);
 assert.equal(await expireManualRun(f.db,f.run),true);assert.equal(f.run.status,'FAILED');assert.equal((f.run.metadata as unknown as ManualRefreshMetadata).manualState,'FINISHED');
 assert.equal(await expireManualRun(f.db,f.run),false);assert.equal(f.releases(),0);
});

test('whole-run timeout also bounds a hanging pre-collection database read',async()=>{
 const old={acquire:PrismaDartRepository.prototype.acquireLock,limit:manualLimits.runMs};const f=fixture();PrismaDartRepository.prototype.acquireLock=async()=>true;manualLimits.runMs=25;f.db.security.findUnique=(()=>new Promise(()=>{})) as unknown as typeof f.db.security.findUnique;
 try{await processIndependentRefresh(f.db,config,f.run);assert.equal(f.run.status,'FAILED');assert.equal((f.run.metadata as unknown as ManualRefreshMetadata).manualState,'FINISHED');assert.equal(f.releases(),1);}finally{PrismaDartRepository.prototype.acquireLock=old.acquire;manualLimits.runMs=old.limit;}
});
test('supplement retains normal denominator and actual zero; partial new items stay a partial success',async()=>{
 const old={acquire:PrismaDartRepository.prototype.acquireLock,naver:NaverAnnualProvider.prototype.annual};const f=fixture('SUPPLEMENT',{eps:'99',roe:'0'});PrismaDartRepository.prototype.acquireLock=async()=>true;NaverAnnualProvider.prototype.annual=async()=>source();
 try{await processIndependentRefresh(f.db,config,f.run);assert.equal(f.record().values.eps,'99');assert.equal(f.record().values.per,null);assert.equal(f.record().values.roe,'0');assert.equal(f.record().values.bps,'1000');assert.equal(f.run.status,'PARTIAL');assert.equal((f.run.metadata as unknown as ManualRefreshMetadata).results?.[0]?.tasks?.valuation.state,'PARTIAL');}finally{PrismaDartRepository.prototype.acquireLock=old.acquire;NaverAnnualProvider.prototype.annual=old.naver;}
});

test('manual supplementation requests missing DART shares even when financial statements are skipped',async()=>{
 const old={acquire:PrismaDartRepository.prototype.acquireLock,shares:OpenDartProvider.prototype.fetchPeriodShares};
 const f=fixture('SUPPLEMENT'),shares=f.record().supplemental.shares;delete f.record().supplemental.shares;let calls=0;
 PrismaDartRepository.prototype.acquireLock=async()=>true;
 OpenDartProvider.prototype.fetchPeriodShares=async(corp,requestedYear,report,receipt)=>{calls++;assert.equal(requestedYear,year);assert.equal(receipt,'20260301000001');return shares;};
 try{await processIndependentRefresh(f.db,config,f.run);assert.equal(calls,1);assert.equal(f.record().values.per,'10');assert.equal(f.record().values.pbr,'1');assert.equal((f.run.metadata as unknown as ManualRefreshMetadata).results?.[0]?.tasks?.dart.state,'SKIPPED');assert.equal(f.filingWrites(),0);}finally{PrismaDartRepository.prototype.acquireLock=old.acquire;OpenDartProvider.prototype.fetchPeriodShares=old.shares;}
});
test('a transaction already waiting for a late response cannot commit after its budget expires',async()=>{
 let release:()=>void=()=>{},commits=0;const pending=new Promise<void>(resolve=>{release=resolve;});
 const db=checkedManualDb({$transaction:async(fn:(tx:object)=>Promise<unknown>)=>{const result=await fn({});commits++;return result;}});
 let late:Promise<unknown>|undefined;
 await assert.rejects(boundedManualJob(()=>{late=db.$transaction(async()=>{await pending;return 'late result';});return late;},10));
 release();await assert.rejects(late!);assert.equal(commits,0);
});
test('implicit delegate writes also roll back when the response arrives after timeout',async()=>{
 let release:()=>void=()=>{},commits=0;const pending=new Promise<void>(resolve=>{release=resolve;});
 const db=checkedManualDb({record:{update:async()=>{throw Error('unguarded delegate must not run');}},$transaction:async(fn:(tx:any)=>Promise<unknown>)=>{const result=await fn({record:{update:async()=>{await pending;return 'saved';}}});commits++;return result;}});
 let late:Promise<unknown>|undefined;
 await assert.rejects(boundedManualJob(()=>{late=db.record.update();return late;},10));release();await assert.rejects(late!);assert.equal(commits,0);
});
