import test from 'node:test';
import assert from 'node:assert/strict';
import {processIndependentRefresh,runIndependentPeriod,manualLimits,expireManualRun} from './manual-refresh-jobs.js';
import {boundedManualJob,checkedManualDb,manualFetch} from './manual-job-budget.js';
import {NaverAnnualProvider,parseNaverAnnual,NaverAnnualError} from './naver-annual.js';
import {OpenDartProvider,DartApiError} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import type {PrismaClient,CollectorRun} from '../generated/prisma/index.js';
import type {DartCollectorConfig} from './dart-collector.js';
import type {ManualRefreshMetadata} from './dart-manual-refresh.js';
import {refreshSummary} from './refresh-summary.js';

const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()))-1;
const source=()=>parseNaverAnnual(`<table><thead><tr><th>연간</th></tr><tr><th>${year}/12 (IFRS연결)</th></tr></thead><tbody>${[['EPS(원)','100'],['BPS(원)','1000'],['PER(배)','10'],['PBR(배)','1'],['ROE(%)','0']].map(([k,v])=>`<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`,'005930','단위 : 억원, %, 배, 주; 보통주수정주가(기말)/EPS; 보통주+우선주; [기준:2026.10.07]');
const config={enabled:true,apiKey:'test',minDelayMs:0,dailyCallLimit:10} as DartCollectorConfig;
function fixture(mode:'FULL'|'SUPPLEMENT'='FULL',oldValues:Record<string,string|null>={}){
 let valuation:any={securityId:1n,fiscalYear:year,periodType:'ANNUAL',status:'PARTIAL',values:oldValues,provenance:{},supplemental:{price:{value:'1000',date:`${year}-12-30`,source:'KRX_UNADJUSTED_CLOSE'}},reasons:{}};
 const run:any={id:1n,jobType:'dart-financial-statements',status:'RUNNING',startedAt:new Date(),metadata:{phase:'MANUAL',executionMode:'MANUAL_PROTOTYPE',refreshMode:mode,securityId:'1',startYear:year,endYear:year,fiscalYear:year,period:'ANNUAL',manualState:'QUEUED'}};
 let releases=0,writes=0;const snapshots:ManualRefreshMetadata[]=[];
 const filing={receiptNo:'20260301000001',fiscalYear:year,periodType:'ANNUAL',fsDivision:'CFS',revenueYtd:'0',operatingProfitYtd:'0',netIncomeYtd:'0',totalAssets:'100',totalLiabilities:'50',totalEquity:'50',accountSources:{basicEps:{},parentEquity:{}},periodEndDate:new Date(`${year}-12-31`)};
 const db={collectorRun:{findUnique:async()=>run,updateMany:async(q:any)=>{if(run.status!=='RUNNING')return {count:0};Object.assign(run,q.data);snapshots.push(structuredClone(run.metadata));return {count:1};}},security:{findUnique:async()=>({id:1n,symbol:'005930',marketType:'KOSPI',securityType:'STOCK',isActive:true,dartCorpMapping:{corpCode:'00126380'}})},dartFinancialFiling:{findFirst:async()=>filing,update:async()=>{writes++;}},periodValuation:{findUnique:async()=>valuation,upsert:async(q:any)=>{valuation={...valuation,...q.update};return valuation;},update:async(q:any)=>{valuation={...valuation,...q.data};return valuation;}},collectorLock:{deleteMany:async()=>{releases++;return {count:1};}}} as unknown as PrismaClient;
 return {db,run:run as CollectorRun,record:()=>valuation,filingWrites:()=>writes,snapshots,releases:()=>releases};
}
for(const scenario of ['dart-error','dart-timeout','supplement','both-fail'] as const)test(`durable independent worker: ${scenario}`,async()=>{
 const old={acquire:PrismaDartRepository.prototype.acquireLock,list:OpenDartProvider.prototype.listPeriodicReports,naver:NaverAnnualProvider.prototype.annual,limit:manualLimits.taskMs};
 let dartCalls=0;const f=fixture(scenario==='supplement'?'SUPPLEMENT':'FULL',scenario==='supplement'?{roe:'0'}:{});
 PrismaDartRepository.prototype.acquireLock=async()=>true;
 OpenDartProvider.prototype.listPeriodicReports=async()=>{dartCalls++;if(scenario==='dart-timeout')return new Promise(()=>{});throw new DartApiError('HTTP_ERROR','unavailable');};
 NaverAnnualProvider.prototype.annual=async()=>{if(scenario==='both-fail')throw new NaverAnnualError('NAVER_COMMUNICATION');return source();};
 manualLimits.taskMs=30;
 try{
  await processIndependentRefresh(f.db,config,f.run);
  const m=f.run.metadata as unknown as ManualRefreshMetadata,result=m.results![0];assert.ok(result);
  assert.equal(m.manualState,'FINISHED');assert.equal(f.releases(),1);assert.equal(f.filingWrites(),0);
  assert.equal(dartCalls,scenario==='supplement'?0:1);
  assert.equal(result.tasks?.dart.state,scenario==='supplement'?'SKIPPED':'FAILED');
  assert.equal(result.tasks?.valuation.state,scenario==='both-fail'?'FAILED':'SUCCESS');
  assert.equal(f.run.status,scenario==='both-fail'?'FAILED':scenario==='supplement'?'SUCCESS':'PARTIAL');
  if(scenario!=='both-fail'){assert.equal(f.record().values.roe,'0');assert.equal(refreshSummary(m.results!).valuationCompleted,1);}
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
test('orphan expiration is terminal and releases only its persisted owner',async()=>{
 const f=fixture();f.run.startedAt=new Date(Date.now()-manualLimits.queueMs-1);
 assert.equal(await expireManualRun(f.db,f.run),true);assert.equal(f.run.status,'FAILED');assert.equal((f.run.metadata as unknown as ManualRefreshMetadata).manualState,'FINISHED');
 assert.equal(await expireManualRun(f.db,f.run),false);
});
