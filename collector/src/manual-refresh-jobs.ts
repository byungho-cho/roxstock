import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {manualLimits,expireManualRun,manualJson as json,manualPeriods as allPeriods,type ManualTaskState,type ManualTaskResult} from '@roxstock/shared/collection/manual-requests';
export {manualLimits,expireManualRun,type ManualTaskState,type ManualTaskResult} from '@roxstock/shared/collection/manual-requests';
import {withCollection,CollectionExcluded} from '@roxstock/shared/collection/collection-policy';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {validateDartFiling,requireDartReportPeriod} from './dart-filing-validation.js';
import {dartDiagnostic} from '@roxstock/shared/collection/dart-diagnostics';
import {randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma,CollectorRun} from '@roxstock/shared/prisma';
import type {ManualRefreshMetadata} from './dart-manual-refresh.js';
import type {DartCollectorConfig} from './dart-collector.js';
import {getCfsThenOfs} from './dart-collector.js';
import {DartApiError,OpenDartProvider,type DartPeriodType} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import {normalizeManualDartAccounts} from './manual-dart-accounts.js';
import {refreshManualAnnual} from './manual-annual-prototype.js';
import {NaverAnnualProvider} from './naver-annual.js';
import {loadPeriodSupplement,supplementStoredPeriod} from './valuation-supplement.js';
import {boundedManualJob,checkedManualDb,manualFetch,checkManualJob} from './manual-job-budget.js';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import type {MetricValues} from '@roxstock/shared/domain/period-valuation';
import {getSeoulClock} from '@roxstock/shared/collection/time';

const codes={Q1:'11013',Q2:'11012',Q3:'11014',ANNUAL:'11011'} as const;

const errorCode=(error:unknown)=>typeof error==='object'&&error&&'code' in error&&/^[A-Z0-9_]{1,80}$/.test(String(error.code))?String(error.code):'MANUAL_COLLECTION_ERROR';


/** Neither rejection nor timeout of one task cancels the other. Also used in fault regression tests. */
export async function runIndependentPeriod(tasks:{dart:()=>Promise<ManualTaskResult>;valuation:()=>Promise<ManualTaskResult>},
 options:{milliseconds?:number;signal?:AbortSignal;onState?:(source:'dart'|'valuation',result:ManualTaskResult)=>Promise<void>}={}){
 const execute=async(source:'dart'|'valuation')=>{
  const started=Date.now();await options.onState?.(source,{state:'RUNNING'});
  let result:ManualTaskResult;
  try{result=await boundedManualJob(tasks[source],options.milliseconds??manualLimits.taskMs,options.signal);}
  catch(error){console.warn(JSON.stringify({event:'DART manual source failure',source,...dartDiagnostic(error,'MANUAL_SOURCE')}));const code=errorCode(error);result={state:error instanceof CollectionExcluded?'SKIPPED':'FAILED',code:code==='MANUAL_JOB_TIMEOUT'?source==='dart'?'DART_TIMEOUT':'VALUATION_TIMEOUT':code};}
  result={...result,durationMs:Date.now()-started};await options.onState?.(source,result);return result;
 };
 const [dart,valuation]=await Promise.all([execute('dart'),execute('valuation')]);return {dart,valuation};
}

export async function processIndependentRefresh(db:PrismaClient,config:DartCollectorConfig,run:CollectorRun){
 db=collectionClient(db);
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
  if(!m.symbol&&security.codeRevision>0)throw new CollectionExcluded('요청 시점의 종목코드를 확인할 수 없어 수집에서 제외','IDENTITY');
  m.symbol??=security.symbol;m.collectionRevision??=security.collectionRevision;
  const scopedDb=checkedManualDb(db),scopedRepo=new PrismaDartRepository(scopedDb);
  const provider=new OpenDartProvider({apiKey:config.apiKey||'UNCONFIGURED',dailyCallLimit:config.dailyCallLimit,minDelayMs:config.minDelayMs,fetchFn:manualFetch,
   reserveCall:limit=>{checkManualJob();return repo.reserveApiCall(limit,new Date(),owner);},onApiStatus:code=>repo.recordApiResult(code==='013'?'NO_DATA':'ERROR')});
  const naver=new NaverAnnualProvider(manualFetch),currentYear=Number(getSeoulClock().dateKey.slice(0,4));
  for(let year=start;year<=end;year++)for(const period of periods){
   m.progress={currentYear:year,currentPeriod:period,stage:'VALUATION',completed:results.length,total:(end-start+1)*periods.length,tasks:{dart:{state:'QUEUED'},valuation:{state:'QUEUED'}}};
   let valuation:Awaited<ReturnType<typeof refreshManualAnnual>>|undefined;
   const tasks=await runIndependentPeriod({
    dart:async()=>withCollection(scopedDb,security.id,'dart-financial-statements',async()=>{
     if(m.refreshMode==='SUPPLEMENT'||period==='ANNUAL'&&year===currentYear)return {state:'SKIPPED'};
     if(!config.enabled||!config.apiKey)throw new DartApiError('API_KEY_MISSING','DART 설정 없음');
     const mapping=security.dartCorpMapping;if(!mapping)throw new DartApiError('DART_CORP_CODE_NOT_MAPPED','DART 기업코드 없음');
     const reports=await provider.listPeriodicReports(mapping.corpCode,year),report=reports.find(r=>r.reportCode===codes[period]&&!r.withdrawn);
     if(!report)return {state:'NO_DATA',code:'NO_PERIODIC_FILING'};
     requireDartReportPeriod(report,mapping.corpCode,year);
     const filing=await getCfsThenOfs(provider,mapping.corpCode,year,codes[period]);
     if(!filing.rows.length)return {state:'NO_DATA',code:'FINANCIAL_ROWS_NOT_PUBLISHED'};
     const source=validateDartFiling({corpCode:mapping.corpCode,taskFiscalYear:year,report,rows:filing.rows,fsDivision:filing.division});
     const values=normalizeManualDartAccounts(filing.rows);
     if(Object.entries(values).filter(([key])=>key!=='accountSources').every(([,value])=>value==null))return {state:'NO_DATA',code:'FINANCIAL_VALUES_EMPTY'};
     // Missing fields retain the last verified value in the same statement division. Actual zero remains zero.
     const candidate=await scopedDb.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:year,periodType:period,fsDivision:filing.division,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}]});
     // Never fill a new source with a legacy filing whose actual period or currency is unverified.
     const oldPeriod=candidate?.periodEndDate.toISOString().slice(0,10);
     const declared=candidate?.reportName.match(/\((\d{4})\.(\d{2})\)/)?.slice(1).join('-');
     const previous=candidate&&(candidate.receiptNo===source.receiptNo||oldPeriod===source.periodEndDate.toISOString().slice(0,10)&&declared===source.sourceValidation.reportPeriod&&(candidate.sourceValidation as {currency?:string}|null)?.currency==='KRW')?candidate:null;
     for(const key of Object.keys(values) as (keyof typeof values)[])if(key!=='accountSources'&&values[key]==null&&previous?.[key]!=null){values[key]=String(previous[key]);const evidence=previous.accountSources as Record<string,unknown>|null;values.accountSources[key]={...(evidence?.[key] as typeof values.accountSources[string]),retainedFromReceipt:previous.receiptNo} as typeof values.accountSources[string];}
     values.accountSources={...((previous?.accountSources??{}) as typeof values.accountSources),...values.accountSources};
     await scopedRepo.saveFiling({securityId:security.id,fiscalYear:year,periodType:period,reportCode:codes[period],fsDivision:filing.division,...source,collectedAt:new Date(),values});
     const {accountSources,...amounts}=values;
     await scopedDb.dartFinancialFiling.update({where:{receiptNo:source.receiptNo},data:{...amounts,accountSources:json(accountSources)}});
     return {state:'SUCCESS' as const};
    },m),
    valuation:async()=>withCollection(scopedDb,security.id,'valuation',async()=>{
     if(period==='ANNUAL'&&year===currentYear){valuation=await refreshManualAnnual(scopedDb,security,year,provider,naver,scopedRepo,run.id,{storedOnly:true,missingOnly:m.refreshMode==='SUPPLEMENT'});return {state:valuation.valuationStatus==='SUCCESS'?'SUCCESS':valuation.valuationStatus==='PARTIAL'?'PARTIAL':Object.keys(valuation.valuationErrors).length?'FAILED':'UNAVAILABLE',code:valuation.valuationStatus==='SUCCESS'?undefined:'VALUATION_INCOMPLETE'};}
     const metric=await supplementStoredPeriod(scopedDb,security.id,year,period,{load:loadPeriodSupplement(provider,security.symbol,security.dartCorpMapping?.corpCode??'',undefined,security.marketType,'MANUAL_PROTOTYPE',{fetcher:manualFetch})});
     return {state:metric?.status==='SUCCESS'?'SUCCESS':metric?.status==='PARTIAL'?'PARTIAL':'UNAVAILABLE',code:metric?.status==='SUCCESS'?undefined:'VALUATION_BASE_MISSING'};
    },m),
   },{signal,milliseconds:Math.max(1,Math.min(manualLimits.taskMs,deadline-Date.now())),onState:async(source,result)=>{
    m.progress!.tasks![source]=result;await publish();
    if(result.state!=='RUNNING')console.info(JSON.stringify({event:'manual_refresh_task',jobId:String(run.id),source:source==='dart'?'OPEN_DART':year===currentYear?'ANNUAL_CONSENSUS':'DART_AND_PERIOD_END_PRICE',fiscalYear:year,period,durationMs:result.durationMs,code:result.code??result.state}));
   }});
   const saved=await scopedDb.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year,periodType:period==='ANNUAL'&&year===currentYear?'ESTIMATE':period}}});
   const stored=await scopedDb.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:year,periodType:period,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}]});
   const displayStored=stored&&saved?supplementedFilings([stored],[saved])[0]:stored;
   const financialComplete=Boolean(displayStored&&[displayStored.revenueYtd,displayStored.operatingProfitYtd,displayStored.netIncomeYtd,displayStored.totalAssets,displayStored.totalLiabilities,displayStored.totalEquity].every(v=>v!=null));
   if(saved&&period==='ANNUAL'&&tasks.valuation.state!=='SKIPPED'){
    const supplemental=(saved.supplemental??{}) as Record<string,unknown>,attempt=(supplemental.manualAttempt??{}) as Record<string,unknown>;
    const complete=valueCompletion(saved.values as Partial<MetricValues>).complete;
    const state=year===currentYear?complete?'ESTIMATE_READY':attempt.state:financialComplete&&complete?'COMPLETE':financialComplete?'FINANCIAL_ONLY':'FINAL_FAILED';
    await withCollection(scopedDb,security.id,'valuation',()=>scopedDb.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:saved.securityId,fiscalYear:saved.fiscalYear,periodType:saved.periodType}},data:{supplemental:json({...supplemental,manualAttempt:{...attempt,state,tasks,finishedAt:new Date().toISOString()}})}}),m);
   }
   results.push({...valuation,fiscalYear:year,period,status:tasks.dart.code==='COLLECTION_EXCLUDED'&&tasks.valuation.state==='SKIPPED'?'SKIPPED':tasks.dart.state==='SUCCESS'?'SUCCESS':tasks.dart.state==='FAILED'?'FAILED':tasks.dart.state==='SKIPPED'&&tasks.valuation.state==='SUCCESS'?'SUCCESS':'NO_DATA',code:tasks.dart.code,financialComplete,valuationStatus:tasks.valuation.state==='SUCCESS'?'SUCCESS':tasks.valuation.state,tasks});
   m.progress.completed=results.length;m.progress.stage='REPORT_DONE';await publish();
  }
  },manualLimits.runMs,signal);
 }catch(error){
  const code=errorCode(error);for(let year=start;year<=end;year++)for(const period of periods)if(!results.some(r=>r.fiscalYear===year&&r.period===period))results.push({fiscalYear:year,period,status:error instanceof CollectionExcluded?'SKIPPED':'FAILED',code,valuationStatus:error instanceof CollectionExcluded?'SKIPPED':'FAILED'});
 }finally{
  try{
   await boundedManualJob(()=>publishTail,10_000).catch(()=>{});
   const success=results.filter(r=>r.tasks?Object.values(r.tasks).some(t=>t.state==='SUCCESS'||t.state==='PARTIAL'):r.status==='SUCCESS').length;
   const failed=results.filter(r=>r.tasks?Object.values(r.tasks).some(t=>t.state==='FAILED'||t.state==='UNAVAILABLE'||t.state==='PARTIAL'):r.status==='FAILED').length;
   const items=results.map(r=>{
    const sources=r.tasks?Object.values(r.tasks):[];
    const status=sources.length?(sources.some(t=>t.state==='FAILED')?'FAILED':sources.some(t=>t.state==='SUCCESS'||t.state==='PARTIAL')?'SUCCESS':sources.every(t=>t.state==='SKIPPED')?'SKIPPED':'NO_DATA'):r.status;
    const labels:Record<string,string>={SUCCESS:'완료',PARTIAL:'일부 미수집',FAILED:'실패',SKIPPED:'수집 제외',NO_DATA:'자료 없음',UNAVAILABLE:'미제공'};
    const message=r.tasks?`재무제표 ${labels[r.tasks.dart.state]??r.tasks.dart.state} · 가치지표 ${labels[r.tasks.valuation.state]??r.tasks.valuation.state}${r.tasks.dart.code?' · '+r.tasks.dart.code:''}${r.tasks.valuation.code?' · '+r.tasks.valuation.code:''}`:r.code;
    return {runId:run.id,securityId:BigInt(m.securityId),symbol:`${m.symbol??'CODE_UNKNOWN'}:${r.fiscalYear}:${r.period}`,status,message};
   });
   await boundedManualJob(()=>db.$transaction(async tx=>{
    const changed=await tx.collectorRun.updateMany({where:{id:run.id,status:'RUNNING'},data:{status:success?failed||results.some(r=>r.tasks?.dart.state==='NO_DATA')?'PARTIAL':'SUCCESS':failed?'FAILED':'SKIPPED',finishedAt:new Date(),successCount:items.filter(r=>r.status==='SUCCESS').length,failureCount:items.filter(r=>r.status==='FAILED').length,skippedCount:items.filter(r=>r.status==='NO_DATA'||r.status==='SKIPPED').length,metadata:json({...m,manualState:'FINISHED',results})}});
    if(changed.count&&items.length)await tx.collectorRunItem.createMany({data:items});
   }),10_000);
  }catch(error){console.warn(JSON.stringify({event:'manual_refresh_finalization_failed',jobId:String(run.id),code:errorCode(error)}));}
  finally{await boundedManualJob(()=>repo.releaseLock(owner),10_000).catch(()=>{});}
 }
 return true;
}
