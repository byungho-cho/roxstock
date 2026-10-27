import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {annualSupplement} from '@roxstock/shared/domain/kis-annual-supplement';
import {kisAnnualFundamentals} from './kis-annual.js';
import {randomUUID} from 'node:crypto';
import {type PrismaClient,Prisma} from '@roxstock/shared/prisma';
import {withFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {withCollection,CollectionExcluded,exclusionReason} from '@roxstock/shared/collection/collection-policy';
import {objectValue} from '@roxstock/shared/domain/security-data';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import {financialCurrency} from '@roxstock/shared/domain/financial-currency';
import {OpenDartProvider,DartApiError,normalizeDartFinancialRows} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import {getCfsThenOfs} from './dart-collector.js';
import {requireDartReportPeriod} from './dart-filing-validation.js';
import {loadPeriodSupplement,supplementStoredPeriod} from './valuation-supplement.js';
import {NaverAnnualProvider} from './naver-annual.js';
const positiveInt=(v:string|undefined,fallback:number,min:number,max:number)=>{const n=Number(v??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('INVALID_SECURITY_DATA_CONFIG');return n;};
export const securityDataConfig=()=>({enabled:process.env.SECURITY_DATA_COLLECTION_ENABLED==='true',intervalMs:positiveInt(process.env.SECURITY_DATA_INTERVAL_MINUTES,60,15,1440)*60000,retryMs:positiveInt(process.env.SECURITY_DATA_RETRY_MINUTES,60,5,1440)*60000,maxAttempts:positiveInt(process.env.SECURITY_DATA_MAX_ATTEMPTS,3,1,10),batch:positiveInt(process.env.SECURITY_DATA_BATCH_SIZE,20,1,100)});
const day=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(d).replaceAll('-','');
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
/** Discovery and processing have separate durable state. Lease fences every financial write. */
export async function runSecurityDataCollection(db:PrismaClient,config:{apiKey:string;dailyCallLimit:number;minDelayMs:number;corpRefreshHours:number},now=new Date()){
 db=collectionClient(db);
 const policy=securityDataConfig();if(!policy.enabled)return {status:'DISABLED'};
 if(!config.apiKey)return {status:'NOT_CONFIGURED'};
 const repo=new PrismaDartRepository(db),owner=randomUUID();
 const usage=await repo.getDailyUsage(now);if((usage?.apiCallCount??0)>=config.dailyCallLimit)return {status:'QUOTA_BLOCKED'};if(!await repo.acquireLock(owner,900))return {status:'LOCKED'};
 let runId:bigint|undefined,discovering=false;
 try{return await withFinancialLease(owner,async()=>{
  const provider=new OpenDartProvider({apiKey:config.apiKey,dailyCallLimit:config.dailyCallLimit,minDelayMs:config.minDelayMs,reserveCall:async limit=>{await db.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 900 SECOND) WHERE job_name='dart-financial-statements' AND owner_token=${owner} AND locked_until>UTC_TIMESTAMP(3)`;return repo.reserveApiCall(limit,new Date(),owner);},onApiStatus:code=>repo.recordApiResult(code==='013'?'NO_DATA':'ERROR')});
  const initial=day(new Date(now.getTime()-89*86400000));
  await db.securityDataCursor.upsert({where:{id:1},create:{id:1,coverageFrom:initial,fromDate:initial,throughDate:day(now),page:1,nextCheckAt:now},update:{}});
  let cursor=await db.securityDataCursor.findUniqueOrThrow({where:{id:1}});
  const due=await db.securityDataReceipt.count({where:{status:{in:['PENDING','RETRY','PROCESSING']},nextAttemptAt:{lte:now}}});
  if(cursor.failures>=policy.maxAttempts&&!due)return {status:'REVIEW_REQUIRED'};
  if(cursor.nextCheckAt>now&&!due)return {status:'IDLE'};
  await db.collectorRun.updateMany({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.phase',equals:'SECURITY_DATA'}},data:{status:'PARTIAL',finishedAt:now,failureReason:'중간 종료 후 대기열에서 복구됨'}});
  runId=(await repo.createRun('dart-financial-statements','OPEN_DART_KRX_KIS',{phase:'SECURITY_DATA',historicalBackfill:false})).id;
  // Recover only this inbox. Never reset/reopen historical tasks or supplement queues.
  await db.securityDataReceipt.updateMany({where:{status:'PROCESSING',attempts:{gte:policy.maxAttempts}},data:{status:'UNRESOLVED',result:json({outcome:'UNRESOLVED',reason:'재시도 한도에서 중간 종료 · 저장 근거 검토 필요'})}});
  await db.securityDataReceipt.updateMany({where:{status:'PROCESSING',attempts:{lt:policy.maxAttempts}},data:{status:'RETRY'}});
  const mapAt=await repo.corpCodeMappingsSyncedAt();
  if(!mapAt||now.getTime()-mapAt.getTime()>config.corpRefreshHours*3600000)await repo.syncCorporations(await provider.fetchCorporations(),now);
  if(cursor.nextCheckAt<=now&&cursor.failures<policy.maxAttempts){
   discovering=true;
   for(let pageCount=0;pageCount<10;pageCount++){
    const response=await provider.listPeriodicPage(cursor.fromDate,cursor.throughDate,cursor.page),finished=cursor.page>=response.totalPages;
    const mapped=new Set((await db.dartCorpMapping.findMany({where:{corpCode:{in:response.rows.map(r=>r.corp_code!)}},select:{corpCode:true}})).map(r=>r.corpCode));
    const relevant=response.rows.filter(r=>mapped.has(r.corp_code!)&&/(사업|반기|분기)보고서/.test(r.report_nm??''));
    // Receipt inserts and page/checkpoint advance are one transaction. Failure replays the page.
    cursor=await db.$transaction(async tx=>{
     await tx.securityDataReceipt.createMany({data:relevant.map(raw=>({receiptNo:raw.rcept_no!,corpCode:raw.corp_code!,disclosedDate:raw.rcept_dt!,report:json(raw),nextAttemptAt:now})),skipDuplicates:true});
     return tx.securityDataCursor.update({where:{id:1},data:finished?{fromDate:day(new Date(Date.parse(cursor.throughDate.slice(0,4)+'-'+cursor.throughDate.slice(4,6)+'-'+cursor.throughDate.slice(6,8)+'T00:00:00+09:00')-2*86400000)),throughDate:day(now),page:1,failures:0,lastCompletedAt:now,nextCheckAt:new Date(now.getTime()+policy.intervalMs)}:{page:{increment:1},failures:0,nextCheckAt:now}});
    });if(finished)break;
   }
  }
  discovering=false;
  const fetchedTasks=await db.securityDataReceipt.findMany({where:{status:{in:['PENDING','RETRY']},nextAttemptAt:{lte:now}},orderBy:[{disclosedDate:'desc'},{receiptNo:'desc'}],take:policy.batch});
  const unique=new Map<string,typeof fetchedTasks[number]>();
  for(const task of fetchedTasks){const name=String(objectValue(task.report).report_nm??''),key=task.corpCode+':'+name.replace(/\[.*?\]/g,'').replace(/\s+/g,'');
   if(unique.has(key))await db.securityDataReceipt.update({where:{receiptNo:task.receiptNo},data:{status:'SKIPPED',result:json({outcome:'SKIPPED',reason:'동일 실행의 고유 보고기간 중복',duplicateOf:unique.get(key)!.receiptNo})}});else unique.set(key,task);
  }
  const tasks=[...unique.values()];
  const counts={target:tasks.length,success:0,failed:0,skipped:0,unresolved:0,pending:tasks.length,processing:0};
  const metadata=()=>json({phase:'SECURITY_DATA',historicalBackfill:false,counts,discoveryCompletedAt:cursor.lastCompletedAt?.toISOString()??null});
  const naver=new NaverAnnualProvider();
  for(const task of tasks){
   if(Date.now()-now.getTime()>600000)break;
   let financialSaved=false;
   let outcome:'SUCCESS'|'FAILED'|'SKIPPED'|'UNRESOLVED'='UNRESOLVED',reason='',sid:bigint|undefined,symbol=task.corpCode,year:number|undefined,period:string|undefined;
   await db.securityDataReceipt.update({where:{receiptNo:task.receiptNo},data:{status:'PROCESSING',attempts:{increment:1}}});
   counts.pending--;counts.processing=1;await db.collectorRun.update({where:{id:runId},data:{metadata:metadata()}});
   try{
    const security=await db.security.findFirst({where:{dartCorpMapping:{corpCode:task.corpCode}},include:{dartCorpMapping:true}});
    if(!security||!security.isActive||exclusionReason(security,'dart-financial-statements')){outcome='SKIPPED';reason='종목 미등록 또는 수집 제외';}
    else{
     sid=security.id;symbol=security.symbol;
     const name=String(objectValue(task.report).report_nm??''),match=name.match(/\((\d{4})\.(\d{2})\)/);
     if(!match||!/(사업|반기|분기)보고서/.test(name)){outcome='SKIPPED';reason='정기 보고자료 아님';}
     else{
      year=Number(match[1]);
      await withCollection(db,security.id,'dart-financial-statements',async()=>{
       const reports=await provider.listPeriodicReports(task.corpCode,year!);
       const report=reports.find(r=>r.receiptNo===task.receiptNo);
       if(!report){const newer=reports.find(r=>r.reportName.replace(/\[.*?\]/g,'').trim()===name.replace(/\[.*?\]/g,'').trim()&&r.receiptNo>task.receiptNo);if(newer&&await db.securityDataReceipt.findUnique({where:{receiptNo:newer.receiptNo}})){outcome='SKIPPED';reason='동일 기간 후속 공시가 대기열에 보존됨';return;}reason='접수번호·정정 관계 검토 필요';return;}
       if(report.withdrawn){outcome='SKIPPED';reason='철회 공시';return;}
       period=report.periodType;requireDartReportPeriod(report,task.corpCode,year!);
       const fetched=await getCfsThenOfs(provider,task.corpCode,year!,report.reportCode,report);
       if(!fetched.rows.length){reason='정상적인 재무 원천 자료 미제공';return;}
       if(!fetched.source)throw new DartApiError('DART_SOURCE_REVIEW','검증된 공시 원천 필요');
       await repo.saveFiling({securityId:security.id,fiscalYear:year!,periodType:report.periodType,reportCode:report.reportCode,fsDivision:fetched.division,...fetched.source,collectedAt:new Date(),values:normalizeDartFinancialRows(fetched.rows)});financialSaved=true;
       if(exclusionReason(security,'valuation')){outcome='SKIPPED';reason='재무 저장 완료 · 가치지표 수집 제외';return;}
       await withCollection(db,security.id,'valuation',async()=>{
        const load=loadPeriodSupplement(provider,symbol,task.corpCode,undefined,security.marketType);
        const where={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year!,periodType:period!}},stored=await db.periodValuation.findUnique({where}),filing=await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo:fetched.source!.receiptNo}});
        const supplement=await load(filing,objectValue(stored?.supplemental));
        const oldProvenance=objectValue(stored?.provenance),oldValues=objectValue(stored?.values);
        const provenance={...oldProvenance,receiptNo:filing.receiptNo,fsDivision:filing.fsDivision,periodEnd:filing.periodEndDate.toISOString().slice(0,10),perMetric:{...Object.fromEntries(Object.keys(oldValues).filter(k=>oldValues[k]!=null).map(k=>[k,objectValue(oldProvenance.perMetric)[k]??oldProvenance]))}};
        const base={values:oldValues,provenance,reasons:stored?.reasons??{},supplemental:supplement};
        await db.periodValuation.upsert({where,create:{securityId:security.id,fiscalYear:year!,periodType:period!,status:'PARTIAL',...base},update:base});
        if(period==='ANNUAL'&&!valueCompletion(oldValues).complete){
         const direct=annualSupplement({...base,fiscalYear:year!,periodType:period},await kisAnnualFundamentals(symbol),await db.dartFinancialFiling.findMany({where:{securityId:security.id,fiscalYear:{in:[year!,year!-1]},isWithdrawn:false},orderBy:{receiptDate:'desc'}}));
         if(direct.changed&&'data' in direct)await db.periodValuation.update({where,data:json(direct.data) as any});
        }
        const metric=await supplementStoredPeriod(db,security.id,year!,period!,{fillOnly:true});
        // Crawl only final annual, exact fiscal year/division, and only still-empty fields.
        if(report.periodType==='ANNUAL'&&!valueCompletion(objectValue(metric?.values)).complete){
         const candidate=(await naver.annual(symbol)).find(r=>r.fiscalYear===year&&r.kind==='FINAL_ANNUAL'&&r.division===fetched.division);
         if(candidate&&objectValue(objectValue(metric?.supplemental).shares).preferred===false&&['totalAssets','totalLiabilities','totalEquity','netIncome'].every(k=>{const dartKey=k==='netIncome'?'netIncomeYtd':k;const actual=objectValue(filing)[dartKey],offered=candidate.financials[k];return actual!=null&&offered!=null&&new Prisma.Decimal(String(actual)).eq(offered);})){const key={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year!,periodType:period!}},before=await db.periodValuation.findUnique({where:key}),values=objectValue(before?.values),provenance=objectValue(before?.provenance),perMetric={...objectValue(provenance.perMetric)};
          for(const k of ['eps','bps','roe','per','pbr'] as const){if(values[k]!=null||candidate.values[k]==null)continue;const base=k==='per'?'eps':k==='pbr'?'bps':null;if(base&&values[base]!=null&&values[base]!==candidate.values[base])continue;values[k]=candidate.values[k];perMetric[k]={...candidate,values:undefined,financials:undefined,method:'CRAWLED',receiptNo:filing.receiptNo,fsDivision:filing.fsDivision,periodEnd:filing.periodEndDate.toISOString().slice(0,10),currency:financialCurrency(filing),shareClass:'COMMON'};}
          await db.periodValuation.update({where:key,data:{values:json(values),provenance:json({...provenance,perMetric})}});
         }
        }
       },security);
       const result=await db.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year!,periodType:period!}}});
       const financialReady=['revenueYtd','operatingProfitYtd','netIncomeYtd','totalAssets','totalLiabilities','totalEquity'].every(k=>objectValue(normalizeDartFinancialRows(fetched.rows))[k]!=null);
       const proof=objectValue(result?.provenance),manual=objectValue(objectValue(result?.supplemental).manualFields),end=fetched.source!.periodEndDate.toISOString().slice(0,10);
       const conflicts=['eps','bps','roe','per','pbr'].filter(k=>{if(objectValue(result?.values)[k]==null)return false;const e=objectValue(manual[k]??objectValue(proof.perMetric)[k]??proof);return e.fsDivision!==fetched.division||e.periodEnd!==end||e.receiptNo!==fetched.source!.receiptNo||e.kind==='ANNUAL_ESTIMATE'||e.isEstimated===true;});
       if(conflicts.length&&result)await db.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:year!,periodType:period!}},data:{reasons:json({...objectValue(result.reasons),basisConflict:conflicts.join(',')+' · 정상 값 보존, 최신 공시 근거 검토 필요'})}});
       outcome=financialReady&&!conflicts.length&&valueCompletion(objectValue(result?.values),financialCurrency({sourceValidation:fetched.source!.sourceValidation} as any)).complete?'SUCCESS':'UNRESOLVED';reason=outcome==='SUCCESS'?'검증·저장 완료':'부분수집 · 필요한 값 또는 근거 부족';
      },security);
     }
    }
   }catch(error){if(error instanceof DartApiError&&(error.quotaExceeded||error.code==='DAILY_CALL_LIMIT')){await db.securityDataReceipt.update({where:{receiptNo:task.receiptNo},data:{status:'RETRY',attempts:{decrement:1},nextAttemptAt:new Date(Date.now()+policy.retryMs),result:json({outcome:'WAITING',reason:'공통 API 한도 대기'})}});counts.pending++;counts.processing=0;break;}if(error instanceof CollectionExcluded){outcome='SKIPPED';reason='수집 설정 또는 종목 식별 변경';}else {const code=error instanceof Error&&'code' in error?String(error.code):'SECURITY_DATA_PROCESSING_ERROR';outcome=/REVIEW|MISMATCH|UNVERIFIED|NAVER_ANNUAL_TABLE_MISSING|BASIS_MISSING|UNIT_UNCONFIRMED|FORMULA_UNCONFIRMED/.test(code)?'UNRESOLVED':'FAILED';reason=code;}}
   outcome=String(outcome) as 'SUCCESS'|'FAILED'|'SKIPPED'|'UNRESOLVED';
   const terminal=outcome==='SUCCESS'||outcome==='SKIPPED'||task.attempts+1>=policy.maxAttempts;
   counts[outcome==='SUCCESS'?'success':outcome==='FAILED'?'failed':outcome==='SKIPPED'?'skipped':'unresolved']++;counts.processing=0;
   await db.$transaction(async tx=>{
   await tx.securityDataReceipt.update({where:{receiptNo:task.receiptNo},data:{status:terminal?outcome:'RETRY',nextAttemptAt:new Date(Date.now()+policy.retryMs),result:json({outcome,reason,securityId:sid?.toString(),symbol,fiscalYear:year,periodType:period,partial:financialSaved&&outcome!=='SUCCESS',financialStored:financialSaved})}});
   await tx.collectorRunItem.create({data:{runId:runId!,securityId:sid,symbol,status:outcome==='UNRESOLVED'?'NO_DATA':outcome,message:reason,diagnostics:json({phase:'SECURITY_DATA',receiptNo:task.receiptNo,outcome,fiscalYear:year,periodType:period,partial:financialSaved&&outcome!=='SUCCESS',financialStored:financialSaved}),observedAt:new Date()}});
    await tx.collectorRun.update({where:{id:runId!},data:{metadata:metadata()}});
   });
  }
  await repo.finishRun(runId,counts.failed||counts.pending||counts.processing?'PARTIAL':counts.unresolved?'PARTIAL':counts.target?'SUCCESS':'SKIPPED',{success:counts.success,failed:counts.failed,skipped:counts.skipped},undefined,metadata() as Record<string,unknown>);
  return {status:'FINISHED',runId:String(runId),...counts};
 });}catch(error){if(discovering)await db.securityDataCursor.update({where:{id:1},data:{failures:{increment:1},nextCheckAt:new Date(Date.now()+policy.retryMs)}});if(runId){const saved=await db.collectorRun.findUnique({where:{id:runId}}),m=objectValue(saved?.metadata),c=objectValue(m.counts);await repo.finishRun(runId,'FAILED',{success:c.success??0,failed:c.failed??0,skipped:c.skipped??0},error instanceof DartApiError?error.code:'SECURITY_DATA_CYCLE_FAILED',{...m,phase:'SECURITY_DATA',cycleError:true});}throw error;}
 finally{await repo.releaseLock(owner);}
}
