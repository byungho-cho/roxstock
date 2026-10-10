import {randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma,CollectorRun} from '../generated/prisma/index.js';
import type {ManualRefreshMetadata} from './dart-manual-refresh.js';
import type {DartCollectorConfig} from './dart-collector.js';
import {getCfsThenOfs,endOfFiscalPeriod,parseDartDate} from './dart-collector.js';
import {DartApiError,OpenDartProvider,type DartPeriodType} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import {normalizeManualDartAccounts} from './manual-dart-accounts.js';
import {refreshManualAnnual} from './manual-annual-prototype.js';
import {NaverAnnualProvider} from './naver-annual.js';
import {loadPeriodSupplement,supplementStoredPeriod} from './valuation-supplement.js';
import {boundedManualJob,checkedManualDb,manualFetch,checkManualJob} from './manual-job-budget.js';
import {valueCompletion} from '../domain/collection-status.js';
import type {MetricValues} from '../domain/period-valuation.js';
import {getSeoulClock} from './time.js';

export type ManualTaskState='QUEUED'|'RUNNING'|'SUCCESS'|'PARTIAL'|'FAILED'|'NO_DATA'|'UNAVAILABLE'|'SKIPPED';
export type ManualTaskResult={state:ManualTaskState;code?:string;durationMs?:number};
export const manualLimits={requestMs:20_000,taskMs:120_000,runMs:600_000,queueMs:1_800_000};
const codes={Q1:'11013',Q2:'11012',Q3:'11014',ANNUAL:'11011'} as const;
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const errorCode=(error:unknown)=>typeof error==='object'&&error&&'code' in error&&/^[A-Z0-9_]{1,80}$/.test(String(error.code))?String(error.code):'MANUAL_COLLECTION_ERROR';
const allPeriods=(m:ManualRefreshMetadata)=>m.period==='ALL'?['ANNUAL','Q1','Q2','Q3'] as DartPeriodType[]:[m.period];

/** Neither rejection nor timeout of one task cancels the other. Also used in fault regression tests. */
export async function runIndependentPeriod(tasks:{dart:()=>Promise<ManualTaskResult>;valuation:()=>Promise<ManualTaskResult>},
 options:{milliseconds?:number;signal?:AbortSignal;onState?:(source:'dart'|'valuation',result:ManualTaskResult)=>Promise<void>}={}){
 const execute=async(source:'dart'|'valuation')=>{
  const started=Date.now();await options.onState?.(source,{state:'RUNNING'});
  let result:ManualTaskResult;
  try{result=await boundedManualJob(tasks[source],options.milliseconds??manualLimits.taskMs,options.signal);}
  catch(error){const code=errorCode(error);result={state:'FAILED',code:code==='MANUAL_JOB_TIMEOUT'?source==='dart'?'DART_TIMEOUT':'VALUATION_TIMEOUT':code};}
  result={...result,durationMs:Date.now()-started};await options.onState?.(source,result);return result;
 };
 const [dart,valuation]=await Promise.all([execute('dart'),execute('valuation')]);return {dart,valuation};
}

/** Durable terminal transition, including orphaned workers; only the matching owner lease is removed. */
export async function expireManualRun(db:PrismaClient,run:CollectorRun,now=Date.now()){
 const m=run.metadata as unknown as ManualRefreshMetadata;
 if(run.status!=='RUNNING'||m.phase!=='MANUAL')return false;
 const expires=m.deadlineAt?Date.parse(m.deadlineAt):run.startedAt.getTime()+(m.manualState==='QUEUED'?manualLimits.queueMs:manualLimits.runMs+60_000);
 if(now<expires)return false;
 const results=[...(m.results??[])];for(let year=m.startYear??m.fiscalYear;year<=(m.endYear??m.fiscalYear);year++)for(const period of allPeriods(m))if(!results.some(r=>r.fiscalYear===year&&r.period===period))results.push({fiscalYear:year,period,status:'FAILED',code:'MANUAL_RUN_TIMEOUT',valuationStatus:'FAILED',tasks:{dart:{state:'FAILED',code:'DART_TIMEOUT'},valuation:{state:'FAILED',code:'VALUATION_TIMEOUT'}}});
 const terminal={...m,results,manualState:'FINISHED',terminalCode:'MANUAL_RUN_TIMEOUT',progress:m.progress?{...m.progress,tasks:{dart:{state:'FAILED',code:'DART_TIMEOUT'},valuation:{state:'FAILED',code:'VALUATION_TIMEOUT'}}}:undefined};
 const changed=await db.collectorRun.updateMany({where:{id:run.id,status:'RUNNING'},data:{status:results.some(r=>r.status==='SUCCESS'||r.valuationStatus==='SUCCESS')?'PARTIAL':'FAILED',finishedAt:new Date(now),failureReason:'MANUAL_RUN_TIMEOUT',metadata:json(terminal)}});
 if(changed.count&&m.lockOwner)await new PrismaDartRepository(db).releaseLock(m.lockOwner);
 return Boolean(changed.count);
}

export async function processIndependentRefresh(db:PrismaClient,config:DartCollectorConfig,run:CollectorRun){
 if(await boundedManualJob(()=>expireManualRun(db,run),10_000))return true;
 const owner=randomUUID(),repo=new PrismaDartRepository(db);
 try{if(!await boundedManualJob(()=>repo.acquireLock(owner,660),10_000))return true;}catch(error){await boundedManualJob(()=>repo.releaseLock(owner),10_000).catch(()=>{});throw error;}
 let publishTail=Promise.resolve();
 let fresh:CollectorRun|null;
 try{fresh=await boundedManualJob(()=>db.collectorRun.findUnique({where:{id:run.id}}),10_000);}catch(error){await boundedManualJob(()=>repo.releaseLock(owner),10_000).catch(()=>{});throw error;}
 if(!fresh||fresh.status!=='RUNNING'){await boundedManualJob(()=>repo.releaseLock(owner),10_000).catch(()=>{});return true;}
 const m=fresh.metadata as unknown as ManualRefreshMetadata;
 const results:NonNullable<ManualRefreshMetadata['results']>=[];
 const start=m.startYear??m.fiscalYear,end=m.endYear??m.fiscalYear,periods=allPeriods(m),deadline=Date.now()+manualLimits.runMs;
 m.deadlineAt=new Date(deadline).toISOString();m.lockOwner=owner;m.manualState='PROCESSING';
 const signal=AbortSignal.timeout(manualLimits.runMs);
 const publish=()=>{if(Date.now()>=deadline)return Promise.resolve();const snapshot=json({...m,results:[...results]});publishTail=publishTail.then(async()=>{await db.collectorRun.updateMany({where:{id:run.id,status:'RUNNING'},data:{metadata:snapshot}});});return publishTail;};
 try{
  await boundedManualJob(async()=>{
  await publish();
  const security=await db.security.findUnique({where:{id:BigInt(m.securityId)},include:{dartCorpMapping:true}});
  if(!security?.isActive||security.securityType!=='STOCK')throw new DartApiError('SECURITY_NOT_FOUND','수집 대상 종목을 확인해 주세요.');
  const scopedDb=checkedManualDb(db),scopedRepo=new PrismaDartRepository(scopedDb);
  const provider=new OpenDartProvider({apiKey:config.apiKey||'UNCONFIGURED',dailyCallLimit:config.dailyCallLimit,minDelayMs:config.minDelayMs,fetchFn:manualFetch,
   reserveCall:limit=>{checkManualJob();return repo.reserveApiCall(limit,new Date(),owner);},onApiStatus:code=>repo.recordApiResult(code==='013'?'NO_DATA':'ERROR')});
  const naver=new NaverAnnualProvider(manualFetch),currentYear=Number(getSeoulClock().dateKey.slice(0,4));
  for(let year=start;year<=end;year++)for(const period of periods){
   m.progress={currentYear:year,currentPeriod:period,stage:'VALUATION',completed:results.length,total:(end-start+1)*periods.length,tasks:{dart:{state:'QUEUED'},valuation:{state:'QUEUED'}}};
   let valuation:Awaited<ReturnType<typeof refreshManualAnnual>>|undefined;
   const tasks=await runIndependentPeriod({
    dart:async()=>{
     if(m.refreshMode==='SUPPLEMENT'||period==='ANNUAL'&&year===currentYear)return {state:'SKIPPED'};
     if(!config.enabled||!config.apiKey)throw new DartApiError('API_KEY_MISSING','DART 설정 없음');
     const mapping=security.dartCorpMapping;if(!mapping)throw new DartApiError('DART_CORP_CODE_NOT_MAPPED','DART 기업코드 없음');
     const reports=await provider.listPeriodicReports(mapping.corpCode,year),report=reports.find(r=>r.reportCode===codes[period]&&!r.withdrawn);
     if(!report)return {state:'NO_DATA',code:'NO_PERIODIC_FILING'};
     const filing=await getCfsThenOfs(provider,mapping.corpCode,year,codes[period]);
     if(!filing.rows.length)return {state:'NO_DATA',code:'FINANCIAL_ROWS_NOT_PUBLISHED'};
     if(filing.rows.some(row=>row.receiptNo!==report.receiptNo))throw new DartApiError('RECEIPT_MISMATCH','공시번호 불일치');
     const values=normalizeManualDartAccounts(filing.rows);
     if(Object.entries(values).filter(([key])=>key!=='accountSources').every(([,value])=>value==null))return {state:'NO_DATA',code:'FINANCIAL_VALUES_EMPTY'};
     // Missing fields retain the last verified value in the same statement division. Actual zero remains zero.
     const previous=await scopedDb.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:year,periodType:period,fsDivision:filing.division,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}]});
     for(const key of Object.keys(values) as (keyof typeof values)[])if(key!=='accountSources'&&values[key]==null&&previous?.[key]!=null){values[key]=String(previous[key]);const evidence=previous.accountSources as Record<string,unknown>|null;values.accountSources[key]={...(evidence?.[key] as typeof values.accountSources[string]),retainedFromReceipt:previous.receiptNo} as typeof values.accountSources[string];}
     values.accountSources={...((previous?.accountSources??{}) as typeof values.accountSources),...values.accountSources};
     await scopedRepo.saveFiling({securityId:security.id,fiscalYear:year,periodType:period,reportCode:codes[period],fsDivision:filing.division,receiptNo:report.receiptNo,reportName:report.reportName,receiptDate:parseDartDate(report.receiptDate),periodEndDate:endOfFiscalPeriod(year,period),collectedAt:new Date(),values});
     const {accountSources,...amounts}=values;
     await scopedDb.dartFinancialFiling.update({where:{receiptNo:report.receiptNo},data:{...amounts,accountSources:json(accountSources)}});
     return {state:'SUCCESS'};
    },
    valuation:async()=>{
     if(period==='ANNUAL'&&year>=2021){valuation=await refreshManualAnnual(scopedDb,security,year,provider,naver,scopedRepo,run.id,{storedOnly:true,missingOnly:m.refreshMode==='SUPPLEMENT'});return {state:valuation.valuationStatus==='SUCCESS'?'SUCCESS':valuation.valuationStatus==='PARTIAL'?'PARTIAL':Object.keys(valuation.valuationErrors).length?'FAILED':'UNAVAILABLE',code:valuation.valuationStatus==='SUCCESS'?undefined:'VALUATION_INCOMPLETE'};}
     const metric=await supplementStoredPeriod(scopedDb,security.id,year,period,{load:loadPeriodSupplement(provider,security.symbol,security.dartCorpMapping?.corpCode??'',undefined,security.marketType,'MANUAL_PROTOTYPE',{dartRequests:false,fetcher:manualFetch})});
     return {state:metric?.status==='SUCCESS'?'SUCCESS':metric?.status==='PARTIAL'?'PARTIAL':'UNAVAILABLE',code:metric?.status==='SUCCESS'?undefined:'VALUATION_BASE_MISSING'};
    },
   },{signal,milliseconds:Math.max(1,Math.min(manualLimits.taskMs,deadline-Date.now())),onState:async(source,result)=>{
    m.progress!.tasks![source]=result;await publish();
    if(result.state!=='RUNNING')console.info(JSON.stringify({event:'manual_refresh_task',jobId:String(run.id),source:source==='dart'?'OPEN_DART':'NAVER_AND_STORED_DATA',fiscalYear:year,period,durationMs:result.durationMs,code:result.code??result.state}));
   }});
   const saved=await scopedDb.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:period==='ANNUAL'&&year===currentYear?'ESTIMATE':period}}});
   const stored=await scopedDb.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:year,periodType:period,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}]});
   const financialComplete=Boolean(stored&&[stored.revenueYtd,stored.operatingProfitYtd,stored.netIncomeYtd,stored.totalAssets,stored.totalLiabilities,stored.totalEquity].every(v=>v!=null));
   if(saved&&period==='ANNUAL'){
    const supplemental=(saved.supplemental??{}) as Record<string,unknown>,attempt=(supplemental.manualAttempt??{}) as Record<string,unknown>;
    const complete=valueCompletion(saved.values as Partial<MetricValues>).complete;
    const state=year===currentYear?complete?'ESTIMATE_READY':attempt.state:financialComplete&&complete?'COMPLETE':financialComplete?'FINANCIAL_ONLY':'FINAL_FAILED';
    await scopedDb.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:saved.securityId,fiscalYear:saved.fiscalYear,periodType:saved.periodType}},data:{supplemental:json({...supplemental,manualAttempt:{...attempt,state,tasks}})}});
   }
   results.push({...valuation,fiscalYear:year,period,status:tasks.dart.state==='SUCCESS'?'SUCCESS':tasks.dart.state==='FAILED'?'FAILED':tasks.dart.state==='SKIPPED'&&tasks.valuation.state==='SUCCESS'?'SUCCESS':'NO_DATA',code:tasks.dart.code,financialComplete,valuationStatus:tasks.valuation.state==='SUCCESS'?'SUCCESS':tasks.valuation.state,tasks});
   m.progress.completed=results.length;m.progress.stage='REPORT_DONE';await publish();
  }
  },manualLimits.runMs,signal);
 }catch(error){
  const code=errorCode(error);for(let year=start;year<=end;year++)for(const period of periods)if(!results.some(r=>r.fiscalYear===year&&r.period===period))results.push({fiscalYear:year,period,status:'FAILED',code,valuationStatus:'FAILED'});
 }finally{
  try{
   await boundedManualJob(()=>publishTail,10_000).catch(()=>{});
   const success=results.filter(r=>r.tasks?Object.values(r.tasks).some(t=>t.state==='SUCCESS'||t.state==='PARTIAL'):r.status==='SUCCESS').length;
   const failed=results.filter(r=>r.tasks?Object.values(r.tasks).some(t=>t.state==='FAILED'||t.state==='UNAVAILABLE'||t.state==='PARTIAL'):r.status==='FAILED').length;
   const skipped=results.filter(r=>r.tasks?!Object.values(r.tasks).some(t=>t.state==='SUCCESS'||t.state==='PARTIAL'||t.state==='FAILED'||t.state==='UNAVAILABLE'):r.status==='NO_DATA').length;
   await boundedManualJob(()=>db.collectorRun.updateMany({where:{id:run.id,status:'RUNNING'},data:{status:success?failed||results.some(r=>r.tasks?.dart.state==='NO_DATA')?'PARTIAL':'SUCCESS':failed?'FAILED':'SKIPPED',finishedAt:new Date(),successCount:success,failureCount:failed,skippedCount:Math.max(0,skipped),metadata:json({...m,manualState:'FINISHED',results})}}),10_000);
  }catch(error){console.warn(JSON.stringify({event:'manual_refresh_finalization_failed',jobId:String(run.id),code:errorCode(error)}));}
  finally{await boundedManualJob(()=>repo.releaseLock(owner),10_000).catch(()=>{});}
 }
 return true;
}
