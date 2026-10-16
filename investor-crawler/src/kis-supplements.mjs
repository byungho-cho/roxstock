import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Prisma} from '../../shared/dist/generated/prisma/index.js';
import {ProviderError} from './provider.mjs';
import {annualSupplement} from './kis-annual-supplement.mjs';

const job='kis-fundamentals';
const dateKey=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
export function supplementPermissions(security){
 const blocked=!security.isActive||security.collectionExcluded||security.symbol.toUpperCase().startsWith('Z99');
 const excluded=Array.isArray(security.excludedFeatures)?security.excludedFeatures:[];
 return {valuation:!blocked&&!excluded.includes('valuation'),shares:!blocked&&!excluded.includes('share-counts')};
}
export function supplementData(observation,security,observedDate){
 const permissions=supplementPermissions(security),data={securityId:security.id,collectionSymbol:security.symbol,observedDate,collectedAt:observation.collectedAt,source:'KIS_API'};
 for(const key of ['per','pbr','eps','bps','foreignHoldingShares','foreignExhaustionRate'])data[key]=permissions.valuation?observation[key]:null;
 data.listedShares=permissions.shares?observation.listedShares:null;
 data.foreignHoldingRatio=data.listedShares&&data.foreignHoldingShares!==null?new Prisma.Decimal(data.foreignHoldingShares).mul(100).div(data.listedShares).toDecimalPlaces(6).toString():null;
 if(data.foreignHoldingRatio!==null&&new Prisma.Decimal(data.foreignHoldingRatio).gt(100))throw new ProviderError('KIS_FOREIGN_SHARES_EXCEED_LISTED');
 data.raw={periodBasis:'CURRENT_REFERENCE_ONLY',sourceAsOf:null,exchangeScope:'KRX',shareUnit:'SHARE',rateUnit:'PERCENT',ratioBasis:'FOREIGN_SHARES_DIVIDED_BY_LISTED_SHARES',fields:Object.fromEntries(Object.entries(observation.raw).filter(([key])=>key==='lstn_stcn'?permissions.shares:['per','pbr','eps','bps','frgn_hldn_qty','hts_frgn_ehrt'].includes(key)&&permissions.valuation))};
 return data;
}
/** Bounded daily scan; snapshots and attempts persist across restarts. No historical rewrites. */
export async function runKisSupplements({db,kis,signal,limit=10,symbols,requestDelayMs=2000,log=()=>{},now=()=>new Date(),sleep=delay}){
 if(!Number.isInteger(limit)||limit<1||limit>3000||!Number.isFinite(requestDelayMs)||requestDelayMs<2000)throw new ProviderError('INVALID_SUPPLEMENT_OPTIONS');
 const owner=randomUUID(),observedDate=new Date(dateKey(now())+'T00:00:00Z');
 const acquired=await db.collectorLock.updateMany({where:{jobName:job,lockedUntil:{lt:now()}},data:{ownerToken:owner,lockedUntil:new Date(now().getTime()+120000)}});
 if(!acquired.count){try{await db.collectorLock.create({data:{jobName:job,ownerToken:owner,lockedUntil:new Date(now().getTime()+120000)}});}catch(e){if(e.code==='P2002')return {stored:0,failed:0,locked:true};throw e;}}
 let lost=false,run;let stored=0,failed=0,skipped=0,annualFailures=0,annualFilledTotal=0;
 const heartbeat=setInterval(()=>{void db.collectorLock.updateMany({where:{jobName:job,ownerToken:owner},data:{lockedUntil:new Date(now().getTime()+120000)}}).then(r=>{if(!r.count)lost=true;}).catch(()=>{lost=true;});},30000);
 try{
  await db.collectorRun.updateMany({where:{jobType:job,status:'RUNNING'},data:{status:'FAILED',finishedAt:now(),failureReason:'EXPIRED_OWNER_LEASE'}});
  const candidates=await db.security.findMany({where:{
   isActive:true,collectionExcluded:false,securityType:'STOCK',marketType:{in:['KOSPI','KOSDAQ']},NOT:{symbol:{startsWith:'Z99'}},
   ...(symbols?{symbol:{in:symbols}}:{}),kisFundamentalSnapshots:{none:{observedDate}},
   collectorRunItems:{none:{run:{jobType:job,startedAt:{gte:new Date(now().getTime()-3600000)}}}},
  },orderBy:{id:'asc'}});
  const targets=candidates.filter(s=>{const p=supplementPermissions(s);return p.valuation||p.shares;}).slice(0,limit);
  if(!targets.length)return {stored,failed,skipped};
  run=await db.collectorRun.create({data:{jobType:job,provider:'KIS_API',metadata:{observedDate:dateKey(now()),referenceOnly:false,annualMissingOnly:true,targets:targets.length}}});
  for(const target of targets){
   if(signal?.aborted||lost)throw new ProviderError(lost?'LOCK_OWNERSHIP_LOST':'WORKER_STOPPED');
   try{
    const observation=await kis.currentFundamentals(target.symbol);
    let annualRows=[],annualError=null;
    if(supplementPermissions(target).valuation&&typeof kis.annualFundamentals==='function'){
     const periods=await db.periodValuation.findMany({where:{securityId:target.id,periodType:'ANNUAL'}});
     if(periods.some(p=>['eps','bps','roe'].some(key=>p.values?.[key]==null))){
      try{annualRows=await kis.annualFundamentals(target.symbol,{sleep,signal});}catch(error){if(signal?.aborted)throw error;annualError=error instanceof ProviderError?error.code:'ANNUAL_INTERNAL_ERROR';annualFailures++;}
     }
    }
    const filled=await db.$transaction(async tx=>{
     const lease=await tx.$queryRaw`SELECT owner_token FROM collector_locks WHERE job_name=${job} AND locked_until>${now()} FOR UPDATE`;
     if(lease[0]?.owner_token!==owner)throw new ProviderError('LOCK_OWNERSHIP_LOST');
     if(annualRows.length)await tx.$queryRaw`SELECT revision FROM analysis_revisions WHERE \`key\`='financial' FOR UPDATE`;
     await tx.$queryRaw`SELECT id FROM securities WHERE id=${target.id} FOR UPDATE`;
     const current=await tx.security.findUnique({where:{id:target.id}}),permissions=current&&supplementPermissions(current);
     if(!current||current.symbol!==target.symbol||current.collectionRevision!==target.collectionRevision||!permissions.valuation&&!permissions.shares)throw new ProviderError('TARGET_CHANGED_OR_EXCLUDED');
     const data=supplementData(observation,current,observedDate);
     await tx.kisFundamentalSnapshot.upsert({where:{securityId_collectionSymbol_observedDate:{securityId:target.id,collectionSymbol:target.symbol,observedDate}},create:data,update:{}});
     let annualFilled=0;
     if(permissions.valuation&&annualRows.length){
      const periods=await tx.periodValuation.findMany({where:{securityId:target.id,periodType:'ANNUAL'}});
      const filings=await tx.dartFinancialFiling.findMany({where:{securityId:target.id,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}]});
      for(const period of periods){
       if(current.codeRevision>0&&period.collectionSymbol!==current.symbol)continue;
       const patch=annualSupplement(period,annualRows,filings);
       if(!patch.changed)continue;
       await tx.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:target.id,fiscalYear:period.fiscalYear,periodType:'ANNUAL'}},data:patch.data});annualFilled+=patch.filled.length;
      }
      if(annualFilled)for(const key of ['financial','security:'+target.id])await tx.analysisRevision.upsert({where:{key},create:{key,revision:1n},update:{revision:{increment:1}}});
     }
     await tx.collectorRunItem.create({data:{runId:run.id,securityId:target.id,symbol:target.symbol,status:'SUCCESS',message:'KIS 최신 참고 지표 저장 · 결산 일치 보완 '+annualFilled+'개'+(annualError?' · 연간 보완 대기 '+annualError:''),observedAt:observation.collectedAt}});
     return annualFilled;
    },{maxWait:15000,timeout:20000});annualFilledTotal+=filled;stored++;
   }catch(error){
    if(error?.code==='LOCK_OWNERSHIP_LOST'||signal?.aborted)throw error;
    const code=error instanceof ProviderError?error.code:'INTERNAL_OR_DB_ERROR';
    if(code==='TARGET_CHANGED_OR_EXCLUDED')skipped++;else failed++;
    await db.collectorRunItem.create({data:{runId:run.id,securityId:target.id,symbol:target.symbol,status:code==='TARGET_CHANGED_OR_EXCLUDED'?'SKIPPED':'FAILED',message:code}});
   }
   await sleep(requestDelayMs,undefined,{signal});
  }
  await db.collectorRun.update({where:{id:run.id},data:{status:failed||annualFailures?(stored?'PARTIAL':'FAILED'):stored?'SUCCESS':'SKIPPED',finishedAt:now(),successCount:stored,failureCount:failed+annualFailures,skippedCount:skipped,metadata:{observedDate:dateKey(now()),referenceOnly:false,annualMissingOnly:true,targets:targets.length,annualFilled:annualFilledTotal,annualFailures}}});
  log('KIS_SUPPLEMENT_FINISHED',{runId:String(run.id),stored,failed,skipped,annualFilled:annualFilledTotal,annualFailures});return {runId:String(run.id),stored,failed,skipped,annualFilled:annualFilledTotal,annualFailures};
 }catch(error){
  if(run)await db.collectorRun.update({where:{id:run.id},data:{status:'FAILED',finishedAt:now(),successCount:stored,failureCount:failed,failureReason:error instanceof ProviderError?error.code:'INTERRUPTED_OR_INTERNAL_ERROR'}});
  throw error;
 }finally{clearInterval(heartbeat);await db.collectorLock.deleteMany({where:{jobName:job,ownerToken:owner}});}
}
