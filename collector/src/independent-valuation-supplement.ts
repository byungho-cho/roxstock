import {leaseOwnerId} from '@roxstock/shared/collection/manual-requests';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {CollectionExcluded,withCollection,eligibleWhere} from '@roxstock/shared/collection/collection-policy';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma} from '@roxstock/shared/prisma';
import {PrismaDartRepository} from './dart-repository.js';
import {OpenDartProvider,DartApiError} from './dart-provider.js';
import {metricKeys,type MetricValues,type Supplemental} from '@roxstock/shared/domain/period-valuation';
import {completeShares} from '@roxstock/shared/domain/share-counts';
import {supplementStoredPeriod,loadPeriodSupplement,needsDartAccounts} from './valuation-supplement.js';
import {dartWindowOpen} from '@roxstock/shared/collection/dart-policy';
import {getSeoulClock} from '@roxstock/shared/collection/time';
const jobType='VALUATION_SUPPLEMENT';
type Config={windowStartHour:number;windowEndHour:number;apiKey?:string;dailyCallLimit?:number;minDelayMs?:number};
type Options={serviceManual?:()=>Promise<boolean>;load?:NonNullable<Parameters<typeof supplementStoredPeriod>[4]>['load'];clock?:()=>Date;sleep?:(ms:number)=>Promise<void>};
/** Automatic and manual supplementation share period-scoped DART/KIS/KRX evidence and preservation. */
export async function runIndependentSupplement(db:PrismaClient,config:Config,now=new Date(),options:Options={}){
 db=collectionClient(db);
 if(process.env.VALUATION_SUPPLEMENT_ENABLED==='false')return {status:'DISABLED'};
 const clock=options.clock??(()=>new Date()),open=(date:Date)=>dartWindowOpen(date,config.windowStartHour,config.windowEndHour,[],true);
 if(!open(now))return {status:'OUTSIDE_WINDOW'};
 const repo=new PrismaDartRepository(db),owner=randomUUID();if(!await repo.acquireLock(owner,900))return {status:'LOCKED'};
 let runId:bigint|undefined;let success=0,failed=0,skipped=0;
 try{
  const year=Number(getSeoulClock(now).dateKey.slice(0,4)),dayStart=new Date(getSeoulClock(now).dateKey+'T00:00:00+09:00');
  const usage=await db.collectorRun.findMany({where:{jobType,startedAt:{gte:dayStart}},select:{metadata:true}});
  const used=usage.reduce((n,r)=>n+Number((r.metadata as {reservedPeriods?:number;reservedCalls?:number}|null)?.reservedPeriods??(r.metadata as {reservedCalls?:number}|null)?.reservedCalls??0),0);
  const priority=new Set((await repo.prioritySecurityIds()).map(String));
  const filings=await db.dartFinancialFiling.findMany({where:{isWithdrawn:false,fiscalYear:{gte:2015,lte:year},security:{...eligibleWhere('valuation'),isActive:true,securityType:'STOCK'}},distinct:['securityId','fiscalYear','periodType'],orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}],include:{security:{select:{symbol:true,marketType:true,dartCorpMapping:{select:{corpCode:true}}}}}});
  const metrics=await db.periodValuation.findMany({where:{fiscalYear:{gte:2015,lte:year}},select:{securityId:true,fiscalYear:true,periodType:true,status:true,values:true,supplemental:true,nextAttemptAt:true}});
  const key=(r:{securityId:bigint;fiscalYear:number;periodType:string})=>String(r.securityId)+':'+r.fiscalYear+':'+r.periodType;
  const previous=new Map(metrics.map(r=>[key(r),r]));
  const pending=filings.filter(f=>{const m=previous.get(key(f)),saved=(m?.supplemental??{}) as Supplemental;
   return ['ANNUAL','Q1','Q2','Q3'].includes(f.periodType)&&!(m?.nextAttemptAt&&m.nextAttemptAt>now)&&(!valueCompletion((m?.values??{}) as Partial<MetricValues>).complete||!completeShares(saved.shares,f.receiptNo)||needsDartAccounts(f,saved));
  });
  pending.sort((a,b)=>Number(priority.has(String(b.securityId)))-Number(priority.has(String(a.securityId)))||b.fiscalYear-a.fiscalYear||key(a).localeCompare(key(b)));
  const batch=pending.slice(0,Math.max(0,Math.min(10,200-used)));
  if(!batch.length)return {status:pending.length?'QUOTA_BLOCKED':'IDLE'};
  const reservedPeriods=batch.length;
  runId=(await repo.createRun(jobType,'OPEN_DART_KIS_KRX',{ownerId:leaseOwnerId(owner),phase:'INDEPENDENT_SUPPLEMENT',reservedPeriods,timezone:'Asia/Seoul',policy:'SHARED_MANUAL_AUTOMATIC_PERIOD_SUPPLEMENT'})).id;
  const apiKey=config.apiKey??process.env.DART_API_KEY??'';
  const provider=apiKey?new OpenDartProvider({apiKey,dailyCallLimit:config.dailyCallLimit??3000,minDelayMs:config.minDelayMs??2000,
   reserveCall:limit=>{if(!open(clock()))throw new DartApiError('SCHEDULE_WINDOW_ENDED','Collection window ended.');return repo.reserveApiCall(limit,clock(),owner);},
   isCallAllowed:()=>open(clock()),onApiStatus:code=>repo.recordApiResult(code==='013'?'NO_DATA':'ERROR')}):null;
  for(const row of batch){
   if(options.serviceManual){
    const pending=await db.collectorRun.findFirst({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.manualState',equals:'QUEUED'}},orderBy:[{startedAt:'asc'},{id:'asc'}]});
    if(pending){
     await repo.releaseLock(owner);
     try{await (options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(config.minDelayMs??2000);await options.serviceManual();}
     finally{await (options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(config.minDelayMs??2000);if(!await repo.acquireLock(owner,900))throw Error('SUPPLEMENT_LOCK_LOST');}
    }
   }
   if(!open(clock()))break;
   const lease=await db.collectorLock.updateMany({where:{jobName:'dart-financial-statements',ownerToken:owner,lockedUntil:{gt:clock()}},data:{lockedUntil:new Date(clock().getTime()+900000)}});if(lease.count!==1)throw Error('SUPPLEMENT_LOCK_LOST');
   const where={securityId_fiscalYear_periodType:{securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType}};
   try{
    await withCollection(db,row.securityId,'valuation',async()=>{
     const mapping=row.security.dartCorpMapping;
     const load=options.load??loadPeriodSupplement(provider,row.security.symbol,mapping?.corpCode??'',undefined,row.security.marketType,'AUTOMATIC',{dartRequests:Boolean(apiKey&&mapping)});
     const before=await db.periodValuation.findUnique({where});
     const beforeValues=JSON.stringify(before?.values);
     const result=await supplementStoredPeriod(db,row.securityId,row.fiscalYear,row.periodType,{load});
     if(!result){skipped++;return;}
     // One retry per day for unresolved source gaps; successful source repairs leave no busy-loop.
     const complete=result.status==='SUCCESS',saved=(result.supplemental??{}) as Supplemental;
     const sourceMissing=!completeShares(saved.shares,row.receiptNo)||needsDartAccounts(row,saved);
     const nextAttemptAt=complete&&!sourceMissing?null:new Date(now.getTime()+86400000);
     const projected=supplementedFilings([row],[{securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType,supplemental:saved as Prisma.JsonObject}])[0]!;
     const financialComplete=[projected.revenueYtd,projected.operatingProfitYtd,projected.netIncomeYtd,projected.totalAssets,projected.totalLiabilities,projected.totalEquity].every(v=>v!=null);
     await db.periodValuation.update({where,data:{nextAttemptAt,supplemental:JSON.parse(JSON.stringify({...saved,...(complete||beforeValues!==JSON.stringify(result.values)?{verifiedAt:clock().toISOString()}:{}),automaticAttempt:{at:clock().toISOString(),status:complete?'SUCCESS':'PARTIAL',state:financialComplete?(complete?'COMPLETE':'FINANCIAL_ONLY'):'FINAL_FAILED',provider:'OPEN_DART_KIS_KRX'}})) as Prisma.InputJsonValue}});
     complete?success++:skipped++;
    },{symbol:row.security.symbol});
   }catch(error){if(error instanceof CollectionExcluded){skipped++;continue;}failed++;
    const code=typeof error==='object'&&error&&'code'in error&&/^[A-Z0-9_]+$/.test(String(error.code))?String(error.code):'SUPPLEMENT_SOURCE_FAILED';
    const existing=await db.periodValuation.findUnique({where});const data={nextAttemptAt:new Date(now.getTime()+86400000),supplemental:JSON.parse(JSON.stringify({...((existing?.supplemental??{}) as object),independentAttempt:{code,at:now.toISOString()}}))};
    if(existing)await db.periodValuation.update({where,data});else await db.periodValuation.create({data:{securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType,status:'FAILED',values:{},provenance:{},reasons:{source:code},...data}});
    if(['020','DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(code))break;
   }
   await (options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(2000);
  }
  await repo.finishRun(runId,failed?'PARTIAL':'SUCCESS',{success,failed,skipped},undefined,{phase:'INDEPENDENT_SUPPLEMENT',reservedPeriods});return {status:failed?'PARTIAL':'SUCCESS',success,failed,skipped};
 }catch(error){if(runId)await repo.finishRun(runId,'FAILED',{success,failed:failed+1,skipped},'SUPPLEMENT_INTERNAL_ERROR');throw error;}finally{await repo.releaseLock(owner);}
}
