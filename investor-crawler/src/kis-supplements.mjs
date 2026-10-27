import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Prisma} from '../../shared/dist/generated/prisma/index.js';
import {CollectionJobRepository} from '../../shared/dist/collection/job-repository.js';
import {withFinancialLease,assertFinancialLease} from '../../shared/dist/collection/financial-lease.js';
import {ProviderError} from './provider.mjs';
import {annualSupplement,annualSupplementExcluded} from './kis-annual-supplement.mjs';
import {mergeCurrentFundamentals} from './krx-fundamentals.mjs';

const job='kis-fundamentals';
const dateKey=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
export function supplementPermissions(security){
 const blocked=!security.isActive||security.collectionExcluded||security.symbol.toUpperCase().startsWith('Z99');
 const excluded=Array.isArray(security.excludedFeatures)?security.excludedFeatures:[];
 return {valuation:!blocked&&!excluded.includes('valuation'),shares:!blocked&&!excluded.includes('share-counts')};
}
export function supplementData(observation,security,observedDate){
 const permissions=supplementPermissions(security),data={securityId:security.id,collectionSymbol:security.symbol,observedDate,collectedAt:observation.collectedAt,source:observation.source??'KIS_API'};
 for(const key of ['per','pbr','eps','bps','foreignHoldingShares','foreignExhaustionRate'])data[key]=permissions.valuation?observation[key]:null;
 data.listedShares=permissions.shares?observation.listedShares:null;
 data.foreignHoldingRatio=observation.ratioCompatible!==false&&data.listedShares&&data.foreignHoldingShares!==null?new Prisma.Decimal(data.foreignHoldingShares).mul(100).div(data.listedShares).toDecimalPlaces(6).toString():null;
 if(data.foreignHoldingRatio!==null&&new Prisma.Decimal(data.foreignHoldingRatio).gt(100))throw new ProviderError('KIS_FOREIGN_SHARES_EXCEED_LISTED');
 data.raw={periodBasis:'CURRENT_REFERENCE_ONLY',sourceAsOf:null,exchangeScope:'KRX',shareUnit:'SHARE',rateUnit:'PERCENT',ratioBasis:'FOREIGN_SHARES_DIVIDED_BY_LISTED_SHARES',fields:Object.fromEntries(Object.entries(observation.raw).filter(([key])=>key==='lstn_stcn'?permissions.shares:['per','pbr','eps','bps','frgn_hldn_qty','hts_frgn_ehrt'].includes(key)&&permissions.valuation))};
 if(observation.raw.fieldSources)data.raw.fieldSources=Object.fromEntries(Object.entries(observation.raw.fieldSources).filter(([key])=>key==='listedShares'?permissions.shares:permissions.valuation));
 if(permissions.shares&&observation.raw.krx)data.raw.krx=observation.raw.krx;
 return data;
}
/** Upgrade a same-day fallback in place; never let KRX erase a KIS value. */
export function mergeStoredSnapshot(existing,incoming,permissions){
 if(!existing)return incoming;
 const fields=['per','pbr','eps','bps','listedShares','foreignHoldingShares','foreignExhaustionRate'];
 const raw={...incoming.raw,fields:{...existing.raw?.fields,...incoming.raw.fields}},fieldSources={},result={...incoming};
 for(const key of fields){
  const allowed=key==='listedShares'?permissions.shares:permissions.valuation;
  if(!allowed){result[key]=null;continue;}
  const old=existing[key]?.toString()??null,next=incoming[key];
  const oldSource=existing.raw?.fieldSources?.[key]??{source:existing.source,sourceAsOf:null,collectedAt:existing.collectedAt.toISOString()};
  const nextSource=incoming.raw.fieldSources?.[key]??{source:incoming.source,sourceAsOf:null,collectedAt:incoming.collectedAt.toISOString()};
  const keep=old!==null&&(next==null||oldSource.source==='KIS_API'&&nextSource.source!=='KIS_API');
  result[key]=keep?old:next;if(result[key]!=null)fieldSources[key]=keep?oldSource:nextSource;
 }
 const numerator=fieldSources.foreignHoldingShares,denominator=fieldSources.listedShares;
 const compatible=numerator?.source==='KIS_API'&&denominator?.source==='KIS_API'&&numerator.collectedAt===denominator.collectedAt;
 result.foreignHoldingRatio=compatible&&result.listedShares&&result.foreignHoldingShares!=null?new Prisma.Decimal(result.foreignHoldingShares).mul(100).div(result.listedShares).toDecimalPlaces(6).toString():null;
 if(result.foreignHoldingRatio!==null&&new Prisma.Decimal(result.foreignHoldingRatio).gt(100))throw new ProviderError('KIS_FOREIGN_SHARES_EXCEED_LISTED');
 raw.fieldSources=fieldSources;
 raw.fields=Object.fromEntries(Object.entries(raw.fields).filter(([key])=>key==='lstn_stcn'?permissions.shares:permissions.valuation));
 if(permissions.shares&&(incoming.raw.krx||existing.raw?.krx))raw.krx=incoming.raw.krx??existing.raw.krx;
 result.raw=raw;result.source=[...new Set(Object.values(fieldSources).map(v=>v.source))].join('+');
 return result;
}
/** Bounded daily scan; snapshots and attempts persist across restarts. No historical rewrites. */
export async function runKisSupplements({db,kis,krx=null,signal,limit=10,symbols,requestDelayMs=2000,log=()=>{},now=()=>new Date(),sleep=delay}){
 const currentOnly=process.env.SECURITY_DATA_COLLECTION_ENABLED==='true';
 if(currentOnly?process.env.KIS_CURRENT_FUNDAMENTALS_ENABLED==='false':process.env.KIS_SUPPLEMENT_ENABLED==='false')return {status:'DISABLED'};
 if(!Number.isInteger(limit)||limit<1||limit>3000||!Number.isFinite(requestDelayMs)||requestDelayMs<2000)throw new ProviderError('INVALID_SUPPLEMENT_OPTIONS');
 const owner=randomUUID(),observedDate=new Date(dateKey(now())+'T00:00:00Z');
 const financialRepo=new CollectionJobRepository(db);let annualRemaining=currentOnly?0:10;
 const acquired=await db.collectorLock.updateMany({where:{jobName:job,lockedUntil:{lt:now()}},data:{ownerToken:owner,lockedUntil:new Date(now().getTime()+120000)}});
 if(!acquired.count){try{await db.collectorLock.create({data:{jobName:job,ownerToken:owner,lockedUntil:new Date(now().getTime()+120000)}});}catch(e){if(e.code==='P2002')return {stored:0,failed:0,locked:true};throw e;}}
 let lost=false,run;let stored=0,failed=0,skipped=0,annualFailures=0,annualDeferred=0,referenceFailures=0,annualFilledTotal=0;
 const heartbeat=setInterval(()=>{void db.collectorLock.updateMany({where:{jobName:job,ownerToken:owner,lockedUntil:{gt:now()}},data:{lockedUntil:new Date(now().getTime()+120000)}}).then(r=>{if(!r.count)lost=true;}).catch(()=>{lost=true;});},30000);
 try{
  await db.collectorRun.updateMany({where:{jobType:job,status:'RUNNING'},data:{status:'FAILED',finishedAt:now(),failureReason:'EXPIRED_OWNER_LEASE'}});
  const candidates=await db.security.findMany({where:{
   isActive:true,collectionExcluded:false,securityType:'STOCK',marketType:{in:['KOSPI','KOSDAQ']},NOT:{symbol:{startsWith:'Z99'}},
   ...(symbols?{symbol:{in:symbols}}:{}),AND:[{OR:[{excludedFeatures:{equals:Prisma.DbNull}},{NOT:{excludedFeatures:{array_contains:'valuation'}}},{NOT:{excludedFeatures:{array_contains:'share-counts'}}}]}],fundamentalSnapshots:{none:{observedDate,source:{contains:'KIS_API'}}},
   collectorRunItems:{none:{run:{jobType:job,startedAt:{gte:new Date(now().getTime()-3600000)}}}},
  },orderBy:{id:'asc'},take:Math.min(10,limit)});
  const targets=candidates.filter(s=>{const p=supplementPermissions(s);return p.valuation||p.shares;}).slice(0,limit);
  if(!targets.length)return {stored,failed,skipped};
  run=await db.collectorRun.create({data:{jobType:job,provider:'KIS_KRX',metadata:{ownerId:createHash('sha256').update(owner).digest('hex').slice(0,16),primary:'KIS_API',fallback:'KRX',observedDate:dateKey(now()),referenceOnly:currentOnly,currentReferenceOnly:currentOnly,annualMissingOnly:!currentOnly,targets:targets.length}}});
  for(const target of targets){
   if(signal?.aborted||lost)throw new ProviderError(lost?'LOCK_OWNERSHIP_LOST':'WORKER_STOPPED');
   try{
    let primary=null,fallback=null,primaryError=null,fallbackError=null;
    try{primary=await kis.currentFundamentals(target.symbol);}catch(error){if(!krx)throw error;primaryError=error instanceof ProviderError?error.code:'KIS_CURRENT_UNAVAILABLE';}
    if(krx&&supplementPermissions(target).shares&&primary?.listedShares==null){
     await sleep(requestDelayMs,undefined,{signal});
     try{fallback=await krx.currentFundamentals(target.symbol,target.marketType,dateKey(now()));}catch(error){fallbackError=error instanceof ProviderError?error.code:'KRX_CURRENT_UNAVAILABLE';}
    }
    const observation=mergeCurrentFundamentals(primary,fallback);
    let annualRows=[],annualError=null;
    if(annualRemaining&&!primaryError&&supplementPermissions(target).valuation&&typeof kis.annualFundamentals==='function'){
     const periods=await db.periodValuation.findMany({where:{securityId:target.id,periodType:'ANNUAL',fiscalYear:{gte:2015,lte:Number(dateKey(now()).slice(0,4))}},orderBy:{fiscalYear:'desc'},take:annualRemaining});
     if(periods.some(p=>!annualSupplementExcluded(p)&&['eps','bps','roe'].some(key=>p.values?.[key]==null))){
      try{annualRows=await kis.annualFundamentals(target.symbol,{sleep,signal});}catch(error){if(signal?.aborted)throw error;annualError=error instanceof ProviderError?error.code:'ANNUAL_INTERNAL_ERROR';annualFailures++;}
     }
    }
    let financialOwned=false;
    if(annualRows.length){financialOwned=await financialRepo.acquireLock(owner,90);if(!financialOwned){annualRows=[];annualError='FINANCIAL_LEASE_BUSY';annualDeferred++;}}
    let filled;
    try{filled=await (financialOwned?work=>withFinancialLease(owner,work):work=>work())(()=>db.$transaction(async tx=>{
     if(financialOwned){await tx.$queryRaw`SELECT revision FROM analysis_revisions WHERE \`key\`='financial' FOR UPDATE`;await assertFinancialLease(tx);}
     const lease=await tx.$queryRaw`SELECT owner_token FROM collector_locks WHERE job_name=${job} AND locked_until>${now()} FOR UPDATE`;
     if(lease[0]?.owner_token!==owner)throw new ProviderError('LOCK_OWNERSHIP_LOST');
     await tx.$queryRaw`SELECT id FROM securities WHERE id=${target.id} FOR UPDATE`;
     const current=await tx.security.findUnique({where:{id:target.id}}),permissions=current&&supplementPermissions(current);
     if(!current||current.symbol!==target.symbol||current.collectionRevision!==target.collectionRevision||!permissions.valuation&&!permissions.shares)throw new ProviderError('TARGET_CHANGED_OR_EXCLUDED');
     const where={securityId_collectionSymbol_observedDate:{securityId:target.id,collectionSymbol:target.symbol,observedDate}};
     const existing=await tx.fundamentalSnapshot.findUnique({where});
     const data=mergeStoredSnapshot(existing,supplementData(observation,current,observedDate),permissions);
     await tx.fundamentalSnapshot.upsert({where,create:data,update:existing?data:{}});
     let annualFilled=0;
     if(permissions.valuation&&annualRows.length){
      const periods=await tx.periodValuation.findMany({where:{securityId:target.id,periodType:'ANNUAL',fiscalYear:{in:annualRows.map(row=>row.fiscalYear).filter(year=>Number.isInteger(year)&&year>=2015&&year<=Number(dateKey(now()).slice(0,4))).slice(0,10)}},orderBy:{fiscalYear:'desc'},take:annualRemaining});annualRemaining-=periods.length;
      const filings=[];for(const period of periods){const f=await tx.dartFinancialFiling.findFirst({where:{securityId:target.id,fiscalYear:period.fiscalYear,periodType:'ANNUAL',isWithdrawn:false,...(current.codeRevision>0?{collectionSymbol:current.symbol}:{})},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'}]});if(f)filings.push(f);}
      for(const period of periods){
       if(current.codeRevision>0&&period.collectionSymbol!==current.symbol)continue;
       const patch=annualSupplement(period,annualRows,filings);
       if(!patch.changed)continue;
       await tx.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:target.id,fiscalYear:period.fiscalYear,periodType:'ANNUAL'}},data:patch.data});annualFilled+=patch.filled.length;
      }
      if(annualFilled)for(const key of ['financial','security:'+target.id])await tx.analysisRevision.upsert({where:{key},create:{key,revision:1n},update:{revision:{increment:1}}});
     }
     // Both screens cache the same financial revision, including current references.
     if(!annualFilled)await tx.analysisRevision.upsert({where:{key:'security:'+target.id},create:{key:'security:'+target.id,revision:1n},update:{revision:{increment:1}}});
     await tx.collectorRunItem.create({data:{runId:run.id,securityId:target.id,symbol:target.symbol,status:primaryError||fallbackError?'STALE':'SUCCESS',message:observation.source+' 공통 추가 지표 저장 · 결산 일치 보완 '+annualFilled+'개'+(annualError?' · 연간 보완 대기 '+annualError:'')+(primaryError?' · 한투 보완 대기 '+primaryError:'')+(fallbackError?' · KRX 보완 대기 '+fallbackError:''),observedAt:observation.collectedAt}});
     if(financialOwned)await assertFinancialLease(tx);
     return annualFilled;
    },{maxWait:15000,timeout:20000}));}finally{if(financialOwned)await financialRepo.releaseLock(owner);}annualFilledTotal+=filled;stored++;if(primaryError||fallbackError)referenceFailures++;
   }catch(error){
    if(error?.code==='LOCK_OWNERSHIP_LOST'||signal?.aborted)throw error;
    const code=error instanceof ProviderError?error.code:'INTERNAL_OR_DB_ERROR';
    if(code==='TARGET_CHANGED_OR_EXCLUDED')skipped++;else failed++;
    await db.collectorRunItem.create({data:{runId:run.id,securityId:target.id,symbol:target.symbol,status:code==='TARGET_CHANGED_OR_EXCLUDED'?'SKIPPED':'FAILED',message:code}});
   }
   await sleep(requestDelayMs,undefined,{signal});
  }
  await db.collectorRun.update({where:{id:run.id},data:{status:failed||annualFailures||referenceFailures?(stored?'PARTIAL':'FAILED'):stored?'SUCCESS':'SKIPPED',finishedAt:now(),successCount:stored,failureCount:failed+annualFailures+referenceFailures,skippedCount:skipped,metadata:{observedDate:dateKey(now()),referenceOnly:currentOnly,currentReferenceOnly:currentOnly,annualMissingOnly:!currentOnly,targets:targets.length,annualFilled:annualFilledTotal,annualFailures,annualDeferred,referenceFailures}}});
  log('KIS_SUPPLEMENT_FINISHED',{runId:String(run.id),stored,failed,skipped,annualFilled:annualFilledTotal,annualFailures,annualDeferred,referenceFailures});return {runId:String(run.id),stored,failed,skipped,annualFilled:annualFilledTotal,annualFailures,annualDeferred,referenceFailures};
 }catch(error){
  if(run)await db.collectorRun.update({where:{id:run.id},data:{status:'FAILED',finishedAt:now(),successCount:stored,failureCount:failed,failureReason:error instanceof ProviderError?error.code:'INTERRUPTED_OR_INTERNAL_ERROR'}});
  throw error;
 }finally{clearInterval(heartbeat);await db.collectorLock.deleteMany({where:{jobName:job,ownerToken:owner}});}
}
