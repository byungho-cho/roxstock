import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {prisma} from '@roxstock/shared/lib/prisma';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {withCollection,eligibleWhere} from '@roxstock/shared/collection/collection-policy';
import {withFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {reconcileForeignSourceReports} from '@roxstock/shared/collection/foreign-source-reports';
import {dartDiagnostic} from '@roxstock/shared/collection/dart-diagnostics';
import {loadCollectorConfig} from '@roxstock/shared/collection/config';
import {financialCurrency} from '@roxstock/shared/domain/financial-currency';
import {PrismaDartRepository} from '../dart-repository.js';
import {DartApiError,OpenDartProvider,type DartReportCode} from '../dart-provider.js';
import {getCfsThenOfs} from '../dart-collector.js';
import {requireDartReportPeriod,validateDartFiling} from '../dart-filing-validation.js';
import {normalizeManualDartAccounts} from '../manual-dart-accounts.js';
import {supplementStoredPeriod,loadPeriodSupplement} from '../valuation-supplement.js';

const json=(v:unknown)=>JSON.parse(JSON.stringify(v,(_,v)=>typeof v==='bigint'?String(v):v)) as Prisma.InputJsonValue;
export const foreignTaskWhere={status:'FAILED',errorCode:'REVIEW_REQUIRED',diagnostics:{path:'$.validationResult',equals:'NON_KRW_STORAGE_UNSUPPORTED'}} as const;
/** Keyset pages, serial requests and shared lease. Only this exact old storage reason is eligible. */
export async function recoverForeignFinancials(client:PrismaClient,options:{apply:boolean;maxPeriods:number;maxCalls:number;after?:bigint}){
 const db=collectionClient(client),repo=new PrismaDartRepository(db),config=loadCollectorConfig(),owner=randomUUID();
 let cursor=options.after??0n,calls=0,stored=0,held=0,failed=0,processed=0,runId:bigint|undefined;
 const summary={policy:'native-currency-v1',applied:options.apply,before:await db.dartBackfillTask.count({where:foreignTaskWhere}),stored:0,held:0,failed:0,metricsReady:0,conversionRequired:0,calls:0,processed:0,cursor:String(cursor),remaining:0,stopReason:null as string|null};
 const deadline=Date.now()+20*60_000;
 const pendingManual=()=>db.collectorRun.findFirst({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.manualState',equals:'QUEUED'}},select:{id:true}});
 const provider=new OpenDartProvider({apiKey:process.env.DART_API_KEY?.trim()||'UNCONFIGURED',dailyCallLimit:config.dartBackfillDailyCallLimit,minDelayMs:Math.max(config.dartMinDelayMs,config.dartBackfillMinDelayMs),reserveCall:async limit=>{
  if(Date.now()>deadline||calls>=options.maxCalls||await pendingManual())throw new DartApiError('BOUNDED_RECOVERY_YIELD','Recovery yielded to manual request/budget.',false,true);
  if(!await repo.reserveApiCall(limit,new Date(),owner))return false;calls++;return true;
 },onApiStatus:code=>repo.recordApiResult(code==='013'?'NO_DATA':'ERROR')});
 try{
  if(options.apply){
   if(!config.dartEnabled||!process.env.DART_API_KEY?.trim())throw new DartApiError('API_KEY_MISSING','DART configuration required.');
   runId=(await db.collectorRun.create({data:{jobType:'foreign-currency-recovery',provider:'OPEN_DART',status:'RUNNING',metadata:json(summary)}})).id;
  }
  while(processed<options.maxPeriods&&Date.now()<deadline){
   const page=await db.dartBackfillTask.findMany({where:{...foreignTaskWhere,id:{gt:cursor}},orderBy:{id:'asc'},take:Math.min(10,options.maxPeriods-processed),include:{security:{include:{dartCorpMapping:true}}}});
   if(!page.length)break;
   for(const task of page){
    if(await pendingManual()){summary.stopReason='MANUAL_REQUEST_PRIORITY';break;}
    if(options.apply&&!await repo.acquireLock(owner,180)){summary.stopReason='SHARED_LOCK_BUSY';break;}
    try{await withFinancialLease(owner,async()=>{
     const security=task.security,mapping=security.dartCorpMapping;
     const active=await db.security.findFirst({where:{id:task.securityId,...eligibleWhere('dart-financial-statements'),isActive:true,securityType:'STOCK'}});
     processed++;cursor=task.id;
     if(!active||!mapping||mapping.collectionSymbol!==security.symbol&&!(security.codeRevision===0&&mapping.collectionSymbol==null)){
      held++;if(runId)await db.collectorRunItem.create({data:{runId,securityId:security.id,symbol:security.symbol+':'+task.fiscalYear+':'+task.periodType,status:'SKIPPED',message:'EXCLUDED_INACTIVE_OR_CHANGED_CODE',diagnostics:json({taskId:task.id,previous:task.diagnostics})}});return;
     }
     if(!options.apply)return;
     await withCollection(db,security.id,'dart-financial-statements',async()=>{
      const report=(await provider.listPeriodicReports(mapping.corpCode,task.fiscalYear)).find(r=>r.reportCode===task.reportCode&&!r.withdrawn);
      if(!report)throw new DartApiError('DART_SOURCE_REVIEW','Current disclosure absent.',false,false,{validationResult:'CURRENT_DISCLOSURE_MISSING'});
      requireDartReportPeriod(report,mapping.corpCode,task.fiscalYear);
      const response=await getCfsThenOfs(provider,mapping.corpCode,task.fiscalYear,task.reportCode as DartReportCode,report);
      const source=response.source??validateDartFiling({corpCode:mapping.corpCode,taskFiscalYear:task.fiscalYear,report,rows:response.rows,fsDivision:response.division});
      const values=normalizeManualDartAccounts(response.rows,source.periodEndDate);
      if(![values.revenueYtd,values.netIncomeYtd,values.totalEquity].some(v=>v!=null))throw new DartApiError('DART_SOURCE_REVIEW','No core original amount.',false,false,{validationResult:'FINANCIAL_VALUES_EMPTY'});
      await db.$transaction(async tx=>{
       await new PrismaDartRepository(tx as unknown as PrismaClient).saveFiling({securityId:security.id,fiscalYear:task.fiscalYear,periodType:report.periodType,reportCode:task.reportCode as DartReportCode,fsDivision:response.division,...source,collectedAt:new Date(),values});
       const changed=await tx.dartBackfillTask.updateMany({where:{...foreignTaskWhere,id:task.id,attempts:task.attempts},data:{status:'SUCCESS',attempts:{increment:1},processedAt:new Date(),lastAttemptAt:new Date(),selectedReceiptNo:source.sourceValidation.selectedReceiptNo,errorCode:null,errorMessage:null,nextAttemptAt:null,diagnostics:json({...source.sourceValidation,recoveryPolicy:'native-currency-v1',previousReview:task.diagnostics})}});
       if(changed.count!==1)throw new DartApiError('TASK_CHANGED','Task changed; source transaction rolled back.');
      });
      stored++;const foreign=source.sourceValidation.currency!=='KRW';if(foreign)summary.conversionRequired++;
      await db.collectorRunItem.create({data:{runId:runId!,securityId:security.id,symbol:security.symbol+':'+task.fiscalYear+':'+task.periodType,status:'SUCCESS',message:foreign?'SOURCE_STORED_CONVERSION_REQUIRED':'SOURCE_STORED',diagnostics:json({...source.sourceValidation,previousReview:task.diagnostics})}});
     },security);
     // Calculation failure never changes source-storage success or its history.
     try{
      const result=await supplementStoredPeriod(db,security.id,task.fiscalYear,task.periodType,{load:loadPeriodSupplement(provider,security.symbol,mapping.corpCode,undefined,security.marketType,'AUTOMATIC')});
      if(result?.status==='SUCCESS')summary.metricsReady++;
     }catch(error){await db.collectorRunItem.create({data:{runId:runId!,securityId:security.id,symbol:security.symbol+':'+task.fiscalYear+':'+task.periodType,status:'SKIPPED',message:'SOURCE_STORED_METRIC_PENDING',diagnostics:json(dartDiagnostic(error,'METRIC_RECOVERY'))}});}
    });}catch(error){
     const diagnostic=dartDiagnostic(error,'FOREIGN_SOURCE_RECOVERY');
     if(error instanceof DartApiError&&error.quotaExceeded){summary.stopReason=error.code;break;}
     if(diagnostic.code==='DART_SOURCE_REVIEW')held++;else failed++;
     if(runId)await db.collectorRunItem.create({data:{runId,securityId:task.securityId,symbol:task.security.symbol+':'+task.fiscalYear+':'+task.periodType,status:'FAILED',message:diagnostic.code,diagnostics:json({...diagnostic.context,...diagnostic,previousReview:task.diagnostics})}});
    }finally{if(options.apply)await repo.releaseLock(owner);}
    if(summary.stopReason)break;
   }
   if(summary.stopReason)break;
  }
  if(options.apply){let after:string|undefined;for(let page=0;page<40;page++){const r=await reconcileForeignSourceReports(db,after);if(!r.hasNext)break;after=r.cursor;}}
 }finally{
  Object.assign(summary,{stored,held,failed,processed,calls,cursor:String(cursor),remaining:await db.dartBackfillTask.count({where:foreignTaskWhere})});
  if(runId)await db.collectorRun.update({where:{id:runId},data:{status:failed||held?'PARTIAL':'SUCCESS',successCount:stored,failureCount:failed,skippedCount:held,finishedAt:new Date(),metadata:json(summary)}});
 }
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const flag=(name:string,fallback:number,max:number)=>{const v=Number(process.argv.find(a=>a.startsWith(name+'='))?.split('=')[1]??fallback);if(!Number.isSafeInteger(v)||v<1||v>max)throw Error('Invalid '+name);return v;};
 try{console.log(JSON.stringify(await recoverForeignFinancials(prisma,{apply:process.argv.includes('--apply'),maxPeriods:flag('--max-periods',10,500),maxCalls:flag('--max-calls',100,2000),after:BigInt(process.argv.find(a=>a.startsWith('--after='))?.split('=')[1]??'0')})));}
 finally{await prisma.$disconnect();}
}
