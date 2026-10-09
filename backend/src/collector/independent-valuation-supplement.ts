import {randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '../generated/prisma/index.js';
import {PrismaDartRepository} from './dart-repository.js';
import {NaverAnnualProvider,type NaverAnnual} from './naver-annual.js';
import {metricKeys,preserveValues,type MetricValues} from '../domain/period-valuation.js';
import {supplementStoredPeriod} from './valuation-supplement.js';
import {dartWindowOpen} from './dart-policy.js';
import {getSeoulClock} from './time.js';
const jobType='VALUATION_SUPPLEMENT';
/** Existing valid values and manual inputs win. Ratios cannot use a different preserved denominator. */
export function mergeAnnualSupplement(old:unknown,source:NaverAnnual,provenance:unknown={}){
 const fresh={...source.values};const prior=(old??{}) as Partial<MetricValues>;
 for(const [ratio,base] of [['per','eps'],['pbr','bps']] as const){
  const evidence=((provenance??{}) as {perMetric?:Record<string,{source?:string;fiscalYear?:number;division?:string}>}).perMetric?.[base];
  if(prior[base]!=null&&(fresh[base]!==prior[base]||evidence?.source!=='NAVER_FNGUIDE_ANNUAL'||evidence.fiscalYear!==source.fiscalYear||evidence.division!==source.division))fresh[ratio]=null;
  if(prior[ratio]!=null&&prior[base]==null)fresh[base]=null;
  if(fresh[base]!=null&&new Prisma.Decimal(fresh[base]!).lte(0))fresh[ratio]=null;
 }
 return preserveValues(old,fresh);
}
export async function runIndependentSupplement(db:PrismaClient,config:{windowStartHour:number;windowEndHour:number},now=new Date(),source=new NaverAnnualProvider()){
 if(process.env.VALUATION_SUPPLEMENT_ENABLED==='false')return {status:'DISABLED'};
 if(!dartWindowOpen(now,config.windowStartHour,config.windowEndHour,[],true))return {status:'OUTSIDE_WINDOW'};
 const repo=new PrismaDartRepository(db),owner=randomUUID();if(!await repo.acquireLock(owner,900))return {status:'LOCKED'};
 let runId:bigint|undefined;let success=0,failed=0,skipped=0;
 try{
  const clock=getSeoulClock(now),year=Number(clock.dateKey.slice(0,4));
  const dayStart=new Date(clock.dateKey+'T00:00:00+09:00');
  const usage=await db.collectorRun.findMany({where:{jobType,startedAt:{gte:dayStart}},select:{metadata:true}});
  const used=usage.reduce((n,r)=>n+Number((r.metadata as {reservedCalls?:number}|null)?.reservedCalls??0),0);
  const priority=new Set((await repo.prioritySecurityIds()).map(String));
  const filings=await db.dartFinancialFiling.findMany({where:{isWithdrawn:false,fiscalYear:{gte:2015,lte:year},security:{isActive:true,securityType:'STOCK'}},distinct:['securityId','fiscalYear','periodType'],select:{securityId:true,fiscalYear:true,periodType:true,security:{select:{symbol:true}}}});
  const metrics=await db.periodValuation.findMany({where:{fiscalYear:{gte:2015,lte:year}},select:{securityId:true,fiscalYear:true,periodType:true,values:true,nextAttemptAt:true}});
  const key=(r:{securityId:bigint;fiscalYear:number;periodType:string})=>String(r.securityId)+':'+r.fiscalYear+':'+r.periodType;
  const previous=new Map(metrics.map(r=>[key(r),r]));
  const pending=filings.filter(r=>{const m=previous.get(key(r));return !(m?.nextAttemptAt&&m.nextAttemptAt>now)&&!metricKeys.every(k=>(m?.values as Partial<MetricValues>|null)?.[k]!=null);});
  pending.sort((a,b)=>Number(priority.has(String(b.securityId)))-Number(priority.has(String(a.securityId)))||b.fiscalYear-a.fiscalYear||key(a).localeCompare(key(b)));
  const batch:typeof pending=[];let reservedCalls=0;const sourceCompanies=new Set<string>();
  for(const row of pending){const company=String(row.securityId);const needed=row.periodType==='ANNUAL'&&row.fiscalYear>=2021&&!sourceCompanies.has(company)?4:0;if(used+reservedCalls+needed>200)continue;batch.push(row);reservedCalls+=needed;if(needed)sourceCompanies.add(company);if(batch.length===10)break;}
  if(!batch.length)return {status:pending.length?'QUOTA_BLOCKED':'IDLE'};
  runId=(await repo.createRun(jobType,'NAVER_FNGUIDE_STORED_FILINGS',{phase:'INDEPENDENT_SUPPLEMENT',reservedCalls,timezone:'Asia/Seoul'})).id;
  for(const row of batch){
   if(!dartWindowOpen(new Date(),config.windowStartHour,config.windowEndHour,[],true))break;
   const lease=await db.collectorLock.updateMany({where:{jobName:'dart-financial-statements',ownerToken:owner,lockedUntil:{gt:new Date()}},data:{lockedUntil:new Date(Date.now()+900000)}});if(lease.count!==1)throw Error('SUPPLEMENT_LOCK_LOST');
   const where={securityId_fiscalYear_periodType:{securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType}};
   try{
    const annual=row.periodType==='ANNUAL'&&row.fiscalYear>=2021?(await source.annual(row.security.symbol)).find(r=>r.fiscalYear===row.fiscalYear&&r.kind==='FINAL_ANNUAL'):undefined;
    if(annual){
     const existing=await db.periodValuation.findUnique({where});const values=mergeAnnualSupplement(existing?.values,annual,existing?.provenance);
     const old=existing?.values as Partial<MetricValues>|null;const oldProvenance=(existing?.provenance??{}) as Record<string,unknown>;
     const perMetric=Object.fromEntries(metricKeys.filter(k=>values[k]!=null).map(k=>[k,old?.[k]!=null?(oldProvenance.perMetric as Record<string,unknown>|undefined)?.[k]??oldProvenance:{...annual,values:undefined,financials:undefined,method:'COLLECTED',stage:'INDEPENDENT_SUPPLEMENT'}]));
     const complete=metricKeys.every(k=>values[k]!=null);const reasons=Object.fromEntries(metricKeys.filter(k=>values[k]==null).map(k=>[k,'원천 누락 또는 기존 분모와 기준 불일치']));
     const data={values:JSON.parse(JSON.stringify(values)),provenance:JSON.parse(JSON.stringify({...oldProvenance,perMetric})),reasons,status:complete?'SUCCESS':'PARTIAL',nextAttemptAt:complete?null:new Date(now.getTime()+86400000)};
     await db.periodValuation.upsert({where,create:{securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType,...data},update:data});complete?success++:skipped++;
    }else{
     const result=await supplementStoredPeriod(db,row.securityId,row.fiscalYear,row.periodType);
     if(result){await db.periodValuation.update({where,data:{nextAttemptAt:new Date(now.getTime()+86400000)}});}skipped++;
    }
   }catch(error){failed++;const code=typeof error==='object'&&error&&'code'in error&&/^[A-Z0-9_]+$/.test(String(error.code))?String(error.code):'SUPPLEMENT_SOURCE_FAILED';
    const existing=await db.periodValuation.findUnique({where});const data={nextAttemptAt:new Date(now.getTime()+86400000),supplemental:JSON.parse(JSON.stringify({...((existing?.supplemental??{}) as object),independentAttempt:{code,at:now.toISOString()}}))};
    if(existing)await db.periodValuation.update({where,data});else await db.periodValuation.create({data:{securityId:row.securityId,fiscalYear:row.fiscalYear,periodType:row.periodType,status:'FAILED',values:{},provenance:{},reasons:{source:code},...data}});
   }
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  await repo.finishRun(runId!,failed?'PARTIAL':'SUCCESS',{success,failed,skipped},undefined,{phase:'INDEPENDENT_SUPPLEMENT',reservedCalls});return {status:failed?'PARTIAL':'SUCCESS',success,failed,skipped};
 }catch(error){if(runId)await repo.finishRun(runId,'FAILED',{success,failed:failed+1,skipped},'SUPPLEMENT_INTERNAL_ERROR');throw error;}finally{await repo.releaseLock(owner);}
}
