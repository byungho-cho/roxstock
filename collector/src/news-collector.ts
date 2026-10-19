import {summaryExtractor,initialNewsSummary} from './news-summary.js';
import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {candidateKeys,canonicalUrl,hash,kstStart,newsSchedule,selectNews,seoulDay,type NewsCandidate} from '@roxstock/shared/news/policy';
import {newsTargets} from '@roxstock/shared/news/targets';
import {PrismaCollectorRepository} from './repository.js';
import {defaultNewsSources,NewsHttp,type NewsSource} from './news-providers.js';
const job='stock-news';
export async function collectStockNews(db:PrismaClient,options:{now?:Date;signal?:AbortSignal;sources?:NewsSource[];enrich?:boolean}={}){
 const now=options.now??new Date(),owner=randomUUID(),repo=new PrismaCollectorRepository(db);
 if(process.env.STOCK_NEWS_ENABLED==='false')return {status:'DISABLED'};
 if(!await repo.acquireLock(job,owner,120))return {status:'LOCKED'};
 let lost=false,pending:Promise<unknown>|null=null,runId:bigint|undefined;
 const timer=setInterval(()=>{if(pending)return;pending=db.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND),updated_at=UTC_TIMESTAMP(3) WHERE job_name=${job} AND owner_token=${owner} AND locked_until>UTC_TIMESTAMP(3)`.then(n=>{if(n!==1)lost=true;}).catch(()=>{lost=true;}).finally(()=>{pending=null;});},20000);timer.unref();
 const signal=AbortSignal.any([AbortSignal.timeout(8*60_000),...(options.signal?[options.signal]:[])]);
 try{
  const state=await db.stockNewsState.upsert({where:{id:job},create:{id:job,initialDate:seoulDay(now)},update:{}});
  const interrupted=await db.collectorRun.updateMany({where:{jobType:job,status:'RUNNING'},data:{status:'FAILED',finishedAt:now,failureReason:'NEWS_LEASE_EXPIRED: interrupted owner recovered under the news lock'}});
  if(interrupted.count&&state.lastStatus==='RUNNING')await db.stockNewsState.update({where:{id:job},data:{lastStatus:'FAILED'}});
  const plan=newsSchedule(state,now);
  if(!plan)return {status:'IDLE',initialCompleted:!!state.initialCompletedAt,completedDate:state.completedDate};
  const attempts=state.attemptDate===plan.day?state.attempts+1:1;
  const run=await db.$transaction(async tx=>{const r=await tx.collectorRun.create({data:{jobType:job,provider:'PUBLIC_NEWS_METADATA',metadata:{kind:plan.kind,scheduleDate:plan.day,ownerId:hash(owner).slice(0,16),attempt:attempts,from:plan.from.toISOString(),to:now.toISOString(),policy:'stock-news-v1'}}});await tx.stockNewsState.update({where:{id:job},data:{attemptDate:plan.day,attempts,nextRetryAt:new Date(now.getTime()+15*60_000),lastStatus:'RUNNING'}});return r;});runId=run.id;
  const targets=await newsTargets(db),sources=options.sources??defaultNewsSources(db),results:{provider:string;status:string;count:number;requests:number;warnings:string[]}[]=[],candidates:NewsCandidate[]=[];
  for(const source of sources){
   try{
    if(lost||signal.aborted)throw Error(lost?'NEWS_LEASE_LOST':'NEWS_TIME_BOUND');
    const prior=await db.stockNewsProviderState.findUnique({where:{provider:source.id}});
    // First run uses today's exact window; later runs overlap 72h, bounded to deployment day.
    const lower=plan.kind==='INITIAL'?plan.from:new Date(Math.max(kstStart(state.initialDate).getTime(),Math.min(prior?.watermark?.getTime()??plan.from.getTime(),now.getTime())-3*86400000));
    const response=targets.length?await source.collect(targets,lower,now,signal,plan.kind==='INITIAL'?plan.from:prior?.watermark??plan.from):{candidates:[] as NewsCandidate[],warnings:[] as string[],requests:0};
    if(response.candidates.length>2000)response.warnings.push('NEWS_CANDIDATE_BOUND');
    candidates.push(...response.candidates.slice(0,2000));results.push({provider:source.id,status:response.candidates.length?'SUCCESS':('available' in response&&response.available===false)?'FAILED':response.warnings.length?'PARTIAL':'SUCCESS',count:response.candidates.length,requests:response.requests,warnings:response.warnings.slice(0,20)});
   }catch{results.push({provider:source.id,status:'FAILED',count:0,requests:0,warnings:['NEWS_SOURCE_UNAVAILABLE']});}
  }
  const keys=candidates.map(candidateKeys),existing=new Set<string>(),knownItems=new Map<string,bigint>();
  for(let i=0;i<keys.length;i+=100){const rows=await db.stockNewsItem.findMany({where:{OR:keys.slice(i,i+100).flatMap(k=>[{canonicalHash:k.canonicalHash},{fingerprint:k.fingerprint}])},select:{id:true,canonicalHash:true,fingerprint:true}});for(const r of rows){existing.add(r.canonicalHash);existing.add(r.fingerprint);knownItems.set(r.canonicalHash,r.id);knownItems.set(r.fingerprint,r.id);}const seen=await db.stockNewsSeen.findMany({where:{key:{in:keys.slice(i,i+100).flatMap(k=>[k.canonicalHash,k.fingerprint])}},select:{key:true}});for(const r of seen)existing.add(r.key);}
  const selected=selectNews(candidates,existing),duplicates=(()=>{const seen=new Set(existing);let count=0;for(const c of candidates){const k=candidateKeys(c);if(seen.has(k.canonicalHash)||seen.has(k.fingerprint))count++;else{seen.add(k.canonicalHash);seen.add(k.fingerprint);}}return count;})();
  // Existing provider summaries need no extra request; missing ones get one attempt.
  const extract=summaryExtractor(db,signal,new NewsHttp(signal,fetch,1000,1));
  if(options.enrich!==false)for(const item of selected.filter(c=>!c.summary)){
   const result=await initialNewsSummary({...item,id:0n,securities:targets.filter(t=>item.securityIds.includes(t.id)).map(t=>({security:t}))},extract);item.summary=result.summary;item.summaryMethod=result.method;if(result.access)item.accessCondition=result.access;
  }
  const summaryUnavailable=selected.filter(c=>!c.summary).length;
  const successes=results.filter(r=>r.status!=='FAILED').length,status=!successes?'FAILED':results.some(r=>r.status!=='SUCCESS')?'PARTIAL':'SUCCESS';
  const finished=options.now??new Date();
  const result=await db.$transaction(async tx=>{
   const [lease]=await tx.$queryRaw<{owner_token:string;valid:number}[]>`SELECT owner_token,(locked_until>UTC_TIMESTAMP(3)) AS valid FROM collector_locks WHERE job_name=${job} FOR UPDATE`;
   if(lost||lease?.owner_token!==owner||!lease.valid)throw Error('NEWS_LEASE_LOST');
   let saved=0,linked=0;
   // An existing shared item can become relevant to a newly targeted security.
   // Add only the relation; its public metadata and original collection time stay intact.
   const additions=new Map<string,{newsId:bigint;securityId:bigint}>();
   for(const c of candidates){const k=candidateKeys(c),newsId=knownItems.get(k.canonicalHash)??knownItems.get(k.fingerprint);if(newsId)for(const securityId of c.securityIds)additions.set(newsId+':'+securityId,{newsId,securityId});}
   const eligibleIds=new Set<bigint>(),relationIds=[...new Set([...additions.values()].map(r=>r.securityId))];
   for(let i=0;i<relationIds.length;i+=200){const rows=await tx.security.findMany({where:{id:{in:relationIds.slice(i,i+200)},collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}}},select:{id:true,symbol:true}});for(const e of rows)if(targets.some(t=>t.id===e.id&&t.symbol===e.symbol))eligibleIds.add(e.id);}
   const relations=[...additions.values()].filter(r=>eligibleIds.has(r.securityId));for(let i=0;i<relations.length;i+=500)linked+=(await tx.stockNewsSecurity.createMany({data:relations.slice(i,i+500),skipDuplicates:true})).count;
   for(const c of selected){
    const eligible=await tx.security.findMany({where:{id:{in:c.securityIds},collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}}},select:{id:true,symbol:true}});
    const permitted=eligible.filter(e=>targets.some(t=>t.id===e.id&&t.symbol===e.symbol)).map(e=>e.id);if(!permitted.length)continue;
    const item=await tx.stockNewsItem.create({data:{provider:c.provider,providerId:c.providerId,...candidateKeys(c),title:c.title,originalUrl:canonicalUrl(c.originalUrl),sourceName:c.sourceName,publishedAt:c.publishedAt,publishedPrecision:c.publishedPrecision,materialType:c.materialType,priority:c.priority,accessCondition:c.accessCondition,summary:c.summary,summaryMethod:c.summaryMethod,summaryStatus:c.summary?'READY':'NO_DATA',summaryAttempts:1,summaryNextRetryAt:null,summaryReason:c.summary?null:'SUMMARY_UNAVAILABLE_INITIAL_ATTEMPT',summaryCheckedAt:finished,summarySource:c.summary?canonicalUrl(c.originalUrl):null,collectedAt:finished,securities:{create:permitted.map(securityId=>({securityId}))}}});saved++;
    await tx.collectorRunItem.create({data:{runId:run.id,securityId:permitted[0],symbol:eligible.find(e=>e.id===permitted[0])!.symbol,status:'SUCCESS',observedAt:c.publishedAt,message:c.summary?'소식 저장 · 공개 근거 요약':'소식 저장 · 요약정보 없음',diagnostics:{newsId:String(item.id),provider:c.provider,type:c.materialType,access:c.accessCondition,summaryMethod:c.summaryMethod}}});
   }
   const screened=[...new Set(keys.flatMap(k=>[k.canonicalHash,k.fingerprint]))];for(let i=0;i<screened.length;i+=500)await tx.stockNewsSeen.createMany({data:screened.slice(i,i+500).map(key=>({key,firstSeenAt:finished})),skipDuplicates:true});
   for(const r of results){await tx.stockNewsProviderState.upsert({where:{provider:r.provider},create:{provider:r.provider,lastAttemptAt:finished,...(r.status==='SUCCESS'?{watermark:now,lastSuccessAt:finished}:{}),lastError:r.warnings.join(', ').slice(0,500)||null},update:{lastAttemptAt:finished,...(r.status==='SUCCESS'?{watermark:now,lastSuccessAt:finished}:{}),lastError:r.warnings.join(', ').slice(0,500)||null}});
    if(r.status!=='SUCCESS')await tx.collectorRunItem.create({data:{runId:run.id,symbol:r.provider,status:'FAILED',message:r.warnings.join(', ').slice(0,1000),diagnostics:{provider:r.provider,status:r.status,metadataRetained:true}}});
   }
   await tx.stockNewsState.update({where:{id:job},data:{lastStatus:status,...(successes?{completedDate:plan.day,initialCompletedAt:state.initialCompletedAt??finished,lastCollectedAt:finished,nextRetryAt:null}:{})}});
   await tx.collectorRun.update({where:{id:run.id},data:{status,finishedAt:finished,successCount:saved,failureCount:results.filter(r=>r.status!=='SUCCESS').length,skippedCount:Math.max(0,candidates.length-saved),failureReason:status==='SUCCESS'?null:'NEWS_PROVIDER_PARTIAL: 정상 자료와 기존 목록 보존',metadata:{kind:plan.kind,scheduleDate:plan.day,ownerId:hash(owner).slice(0,16),attempt:attempts,from:plan.from.toISOString(),to:now.toISOString(),policy:'stock-news-v1',targetSecurities:targets.length,candidates:candidates.length,duplicates,selected:saved,linkedRelationships:linked,summaryUnavailable,providerResults:results,selectionLimit:10,selectionTarget:5}}});
   return {status,runId:String(run.id),kind:plan.kind,date:plan.day,targets:targets.length,saved,duplicates,summaryUnavailable,providers:results,nextScheduledAt:new Date(kstStart(plan.day).getTime()+86400000+6*3600000).toISOString()};
  });return result;
 }catch(error){if(runId){const stillOwner=await db.collectorLock.findUnique({where:{jobName:job}});if(stillOwner?.ownerToken===owner&&stillOwner.lockedUntil>new Date())await db.stockNewsState.update({where:{id:job},data:{lastStatus:'FAILED'}});await db.collectorRun.updateMany({where:{id:runId,status:'RUNNING'},data:{status:'FAILED',finishedAt:new Date(),failureReason:'NEWS_COLLECTION_INTERRUPTED: 기존 목록 보존'}});}throw error;
 }finally{clearInterval(timer);await pending;await repo.releaseLock(job,owner);}
}
