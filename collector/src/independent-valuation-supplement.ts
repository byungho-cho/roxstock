import {financialCurrency} from '@roxstock/shared/domain/financial-currency';
import {leaseOwnerId} from '@roxstock/shared/collection/manual-requests';
import {withFinancialLease,FinancialLeaseLost,financialHeartbeatMs} from '@roxstock/shared/collection/financial-lease';
import {fiscalDurationMatches} from '@roxstock/shared/domain/period-valuation';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {CollectionExcluded,withCollection} from '@roxstock/shared/collection/collection-policy';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {dartDiagnostic} from '@roxstock/shared/collection/dart-diagnostics';
import {randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {PrismaDartRepository} from './dart-repository.js';
import {OpenDartProvider,DartApiError} from './dart-provider.js';
import {type MetricValues,type Supplemental} from '@roxstock/shared/domain/period-valuation';
import {sufficientPeriodShares} from '@roxstock/shared/domain/share-counts';
import {supplementStoredPeriod,loadPeriodSupplement,needsDartAccounts} from './valuation-supplement.js';
import {dartWindowOpen} from '@roxstock/shared/collection/dart-policy';
import {getSeoulClock} from '@roxstock/shared/collection/time';
import {budgetDay,candidateRows,claimSupplement,dueSupplementIds,finishSupplement,recoverSupplementTasks,scanSupplementCandidates,supplementLimits,supplementSourceVersion} from './valuation-supplement-queue.js';
import {boundedManualJob,checkedManualDb,manualFetch} from './manual-job-budget.js';
const jobType='VALUATION_SUPPLEMENT';
type Config={windowStartHour:number;windowEndHour:number;apiKey?:string;dailyCallLimit?:number;minDelayMs?:number};
type Options={serviceManual?:()=>Promise<boolean>;load?:NonNullable<Parameters<typeof supplementStoredPeriod>[4]>['load'];clock?:()=>Date;sleep?:(ms:number)=>Promise<void>};
/** Durable, bounded discovery is outside the common financial execution lease. */
export async function runIndependentSupplement(db:PrismaClient,config:Config,now=new Date(),options:Options={}){
 db=collectionClient(db);
 if(process.env.VALUATION_SUPPLEMENT_ENABLED==='false')return {status:'DISABLED'};
 const clock=options.clock??(()=>new Date()),open=(date:Date)=>dartWindowOpen(date,config.windowStartHour,config.windowEndHour,[],true);
 if(!open(now))return {status:'OUTSIDE_WINDOW'};
 const day=budgetDay(now),dayStart=new Date(getSeoulClock(now).dateKey+'T00:00:00+09:00');
 if(!await db.valuationSupplementBudget.findUnique({where:{day}})){
  const legacy=await db.$queryRaw<Array<{used:bigint}>>`SELECT COALESCE(SUM(COALESCE(JSON_EXTRACT(metadata,'$.reservedPeriods'),JSON_EXTRACT(metadata,'$.reservedCalls'),0)),0) AS used FROM collector_runs WHERE job_type=${jobType} AND started_at>=${dayStart}`;
  await db.valuationSupplementBudget.createMany({data:[{day,reserved:Math.min(200,Number(legacy[0]?.used??0))}],skipDuplicates:true});
 }
 const budget=await db.valuationSupplementBudget.findUniqueOrThrow({where:{day}}),repo=new PrismaDartRepository(db),apiUsage=await repo.getDailyUsage(now);
 if(budget.reserved>=200||Boolean(config.apiKey)&&(apiUsage?.apiCallCount??0)>=(config.dailyCallLimit??3000))return {status:'QUOTA_BLOCKED'};
 const scan=await db.valuationSupplementScan.findUnique({where:{id:1},select:{phase:true,updatedAt:true}});
 if(scan?.phase==='QUOTA_BLOCKED'&&getSeoulClock(scan.updatedAt).dateKey===getSeoulClock(now).dateKey)return {status:'QUOTA_BLOCKED'};
 const owner=randomUUID(),deadline=clock().getTime()+supplementLimits.cycleMs;
 let success=0,failed=0,skipped=0,processed=0,scanned=0;
 const runId=(await repo.createRun(jobType,'OPEN_DART_KIS_KRX',{phase:'SUPPLEMENT_SCAN',ownerId:leaseOwnerId(owner),limits:supplementLimits,timezone:'Asia/Seoul'})).id;
 const boundary=async()=>{
  const pending=await db.collectorRun.findFirst({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.manualState',equals:'QUEUED'}},select:{id:true}});
  if(!pending)return false;
  const state=await db.valuationSupplementScan.findUnique({where:{id:1}}),since=state?.lastAutomaticAt??new Date(now.getTime()-600_000);
  const completed=await db.collectorRun.count({where:{jobType:'dart-financial-statements',finishedAt:{gte:since},metadata:{path:'$.phase',equals:'MANUAL'}}});
  if(clock().getTime()-since.getTime()>=600_000&&completed>=3&&await db.valuationSupplementTask.findFirst({where:{status:{in:['PENDING','RETRY']},nextAttemptAt:{lte:clock()}},select:{id:true}})){
   await db.valuationSupplementScan.update({where:{id:1},data:{automaticTurnUntil:new Date(clock().getTime()+690_000),heartbeatAt:clock()}});return false;
  }
  if(options.serviceManual)await options.serviceManual();
  return true;
 };
 try{
  const yielded=await boundary();
  await recoverSupplementTasks(db,clock());
  scanned=await scanSupplementCandidates(db,owner,now,clock);
  if(yielded){await repo.finishRun(runId,'SKIPPED',{success:0,failed:0,skipped:0},undefined,{phase:'YIELDED_TO_MANUAL',scanned});return {status:'YIELDED'};}
  const batch=await dueSupplementIds(db,clock(),Math.min(10,200-budget.reserved)),apiKey=config.apiKey??process.env.DART_API_KEY??'';
  const provider=apiKey?new OpenDartProvider({apiKey,dailyCallLimit:config.dailyCallLimit??3000,minDelayMs:config.minDelayMs??2000,
   reserveCall:limit=>{if(!open(clock()))throw new DartApiError('SCHEDULE_WINDOW_ENDED','Collection window ended.');return repo.reserveApiCall(limit,clock(),owner);},
   isCallAllowed:()=>open(clock()),onApiStatus:code=>repo.recordApiResult(code==='013'?'NO_DATA':'ERROR')}):null;
  for(const key of batch){
   if(clock().getTime()>=deadline||!open(clock())||await boundary())break;
   if(!await repo.acquireLock(owner,90))break;
   let task:Awaited<ReturnType<typeof claimSupplement>>=null;
   let timer:ReturnType<typeof setInterval>|undefined,pulse:Promise<unknown>|null=null;
   try{
    task=await claimSupplement(db,key.id,owner,clock());if(!task)continue;
    processed++;const activeTask=task;
    timer=setInterval(()=>{if(pulse)return;pulse=db.valuationSupplementTask.updateMany({where:{id:activeTask.id,status:'PROCESSING',ownerToken:owner,leaseUntil:{gt:new Date()}},data:{heartbeatAt:new Date(),leaseUntil:new Date(Date.now()+supplementLimits.leaseMs)}}).catch(()=>{}).finally(()=>{pulse=null;});},financialHeartbeatMs);timer.unref();
    await db.valuationSupplementScan.update({where:{id:1},data:{lastAutomaticAt:clock(),automaticTurnUntil:null}});
    const candidate=(await candidateRows(db,[task.filingId],Number(getSeoulClock(clock()).dateKey.slice(0,4))))[0];
    if(!candidate||candidate.unsupported||supplementSourceVersion(candidate)!==task.sourceVersion){
     await finishSupplement(db,task,owner,{status:'UNAVAILABLE',lastError:!candidate?'INPUT_CHANGED_OR_EXCLUDED':candidate.unsupported?'UNSUPPORTED_SOURCE':'INPUT_CHANGED'},clock());skipped++;continue;
    }
    const scoped=checkedManualDb(db);
    await boundedManualJob(()=>withFinancialLease(owner,async()=>{
     const security=await db.security.findUniqueOrThrow({where:{id:task!.securityId},select:{symbol:true,collectionRevision:true,marketType:true,dartCorpMapping:{select:{corpCode:true}}}});
     await withCollection(db,task!.securityId,'valuation',async()=>{
      const where={securityId_fiscalYear_periodType:{securityId:task!.securityId,fiscalYear:task!.fiscalYear,periodType:task!.periodType}};
      const filing=await db.dartFinancialFiling.findFirst({where:{id:task!.filingId}});
      if(!filing)throw new CollectionExcluded('보완 기준 공시 변경','IDENTITY');
      const before=await db.periodValuation.findUnique({where}),saved=(before?.supplemental??{}) as Supplemental;
      if((!candidate.duration_review||fiscalDurationMatches(filing,saved.fiscalDuration))&&valueCompletion((before?.values??{}) as Partial<MetricValues>,financialCurrency(filing)).complete&&sufficientPeriodShares(saved.shares,filing)&&!needsDartAccounts(filing,saved))return;
      const result=await supplementStoredPeriod(scoped,task!.securityId,task!.fiscalYear,task!.periodType,{load:options.load??loadPeriodSupplement(provider,security.symbol,security.dartCorpMapping?.corpCode??'',undefined,security.marketType,'AUTOMATIC',{dartRequests:Boolean(apiKey&&security.dartCorpMapping),fetcher:manualFetch})});
      if(!result)return;
      const supplement=(result.supplemental??{}) as Supplemental,complete=valueCompletion(result.values as Partial<MetricValues>,financialCurrency(filing)).complete;
      const projected=supplementedFilings([filing],[{securityId:filing.securityId,fiscalYear:filing.fiscalYear,periodType:filing.periodType,supplemental:supplement as Prisma.JsonObject}])[0]!;
      const financialComplete=[projected.revenueYtd,projected.operatingProfitYtd,projected.netIncomeYtd,projected.totalAssets,projected.totalLiabilities,projected.totalEquity].every(value=>value!=null);
      const nextAttemptAt=complete&&sufficientPeriodShares(supplement.shares,filing)&&!needsDartAccounts(filing,supplement)?null:new Date(clock().getTime()+supplementLimits.retryMs);
      await scoped.periodValuation.update({where,data:{nextAttemptAt,supplemental:JSON.parse(JSON.stringify({...supplement,...(complete||JSON.stringify(before?.values)!==JSON.stringify(result.values)?{verifiedAt:clock().toISOString()}:{}),automaticAttempt:{at:clock().toISOString(),status:complete?'SUCCESS':'PARTIAL',state:financialComplete?(complete?'COMPLETE':'FINANCIAL_ONLY'):'FINAL_FAILED',provider:'OPEN_DART_KIS_KRX'}})) as Prisma.InputJsonValue}});
     },{symbol:candidate.symbol,collectionRevision:candidate.collection_revision});
    },activeTask.id),Math.max(1,Math.min(120_000,deadline-clock().getTime())));
    const after=await db.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:task.securityId,fiscalYear:task.fiscalYear,periodType:task.periodType}}});
    const filing=await db.dartFinancialFiling.findFirst({where:{id:task.filingId}}),saved=(after?.supplemental??{}) as Supplemental;
    const complete=Boolean(filing&&(!(filing.sourceValidation as {periodResolution?:unknown}|null)?.periodResolution||fiscalDurationMatches(filing,saved.fiscalDuration))&&valueCompletion((after?.values??{}) as Partial<MetricValues>,financialCurrency(filing??undefined)).complete&&sufficientPeriodShares(saved.shares,filing)&&!needsDartAccounts(filing,saved));
    const permanent=!['AUTH','PERMISSION','PARSE','COMMUNICATION','RATE_LIMIT','PROVIDER'].includes(saved.errors?.priceCategory??'')&&!Object.values(saved.errors??{}).some(code=>/COMMUNICATION|HTTP|TIMEOUT|AUTH|RATE|LIMIT|NETWORK|PROVIDER_ERROR|SERVER_ERROR/.test(code)),unavailable=!complete&&permanent&&task.attempts>=3;
    await withFinancialLease(owner,()=>finishSupplement(db,task!,owner,{status:complete?'COMPLETE':unavailable?'UNAVAILABLE':'RETRY',lastError:complete?null:unavailable?'SOURCE_NOT_PROVIDED':'SOURCE_INCOMPLETE',valuationAt:after?.updatedAt??null,nextAttemptAt:new Date(clock().getTime()+supplementLimits.retryMs),diagnostics:{missing:Object.entries(after?.values??{}).filter(([,v])=>v===null).map(([k])=>k),nonApplicable:valueCompletion((after?.values??{}) as Partial<MetricValues>,financialCurrency(filing??undefined)).notApplicable}},clock()));
    complete?success++:skipped++;
   }catch(error){
    if(error instanceof FinancialLeaseLost)throw error;
    const diagnostic=dartDiagnostic(error,'VALUATION_SUPPLEMENT');
    if(!(error instanceof CollectionExcluded))console.warn(JSON.stringify({event:'valuation_supplement_failure',runId:String(runId),taskId:task?String(task.id):null,fiscalYear:task?.fiscalYear,period:task?.periodType,...diagnostic}));
    if(task){
     if(!(error instanceof CollectionExcluded))await withFinancialLease(owner,()=>db.periodValuation.updateMany({where:{securityId:task!.securityId,fiscalYear:task!.fiscalYear,periodType:task!.periodType},data:{nextAttemptAt:new Date(clock().getTime()+supplementLimits.retryMs)}}),task.id);
     const existing=await db.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:task.securityId,fiscalYear:task.fiscalYear,periodType:task.periodType}},select:{updatedAt:true}});
     await finishSupplement(db,task,owner,{status:error instanceof CollectionExcluded?'UNAVAILABLE':'RETRY',lastError:error instanceof CollectionExcluded?'COLLECTION_EXCLUDED':diagnostic.code,valuationAt:existing?.updatedAt??null,diagnostics:diagnostic as unknown as Prisma.InputJsonValue,nextAttemptAt:new Date(clock().getTime()+supplementLimits.retryMs)},clock());
    }
    if(error instanceof CollectionExcluded)skipped++;else failed++;
    if(error instanceof DartApiError&&(error.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(error.code))){if(error.quotaExceeded||error.code==='DAILY_CALL_LIMIT')await db.valuationSupplementScan.update({where:{id:1},data:{phase:'QUOTA_BLOCKED'}});break;}
   }finally{if(timer)clearInterval(timer);await pulse;await repo.releaseLock(owner);}
   await (options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(Math.max(2000,config.minDelayMs??2000));
  }
  await repo.finishRun(runId,failed?'PARTIAL':'SUCCESS',{success,failed,skipped},undefined,{phase:'INDEPENDENT_SUPPLEMENT',processed,scanned});
  return {status:processed?failed?'PARTIAL':'SUCCESS':'IDLE',success,failed,skipped,processed,scanned};
 }catch(error){await repo.finishRun(runId,'FAILED',{success,failed:failed+1,skipped},dartDiagnostic(error,'SUPPLEMENT_RUN').code);throw error;}
 finally{if(processed||!open(clock()))await db.valuationSupplementScan.updateMany({where:{id:1,automaticTurnUntil:{not:null}},data:{automaticTurnUntil:null}});}
}
