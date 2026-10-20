import 'dotenv/config';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prisma} from '@roxstock/shared/lib/prisma';
import {Prisma} from '@roxstock/shared/prisma';
import {withFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {dartProgress,dartStatusWhere,dartPeriodEnd,thebornPreListingTask} from '@roxstock/shared/collection/dart-task-status';
import {dartTaskScope} from '@roxstock/shared/collection/dart-backfill';
import {PrismaDartRepository,taskSnapshot} from '../dart-repository.js';
import fixtures from '../fixtures/dart-priority-audit-20261021.json' with {type:'json'};

type Change={id:string;updatedAt:string;symbol:string;year:number;period:string;previous:ReturnType<typeof taskSnapshot>;next:Record<string,unknown>;reason:string};
type Plan={version:1;createdAt:string;changes:Change[]};
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function buildPlan(now=new Date()):Promise<Plan>{
 const repo=new PrismaDartRepository(prisma),changes:Change[]=[];
 for(const fixture of fixtures){
  const task=await prisma.dartBackfillTask.findFirst({where:{fiscalYear:fixture.year,reportCode:fixture.reportCode,security:{symbol:fixture.symbol,securityType:'STOCK',collectionExcluded:false}},include:{security:{include:{dartCorpMapping:true}}}});
  if(!task||task.periodType==='Q4'||!['NO_FILING','NOT_APPLICABLE'].includes(task.status))continue;
  const mapping=task.security.dartCorpMapping;
  if(!mapping||mapping.corpCode!==fixture.corpCode||mapping.stockCode!==fixture.symbol||mapping.collectionSymbol!==fixture.symbol)continue;
  if(Array.isArray(task.security.excludedFeatures)&&task.security.excludedFeatures.includes('dart-financial-statements'))continue;
  // Any existing validated financial storage wins over an audit-era absence.
  if(await prisma.dartFinancialFiling.count({where:{securityId:task.securityId,fiscalYear:task.fiscalYear,periodType:task.periodType,isWithdrawn:false}}))continue;
  let next:Record<string,unknown>|undefined,reason='';
  if(task.status==='NO_FILING'&&task.errorCode==='NO_PERIODIC_FILING'&&thebornPreListingTask(fixture.symbol,task.fiscalYear,task.periodType)){
    let policyEvidence:Record<string,unknown>={listingDate:'2024-11-06',periodEndUpperBound:`${task.fiscalYear}-12-31`,policyScope:'AUDITED_24_TASKS_ONLY'};
    if(task.fiscalYear===2024){
      const annual=await prisma.dartFinancialFiling.findFirst({where:{securityId:task.securityId,fiscalYear:2024,periodType:'ANNUAL',isWithdrawn:false,normalizationVersion:{gte:3}},orderBy:{collectedAt:'desc'},select:{periodEndDate:true,sourceValidation:true}});
      const proof=annual?.sourceValidation as {version?:number;corpCode?:string}|null;
      if(!annual||proof?.version!==2||proof.corpCode!==mapping.corpCode||annual.periodEndDate.toISOString().slice(0,10)!=='2024-12-31')continue;
      const end=dartPeriodEnd(task.fiscalYear,task.periodType,12);if(end>='2024-11-06')continue;
      policyEvidence={...policyEvidence,periodEnd:end,closingMonth:12,monthEvidence:'validated 2024 annual statement'};
    }
    next={status:'EXCLUDED',errorCode:'PRE_LISTING_POLICY_EXCLUDED',errorMessage:'상장 전 수집 제외',diagnostics:{...((task.diagnostics&&typeof task.diagnostics==='object'&&!Array.isArray(task.diagnostics))?task.diagnostics:{}),policyEvidence},processedAt:now.toISOString(),nextAttemptAt:null};reason='USER_POLICY_475560_PRE_LISTING_20241106';
  }else if(task.status==='NO_FILING'&&task.errorCode==='NO_PERIODIC_FILING'&&fixture.periodEnd){
    const cache=await prisma.dartReportCache.findUnique({where:{corpCode_fiscalYear:{corpCode:mapping.corpCode,fiscalYear:task.fiscalYear}}});
    const reports=Array.isArray(cache?.reports)?cache.reports as unknown as import('../dart-provider.js').DartReport[]:[];
    // An expired/old cache cannot prove current absence; queue a fresh list check instead.
    if(!cache||cache.expiresAt<=now||reports.some(r=>r.selection?.version!==2)||reports.some(r=>r.reportCode===task.reportCode&&!r.withdrawn)){
      next={status:'PENDING',processedAt:null,nextAttemptAt:now.toISOString()};reason='AUDIT_RECHECK_REQUIRED';
    }else{
      const decision=await repo.missingReportDecision(task.securityId,task.fiscalYear,task.periodType,reports,now);
      if(decision.status==='NOT_DUE'&&decision.diagnostics.periodEnd===fixture.periodEnd){next={...decision,processedAt:null,nextAttemptAt:decision.nextAttemptAt?.toISOString()??null};reason='AUDIT_NOT_DUE_VERIFIED';}
    }
  }else if(task.status==='NOT_APPLICABLE'&&task.errorCode==='DART_CORP_CODE_NOT_MAPPED'){
    next={status:'PENDING',processedAt:null,nextAttemptAt:now.toISOString()};reason='EXACT_MAPPING_RECOVERED';
  }else if(task.status==='NO_FILING'&&task.errorCode==='ROWS_NOT_PUBLISHED'){
    next={status:'FAILED',errorCode:'REVIEW_REQUIRED',errorMessage:'기존 CFS/OFS 원응답 근거 부족 · 자료 미제공 여부 및 원문 보완 검증 필요',processedAt:null,nextAttemptAt:null};reason='LEGACY_FINANCIAL_RESPONSE_UNVERIFIED';
  }
  // Mapping recovery is separately re-evaluated against live master identities under the lease.
  if(next)changes.push({id:String(task.id),updatedAt:task.updatedAt.toISOString(),symbol:fixture.symbol,year:task.fiscalYear,period:task.periodType,previous:taskSnapshot(task),next,reason});
 }
 return {version:1,createdAt:now.toISOString(),changes};
}
function updateData(next:Record<string,unknown>):Prisma.DartBackfillTaskUpdateManyMutationInput {
 const result={...next} as any;
 for(const key of ['nextAttemptAt','processedAt','lastAttemptAt'])if(typeof result[key]==='string')result[key]=new Date(result[key]);
 if('diagnostics' in result)result.diagnostics=result.diagnostics??Prisma.DbNull;
 return result;
}
export async function applyPlan(plan:Plan){
 if(plan.version!==1||!Array.isArray(plan.changes))throw Error('Unsupported plan');
 let changed=0,skipped=0;
 for(const change of plan.changes){
  const n=await prisma.$transaction(async tx=>{
   const task=await tx.dartBackfillTask.findUnique({where:{id:BigInt(change.id)},include:{security:{include:{dartCorpMapping:true}}}});
   const fixture=fixtures.find(f=>f.symbol===change.symbol&&f.year===change.year&&f.period===change.period);
   if(!task||!fixture||task.security.symbol!==fixture.symbol||task.security.collectionExcluded||task.security.securityType!=='STOCK'||(Array.isArray(task.security.excludedFeatures)&&task.security.excludedFeatures.includes('dart-financial-statements'))||task.security.dartCorpMapping?.corpCode!==fixture.corpCode||task.security.dartCorpMapping?.stockCode!==fixture.symbol||task.security.dartCorpMapping?.collectionSymbol!==fixture.symbol)return 0;
   if(task.updatedAt.toISOString()!==change.updatedAt||digest(taskSnapshot(task))!==digest(change.previous))return 0;
   if(await tx.dartFinancialFiling.count({where:{securityId:task.securityId,fiscalYear:task.fiscalYear,periodType:task.periodType,isWithdrawn:false}}))return 0;
   const result=await tx.dartBackfillTask.updateMany({where:{id:task.id,updatedAt:task.updatedAt,status:task.status},data:updateData(change.next)});
   if(result.count){
    const next=await tx.dartBackfillTask.findUniqueOrThrow({where:{id:task.id}});
    await tx.dartTaskDecision.create({data:{taskId:task.id,reason:change.reason,previous:json(change.previous),next:json(taskSnapshot(next))}});
    if(next.status==='PENDING'){
     await tx.dartSecurityState.updateMany({where:{securityId:task.securityId},data:{backfillCompletedAt:null}});
     await tx.dartCollectorState.updateMany({where:{id:1},data:{phase:'BACKFILL',backfillCompletedAt:null}});
    }
   }return result.count;
  });changed+=n;if(!n)skipped++;
 }
 return {changed,skipped};
}
export async function restorePlan(plan:Plan){
 let restored=0,skipped=0;
 for(const change of plan.changes){
  const n=await prisma.$transaction(async tx=>{
   const audit=await tx.dartTaskDecision.findFirst({where:{taskId:BigInt(change.id),reason:change.reason},orderBy:{id:'desc'}});
   const task=await tx.dartBackfillTask.findUnique({where:{id:BigInt(change.id)}});
   if(!task||!audit||digest(taskSnapshot(task))!==digest(audit.next)||task.status==='SUCCESS')return 0;
   if(await tx.dartFinancialFiling.count({where:{securityId:task.securityId,fiscalYear:task.fiscalYear,periodType:task.periodType,isWithdrawn:false}}))return 0;
   const result=await tx.dartBackfillTask.updateMany({where:{id:task.id,updatedAt:task.updatedAt},data:updateData(change.previous)});
   if(result.count)await tx.dartTaskDecision.create({data:{taskId:task.id,reason:'AUDIT_CORRECTION_RESTORED',previous:json(taskSnapshot(task)),next:json(change.previous)}});
   return result.count;
  });restored+=n;if(!n)skipped++;
 }return {restored,skipped};
}
async function main(){
 const [mode,file]=process.argv.slice(2);
 if(!['plan','apply','restore'].includes(mode??'')||!file?.startsWith('/'))throw Error('Usage: plan|apply|restore /absolute/private/file.json');
 const repo=new PrismaDartRepository(prisma),owner=randomUUID();
 if(!await repo.acquireLock(owner,900)){await prisma.$disconnect();throw Error('FINANCIAL_LEASE_BUSY');}
 try{await withFinancialLease(owner,async()=>{
  if(mode==='plan'){
   const plan=await buildPlan();writeFileSync(file,JSON.stringify(plan,null,2)+'\n',{mode:0o600,flag:'wx'});
   console.log(JSON.stringify({mode,targets:plan.changes.length,byReason:plan.changes.reduce<Record<string,number>>((r,c)=>{r[c.reason]=(r[c.reason]??0)+1;return r;},{})}));
  }else{
   const plan=JSON.parse(readFileSync(file,'utf8')) as Plan;
   const result=mode==='restore'?await restorePlan(plan):await applyPlan(plan);
   const mappingRecovered=0;
   const rows=await prisma.dartBackfillTask.groupBy({by:['status','errorCode','needsSupplement'],where:dartTaskScope(),_count:{_all:true}});
   console.log(JSON.stringify({mode,...result,mappingRecovered,progress:dartProgress(rows),reviewRequired:await prisma.dartBackfillTask.count({where:{AND:[dartTaskScope(),dartStatusWhere('REVIEW_REQUIRED')]}}),financialRecollectionExecuted:false}));
  }
 });}finally{await repo.releaseLock(owner);await prisma.$disconnect();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error('DART_RECONCILIATION_FAILED: inspect private server logs; no raw data printed');process.exitCode=error instanceof Error&&error.message==='FINANCIAL_LEASE_BUSY'?75:1;});
