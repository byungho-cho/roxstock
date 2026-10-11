import {randomUUID} from 'node:crypto';
import {PrismaClient,Prisma} from '../generated/prisma/index.js';
import {PrismaDartRepository} from '../collector/dart-repository.js';
import {OpenDartProvider,DartApiError,normalizeDartFinancialRows,type DartReportCode} from '../collector/dart-provider.js';
import {getCfsThenOfs} from '../collector/dart-collector.js';
import {validateDartFiling,requireDartReportPeriod} from '../collector/dart-filing-validation.js';
import {auditDartReceipts} from '../collector/dart-receipt-audit.js';
import {dartDiagnostic,safeDartContext} from '../collector/dart-diagnostics.js';
import {retryDecision} from '../collector/dart-policy.js';
import {loadCollectorConfig} from '../collector/config.js';
const db=new PrismaClient(),repo=new PrismaDartRepository(db),owner=randomUUID();
const version='DART_SOURCE_V2',maxCalls=12;
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const emit=(event:string,value:unknown)=>console.log(JSON.stringify({event,data:value},(_k,v)=>typeof v==='bigint'?String(v):v));
let locked=false,calls=0,runId:bigint|undefined;
try {
 const mode=process.argv[2]??'audit';
 if(!['audit','representative'].includes(mode))throw new DartApiError('INVALID_MODE','Audit or representative mode required');
 const baseline=await auditDartReceipts(db);emit('DART receipt read-only audit',baseline);
 if(mode==='representative'){
  if(process.env.DART_RECEIPT_RETRY_ALLOWED!==version)throw new DartApiError('RETRY_NOT_AUTHORIZED','Explicit bounded representative execution required');
  locked=await repo.acquireLock(owner,900);if(!locked)throw new DartApiError('COLLECTOR_BUSY','Wait for active collector');
  const previous=await db.collectorRun.findFirst({where:{jobType:'dart-receipt-verification',metadata:{path:'$.version',equals:version}}});
  if(previous){emit('DART representative already attempted',{runId:String(previous.id),status:previous.status,calls:0});}
  else{
   const config=loadCollectorConfig(),limit=config.dartBackfillDailyCallLimit;
   const usage=await repo.getDailyUsage();
   if((usage?.apiCallCount??0)+maxCalls>limit)throw new DartApiError('DAILY_CALL_LIMIT','Representative budget unavailable',false,true);
   runId=(await db.collectorRun.create({data:{jobType:'dart-receipt-verification',provider:'OPEN_DART',status:'RUNNING',metadata:{version,maxCalls,dryRunAt:baseline.observedAt,priorUsage:usage?.apiCallCount??0,externalAccountUsage:'UNKNOWN'}}})).id;
   const provider=new OpenDartProvider({apiKey:process.env.DART_API_KEY?.trim()??'',dailyCallLimit:limit,minDelayMs:Math.max(config.dartBackfillMinDelayMs,config.dartMinDelayMs),
    reserveCall:async l=>{if(calls>=maxCalls)throw new DartApiError('REPRESENTATIVE_CALL_LIMIT','Bounded request limit reached',false,true);if(!await repo.reserveApiCall(l,new Date(),owner))return false;calls++;return true;},
    onApiStatus:status=>repo.recordApiResult(status==='013'?'NO_DATA':'ERROR')});
   const results:Array<Record<string,unknown>>=[];let stopped=false;
   for(const symbol of ['900290','000120','005930']){
    const security=await db.security.findFirst({where:{symbol,isActive:true},include:{dartCorpMapping:true}});
    if(!security?.dartCorpMapping){results.push({symbol,code:'DART_CORP_CODE_NOT_MAPPED'});continue;}
    const corpCode=security.dartCorpMapping.corpCode;
    let reports;
    try{reports=await provider.listPeriodicReports(corpCode,2024);}catch(e){results.push({symbol,...dartDiagnostic(e,'LIST')});if(e instanceof DartApiError&&(e.quotaExceeded||['010','011','012','API_KEY_MISSING'].includes(e.code)))break;continue;}
    for(const reportCode of (symbol==='900290'?['11011','11013','11012','11014']:['11011']) as DartReportCode[]){
     const task=await db.dartBackfillTask.findUnique({where:{securityId_fiscalYear_reportCode:{securityId:security.id,fiscalYear:2024,reportCode}}});
     const periodType=reportCode==='11011'?'ANNUAL':reportCode==='11013'?'Q1':reportCode==='11012'?'Q2':'Q3';
     const eligible=task?.status==='FAILED'&&(task.errorCode==='RECEIPT_MISMATCH'||task.errorCode==='REVIEW_REQUIRED'&&(/^RECEIPT_MISMATCH:/.test(task.errorMessage??'')||(task.diagnostics as {originalCode?:string}|null)?.originalCode==='RECEIPT_MISMATCH'))&&((symbol==='900290'&&reportCode==='11012')||(symbol==='000120'&&reportCode==='11011'));
     let result:Record<string,unknown>={symbol,corpCode,taskFiscalYear:2024,apiFiscalYear:2024,reportCode,retryEligible:eligible,beforeStatus:task?.status,beforeAttempt:task?.attempts};
     if(eligible&&task){
      const originalCode=task.errorCode==='REVIEW_REQUIRED'?(/^([A-Z0-9_]+):/.exec(task.errorMessage??'')?.[1]??'UNKNOWN'):task.errorCode;
      await repo.addRunItem(runId,{id:security.id,symbol,securityType:security.securityType,corpCode},{...task,reportCode,periodType},'FAILED','Prior error preserved before limited verification',json({...safeDartContext(task.diagnostics),originalCode,attempt:task.attempts,runId:String(runId)}));
     }
     try{
      const report=reports.find(r=>r.reportCode===reportCode);if(!report)throw new DartApiError('NO_PERIODIC_FILING','No candidate disclosure');
      requireDartReportPeriod(report,corpCode,2024);
      const response=await getCfsThenOfs(provider,corpCode,2024,reportCode);
      const verified=validateDartFiling({corpCode,taskFiscalYear:2024,report,rows:response.rows,fsDivision:response.division});
      result={...result,source:verified.sourceValidation,validation:'VERIFIED',stored:false};
      if(eligible&&task){
       // Shared lock excludes workers; transaction couples filing and task success without clearing other work.
       const saved=await db.$transaction(async tx=>{
        const filing=await new PrismaDartRepository(tx as unknown as PrismaClient).saveFiling({securityId:security.id,fiscalYear:2024,periodType:report.periodType,reportCode,fsDivision:response.division,...verified,collectedAt:new Date(),values:normalizeDartFinancialRows(response.rows)});
        const changed=await tx.dartBackfillTask.updateMany({where:{id:task.id,status:'FAILED',attempts:task.attempts},data:{status:'SUCCESS',attempts:task.attempts+1,selectedReceiptNo:report.receiptNo,processedAt:new Date(),lastAttemptAt:new Date(),nextAttemptAt:null,errorCode:null,errorMessage:null,diagnostics:json(verified.sourceValidation)}});
        if(changed.count!==1)throw new DartApiError('TASK_CHANGED','Representative task changed; rolling back');
        return filing;
       });
       result={...result,stored:true,created:saved.created};
       await repo.addRunItem(runId,{id:security.id,symbol,securityType:security.securityType,corpCode},{...task,reportCode,periodType:report.periodType},'SUCCESS','Bounded representative source validated',json(verified.sourceValidation));
      }
     }catch(e){
      const diagnostic=dartDiagnostic(e,'REPRESENTATIVE_VERIFY');
      result={...result,...diagnostic,stored:false};
      if(e instanceof DartApiError&&(e.quotaExceeded||['010','011','012','API_KEY_MISSING'].includes(e.code)))stopped=true;
      if(eligible&&task){
       // No financial write. Only these two authorized attempted tasks receive a classified failure.
       const retry=retryDecision(diagnostic.code,task.attempts+1,new Date());
       const detail={...diagnostic.context,originalCode:diagnostic.code,attempt:task.attempts+1,runId:String(runId),stage:'REPRESENTATIVE_VERIFY',symbol,corpCode};
       if(!(e instanceof DartApiError&&e.quotaExceeded))await db.dartBackfillTask.updateMany({where:{id:task.id,status:'FAILED',attempts:task.attempts},data:{attempts:task.attempts+1,errorCode:retry.code,errorMessage:`${diagnostic.code}: 검증된 출처 또는 기간 확인이 필요합니다.`,diagnostics:json(detail),lastAttemptAt:new Date(),nextAttemptAt:retry.nextAttemptAt}});
       await repo.addRunItem(runId,{id:security.id,symbol,securityType:security.securityType,corpCode},{...task,reportCode,periodType},'FAILED',diagnostic.code,json(detail));
      }
     }
     results.push(result);emit('DART representative result',result);
     if(stopped)break;
    }
    if(stopped)break;
   }
   await repo.finishRun(runId,results.some(r=>r.code)?'PARTIAL':'SUCCESS',{success:results.filter(r=>r.validation==='VERIFIED').length,failed:results.filter(r=>r.code).length,skipped:results.filter(r=>r.validation==='VERIFIED'&&!r.stored).length},undefined,{version,calls,maxCalls,results,completedAt:new Date().toISOString(),allFailuresResolved:false});
   emit('DART representative summary',{runId:String(runId),calls,maxCalls,results});
   emit('DART receipt post-verification audit',await auditDartReceipts(db));
  }
 }
}catch(error){emit('DART verification stopped',{calls,...dartDiagnostic(error,'REPRESENTATIVE_VERIFY')});if(runId)await repo.finishRun(runId,'FAILED',{success:0,failed:1,skipped:0},dartDiagnostic(error,'REPRESENTATIVE_VERIFY').code,{version,calls,maxCalls,allFailuresResolved:false});process.exitCode=1;}
finally{if(locked)try{await repo.releaseLock(owner);}catch(e){emit('DART verification lock release failed',dartDiagnostic(e,'LOCK_RELEASE'));process.exitCode=1;}await db.$disconnect();}
