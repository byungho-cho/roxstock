import {ensureNewsSchedule} from '@roxstock/shared/news/state';
import {regularSlot,nextNewsAt,newsWindow} from '@roxstock/shared/news/schedule';
import {Prisma} from '@roxstock/shared/prisma';
import {summaryExtractor,initialNewsSummary} from './news-summary.js';
import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {candidateKeys,canonicalUrl,hash,kstStart,selectNews,seoulDay,type NewsCandidate} from '@roxstock/shared/news/policy';
import {newsTargets} from '@roxstock/shared/news/targets';
import {PrismaCollectorRepository} from './repository.js';
import {defaultNewsSources,NewsHttp,type NewsSource} from './news-providers.js';
const job='stock-news';
export async function collectStockNews(db:PrismaClient,options:{now?:Date;signal?:AbortSignal;sources?:NewsSource[];enrich?:boolean;manualDate?:string}={}){
 const now=options.now??new Date(),owner=randomUUID(),repo=new PrismaCollectorRepository(db);
 if(process.env.STOCK_NEWS_ENABLED==='false')return {status:'DISABLED'};
 if(!await repo.acquireLock(job,owner,120))return {status:'LOCKED'};
 let lost=false,pending:Promise<unknown>|null=null,runId:bigint|undefined,claimedKey:string|undefined;
 const timer=setInterval(()=>{if(pending)return;pending=db.$executeRaw`UPDATE collector_locks SET locked_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND),updated_at=UTC_TIMESTAMP(3) WHERE job_name=${job} AND owner_token=${owner} AND locked_until>UTC_TIMESTAMP(3)`.then(n=>{if(n!==1)lost=true;}).catch(()=>{lost=true;}).finally(()=>{pending=null;});},20000);timer.unref();
 const signal=AbortSignal.any([AbortSignal.timeout(8*60_000),...(options.signal?[options.signal]:[])]);
 try{
  const state=await db.stockNewsState.upsert({where:{id:job},create:{id:job,initialDate:seoulDay(now)},update:{}});
  const interrupted=await db.collectorRun.updateMany({where:{jobType:job,status:'RUNNING'},data:{status:'FAILED',finishedAt:now,failureReason:'NEWS_LEASE_EXPIRED: interrupted owner recovered under the news lock'}});
  if(interrupted.count&&state.lastStatus==='RUNNING')await db.stockNewsState.update({where:{id:job},data:{lastStatus:'FAILED'}});
  const config=await ensureNewsSchedule(db,now),latest=regularSlot(config,now);
  if(options.manualDate&&options.manualDate!==seoulDay(now))return {status:'WRONG_SUPPLEMENT_DATE'};
  const initial=!state.initialCompletedAt&&!await db.stockNewsSlot.findUnique({where:{key:'INITIAL:'+state.initialDate},select:{key:true}});
  const retry=await db.stockNewsSlot.findFirst({where:{nextRetryAt:{lte:now},attempts:{lt:3}},orderBy:{scheduledAt:'desc'}});
  const due=latest>=config.anchorAt&&latest>=config.updatedAt&&(!state.lastFinishedAt||latest>state.lastFinishedAt);
  const key=options.manualDate?'SUPPLEMENT:'+options.manualDate:initial?'INITIAL:'+state.initialDate:due?config.revision+':'+latest.toISOString():retry?.key;
  if(!key)return {status:'IDLE',initialCompleted:!!state.initialCompletedAt};
  const previous=await db.stockNewsSlot.findUnique({where:{key}});
  if(previous&&(!previous.nextRetryAt||previous.nextRetryAt>now||previous.attempts>=3))return {status:'IDLE'};
  claimedKey=key;
  const kind=options.manualDate?'SUPPLEMENT':initial?'INITIAL':previous?.kind??'REGULAR';
  const scheduledAt=previous?.scheduledAt??(kind==='REGULAR'?latest:now),attempts=(previous?.attempts??0)+1;
  const plan={kind,day:seoulDay(now),from:kstStart(state.initialDate)};
  await db.stockNewsSlot.updateMany({where:{nextRetryAt:{not:null},key:{not:key},scheduledAt:{lte:scheduledAt}},data:{nextRetryAt:null}});
  await db.stockNewsProviderState.updateMany({where:{nextRetryAt:{not:null},slotKey:{not:key}},data:{nextRetryAt:null}});
  const run=await db.$transaction(async tx=>{
   await tx.stockNewsSlot.upsert({where:{key},create:{key,kind,scheduledAt,startedAt:now,attempts,nextRetryAt:new Date(now.getTime()+15*60000)},update:{status:'RUNNING',startedAt:now,attempts,nextRetryAt:new Date(now.getTime()+15*60000)}});
   const r=await tx.collectorRun.create({data:{jobType:job,provider:'PUBLIC_NEWS_METADATA',metadata:{kind,slotKey:key,scheduledAt:scheduledAt.toISOString(),intervalHours:config.intervalHours,startTime:config.startTime,anchorAt:config.anchorAt.toISOString(),actualStartedAt:now.toISOString(),attempt:attempts,policy:'stock-news-v2'}}});
   await tx.stockNewsState.update({where:{id:job},data:{lastAttemptAt:now,attemptDate:plan.day,attempts,nextRetryAt:null,lastStatus:'RUNNING'}});return r;
  });runId=run.id;
  const targets=await newsTargets(db),sources=options.sources??defaultNewsSources(db),results:any[]=[],candidates:NewsCandidate[]=[];
  for(const source of sources){
   const prior=await db.stockNewsProviderState.findUnique({where:{provider:source.id}});
   // A retry reuses the successful providers of this exact slot, not a different slot/account.
   if(prior?.slotKey===key&&(!prior.nextRetryAt||prior.nextRetryAt>now)){
    results.push({provider:source.id,status:prior.status,count:0,requests:0,warnings:prior.lastError?.split(', ')??[],reused:true,attempt:prior.attempts,diagnostics:prior.diagnostics??{},gaps:prior.gaps??[],nextRetryAt:prior.nextRetryAt?.toISOString()??null});continue;
   }
   try{
    if(lost||signal.aborted)throw Error(lost?'NEWS_LEASE_LOST':'NEWS_TIME_BOUND');
    const lower=plan.kind==='INITIAL'?plan.from:newsWindow(state.initialDate,prior?.lastCheckedAt??prior?.watermark??null,now);
    const required=new Date(Math.max(kstStart(state.initialDate).getTime(),(prior?.lastCheckedAt??prior?.watermark??lower).getTime()));
    const response=targets.length?await source.collect(targets,lower,now,signal,required):{candidates:[] as NewsCandidate[],warnings:[] as string[],requests:0};
    if(response.candidates.length>2000)response.warnings.push('NEWS_CANDIDATE_BOUND');
    candidates.push(...response.candidates.slice(0,2000).filter(c=>c.publishedAt>=kstStart(state.initialDate)&&c.publishedAt<=now));
    if(Array.isArray(prior?.gaps)&&prior.gaps.length&&!response.warnings.includes('UNCONFIRMED_HISTORY'))response.warnings.push('UNCONFIRMED_HISTORY');
    const warnings=response.warnings.filter(w=>!w.startsWith('NORMAL_EXCLUDED:'));
    const available= !('available' in response&&response.available===false);
    results.push({provider:source.id,status:!available?'FAILED':warnings.length?'PARTIAL':('normalExcluded' in response&&response.normalExcluded===targets.length?'EXCLUDED':'SUCCESS'),count:response.candidates.length,requests:response.requests,warnings:response.warnings.slice(0,20),attempt:prior?.slotKey===key?prior.attempts+1:1,diagnostics:'diagnostics' in response?response.diagnostics:{},gaps:'gaps' in response?response.gaps:[]});
   }catch{results.push({provider:source.id,status:'FAILED',count:0,requests:0,warnings:['NEWS_SOURCE_UNAVAILABLE'],attempt:prior?.slotKey===key?prior.attempts+1:1,diagnostics:{},gaps:[]});}
  }
  // Reconsider ranking exclusions from stored metadata; at most 200 rows, 72-hour validity.
  const pendingCandidates=await db.stockNewsCandidate.findMany({where:{status:'DEFERRED',expiresAt:{gte:now}},orderBy:[{priority:'desc'},{publishedAt:'desc'},{canonicalHash:'asc'}],take:200});
  const currentTargetIds=new Set(targets.map(t=>String(t.id)));
  for(const row of pendingCandidates){try{const raw=row.payload as any,c={...raw,publishedAt:new Date(raw.publishedAt),securityIds:raw.securityIds.filter((id:string)=>currentTargetIds.has(id)).map(BigInt)} as NewsCandidate;if(c.securityIds.length&&c.priority)candidates.push(c);}catch{/* Invalid legacy metadata remains diagnosable and is not published. */}}
  const keys=candidates.map(candidateKeys),existing=new Set<string>(),pastExcluded=new Set<string>(),knownItems=new Map<string,bigint>();
  for(let i=0;i<keys.length;i+=100){const rows=await db.stockNewsItem.findMany({where:{OR:keys.slice(i,i+100).flatMap((k,j)=>[{canonicalHash:k.canonicalHash},{fingerprint:k.fingerprint},{provider:candidates[i+j]!.provider,providerId:candidates[i+j]!.providerId}])},select:{id:true,canonicalHash:true,fingerprint:true,provider:true,providerId:true}});for(const r of rows){existing.add(r.canonicalHash);existing.add(r.fingerprint);knownItems.set(r.canonicalHash,r.id);knownItems.set(r.fingerprint,r.id);for(let j=i;j<Math.min(keys.length,i+100);j++)if(candidates[j]!.provider===r.provider&&candidates[j]!.providerId===r.providerId){existing.add(keys[j]!.canonicalHash);knownItems.set(keys[j]!.canonicalHash,r.id);}}const seen=await db.stockNewsSeen.findMany({where:{key:{in:keys.slice(i,i+100).flatMap(k=>[k.canonicalHash,k.fingerprint])}},select:{key:true,status:true}});for(const r of seen)if(r.status!=='STORED')pastExcluded.add(r.key);/* Seen is an observation, never proof of an actual stored item. */}
  const alreadyToday=await db.stockNewsItem.count({where:{collectedAt:{gte:kstStart(plan.day),lt:new Date(kstStart(plan.day).getTime()+86400000)}}});
  const selected=selectNews(candidates.filter(c=>c.publishedAt.getTime()+72*3600000>=now.getTime()),existing).slice(0,Math.max(0,10-alreadyToday)),duplicates=(()=>{const seen=new Set(existing);let count=0;for(const c of candidates){const k=candidateKeys(c);if(seen.has(k.canonicalHash)||seen.has(k.fingerprint))count++;else{seen.add(k.canonicalHash);seen.add(k.fingerprint);}}return count;})();
  // Existing provider summaries need no extra request; missing ones get one attempt.
  const extract=summaryExtractor(db,signal,new NewsHttp(signal,fetch,1000,1));
  if(options.enrich!==false)for(const item of selected.filter(c=>!c.summary)){
   const result=await initialNewsSummary({...item,id:0n,securities:targets.filter(t=>item.securityIds.includes(t.id)).map(t=>({security:t}))},extract);item.summary=result.summary;item.summaryMethod=result.method;if(result.access)item.accessCondition=result.access;
  }
  const summaryUnavailable=selected.filter(c=>!c.summary).length;
  const successes=results.filter(r=>r.status!=='FAILED').length,status=!successes?'FAILED':results.some(r=>!['SUCCESS','EXCLUDED'].includes(r.status))?'PARTIAL':'SUCCESS';
  const finished=options.now??new Date();
  const result=await db.$transaction(async tx=>{
   const [lease]=await tx.$queryRaw<{owner_token:string;valid:number}[]>`SELECT owner_token,(locked_until>UTC_TIMESTAMP(3)) AS valid FROM collector_locks WHERE job_name=${job} FOR UPDATE`;
   if(lost||lease?.owner_token!==owner||!lease.valid)throw Error('NEWS_LEASE_LOST');
   let saved=0,linked=0;const savedKeys=new Set<string>();
   // An existing shared item can become relevant to a newly targeted security.
   // Add only the relation; its public metadata and original collection time stay intact.
   const additions=new Map<string,{newsId:bigint;securityId:bigint}>();
   for(const c of candidates){const k=candidateKeys(c),newsId=knownItems.get(k.canonicalHash)??knownItems.get(k.fingerprint);if(newsId)for(const securityId of c.securityIds)additions.set(newsId+':'+securityId,{newsId,securityId});}
   const eligibleIds=new Set<bigint>(),relationIds=[...new Set([...additions.values()].map(r=>r.securityId))];
   for(let i=0;i<relationIds.length;i+=200){const rows=await tx.security.findMany({where:{id:{in:relationIds.slice(i,i+200)},collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}}},select:{id:true,symbol:true}});for(const e of rows)if(targets.some(t=>t.id===e.id&&t.symbol===e.symbol))eligibleIds.add(e.id);}
   const requestedRelations=[...additions.values()].filter(r=>eligibleIds.has(r.securityId)),existingRelations=new Set<string>();
   for(let i=0;i<requestedRelations.length;i+=200){const rows=await tx.stockNewsSecurity.findMany({where:{OR:requestedRelations.slice(i,i+200)},select:{newsId:true,securityId:true}});for(const row of rows)existingRelations.add(row.newsId+':'+row.securityId);}
   const relations=requestedRelations.filter(r=>!existingRelations.has(r.newsId+':'+r.securityId));
   for(let i=0;i<relations.length;i+=500)linked+=(await tx.stockNewsSecurity.createMany({data:relations.slice(i,i+500),skipDuplicates:true})).count;
   for(const c of selected){
    const eligible=await tx.security.findMany({where:{id:{in:c.securityIds},collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}}},select:{id:true,symbol:true}});
    const permitted=eligible.filter(e=>targets.some(t=>t.id===e.id&&t.symbol===e.symbol)).map(e=>e.id);if(!permitted.length)continue;
    const item=await tx.stockNewsItem.create({data:{provider:c.provider,providerId:c.providerId,...candidateKeys(c),title:c.title,originalUrl:canonicalUrl(c.originalUrl),sourceName:c.sourceName,publishedAt:c.publishedAt,publishedPrecision:c.publishedPrecision,materialType:c.materialType,priority:c.priority,accessCondition:c.accessCondition,summary:c.summary,summaryMethod:c.summaryMethod,summaryStatus:c.summary?'READY':'NO_DATA',summaryAttempts:1,summaryNextRetryAt:null,summaryReason:c.summary?null:'SUMMARY_UNAVAILABLE_INITIAL_ATTEMPT',summaryCheckedAt:finished,summarySource:c.summary?canonicalUrl(c.originalUrl):null,collectedAt:finished,securities:{create:permitted.map(securityId=>({securityId}))}}});saved++;savedKeys.add(candidateKeys(c).canonicalHash);
    await tx.collectorRunItem.create({data:{runId:run.id,securityId:permitted[0],symbol:eligible.find(e=>e.id===permitted[0])!.symbol,status:'SUCCESS',observedAt:c.publishedAt,message:c.summary?'소식 저장 · 공개 근거 요약':'소식 저장 · 요약정보 없음',diagnostics:{newsId:String(item.id),provider:c.provider,type:c.materialType,access:c.accessCondition,summaryMethod:c.summaryMethod}}});
   }
   const selectedKeys=savedKeys;
   const unique=new Map(candidates.map(c=>[candidateKeys(c).canonicalHash,c]));
   const counts=new Map<string,{storedDuplicates:number;pastExcluded:number;selectionExcluded:number;saved:number;linked:number}>();
   for(const c of unique.values()){
    const k=candidateKeys(c),stored=existing.has(k.canonicalHash)||existing.has(k.fingerprint),chosen=selectedKeys.has(k.canonicalHash),status=stored||chosen?'STORED':c.priority&&c.securityIds.length?'DEFERRED':'EXCLUDED',reason=status==='DEFERRED'?(alreadyToday+saved>=10?'DAILY_LIMIT':'SELECTION_RANK'):status==='EXCLUDED'?'NOT_RELEVANT':null;
    const count=counts.get(c.provider)??{storedDuplicates:0,pastExcluded:0,selectionExcluded:0,saved:0,linked:0};
    if(stored)count.storedDuplicates++;if(pastExcluded.has(k.canonicalHash)||pastExcluded.has(k.fingerprint)||pendingCandidates.some(p=>p.canonicalHash===k.canonicalHash))count.pastExcluded++;if(status==='DEFERRED')count.selectionExcluded++;if(chosen)count.saved++;count.linked+=relations.filter(r=>knownItems.get(k.canonicalHash)===r.newsId).length;counts.set(c.provider,count);
    const payload=JSON.parse(JSON.stringify({...c,securityIds:c.securityIds.map(String),summary:null,summaryMethod:'NONE'}));
    await tx.stockNewsCandidate.upsert({where:{canonicalHash:k.canonicalHash},create:{...k,provider:c.provider,providerId:c.providerId,payload,priority:c.priority,publishedAt:c.publishedAt,expiresAt:new Date(c.publishedAt.getTime()+72*3600000),status,reason,firstSeenAt:finished,lastCheckedAt:finished},update:{payload,status,reason,lastCheckedAt:finished}});
    for(const seenKey of [k.canonicalHash,k.fingerprint])await tx.stockNewsSeen.upsert({where:{key:seenKey},create:{key:seenKey,firstSeenAt:finished,status,reason,lastCheckedAt:finished},update:{status,reason,lastCheckedAt:finished}});
   }
   const nextRetries:Date[]=[];
   for(const r of results){
    if(r.reused){r.diagnostics={rawParsed:0,periodPassed:0,securityMatched:0,...counts.get(r.provider)};await tx.stockNewsProviderState.update({where:{provider:r.provider},data:{diagnostics:r.diagnostics}});if(r.nextRetryAt)nextRetries.push(new Date(r.nextRetryAt));continue;}
    const recoverable=r.warnings.some((w:string)=>/UNAVAILABLE|FAILED|QUOTA|YIELDED|TIME_BOUND|PAGE_BOUND|CALL_BOUND|SOURCE_BOUND/.test(w));
    const nextRetryAt=recoverable&&r.attempt<3?new Date(finished.getTime()+15*60000*r.attempt):null;
    if(nextRetryAt)nextRetries.push(nextRetryAt);
    r.nextRetryAt=nextRetryAt?.toISOString()??null;r.retryEndReason=nextRetryAt?null:r.status==='SUCCESS'||r.status==='EXCLUDED'?'COMPLETE':recoverable?'RETRY_EXHAUSTED':'COVERAGE_UNRECOVERABLE';
    r.diagnostics={...r.diagnostics,...counts.get(r.provider),selectionExcluded:(r.diagnostics?.selectionExcluded??0)+(counts.get(r.provider)?.selectionExcluded??0)};
    const prior=await tx.stockNewsProviderState.findUnique({where:{provider:r.provider}});
    const gaps=[...(Array.isArray(prior?.gaps)?prior!.gaps:[]),...(Array.isArray(r.gaps)?r.gaps:[])].slice(-24);
    const data={slotKey:key,status:r.status,attempts:r.attempt,nextRetryAt,lastAttemptAt:now,...(r.status!=='FAILED'&&!recoverable?{lastCheckedAt:finished}:{}),gaps,diagnostics:r.diagnostics,lastError:r.warnings.join(', ').slice(0,500)||null,...(r.status==='SUCCESS'||r.status==='EXCLUDED'?{lastSuccessAt:finished,...(!gaps.length?{watermark:now}:{})}:{})};
    await tx.stockNewsProviderState.upsert({where:{provider:r.provider},create:{provider:r.provider,...data},update:data});
    if(!['SUCCESS','EXCLUDED'].includes(r.status))await tx.collectorRunItem.create({data:{runId:run.id,symbol:r.provider,status:'FAILED',message:r.warnings.join(', ').slice(0,1000),diagnostics:{provider:r.provider,status:r.status,retryEndReason:r.retryEndReason,metadataRetained:true}}});
   }
   const nextRetryAt=nextRetries.length?new Date(Math.min(...nextRetries.map(d=>d.getTime()))):null;
   await tx.stockNewsSlot.update({where:{key},data:{status,finishedAt:finished,nextRetryAt}});
   await tx.stockNewsState.update({where:{id:job},data:{lastStatus:status,lastFinishedAt:finished,nextRetryAt,...(successes?{completedDate:plan.day,initialCompletedAt:state.initialCompletedAt??finished,lastCollectedAt:finished}:{}),...(status==='SUCCESS'?{lastFullSuccessAt:finished}:{}),...(saved?{lastNewStoredAt:finished}:{})}});
   await tx.collectorRun.update({where:{id:run.id},data:{status,finishedAt:finished,successCount:saved,failureCount:results.filter(r=>!['SUCCESS','EXCLUDED'].includes(r.status)).length,skippedCount:Math.max(0,candidates.length-saved),failureReason:status==='SUCCESS'?null:'NEWS_PROVIDER_PARTIAL: 정상 자료와 기존 목록 보존',metadata:{kind:plan.kind,scheduleDate:plan.day,ownerId:hash(owner).slice(0,16),attempt:attempts,from:plan.from.toISOString(),to:now.toISOString(),slotKey:key,scheduledAt:scheduledAt.toISOString(),intervalHours:config.intervalHours,startTime:config.startTime,anchorAt:config.anchorAt.toISOString(),actualStartedAt:now.toISOString(),policy:'stock-news-v2',dailyAlreadyStored:alreadyToday,selectionExcluded:Math.max(0,unique.size-saved-[...counts.values()].reduce((s,c)=>s+c.storedDuplicates,0)),targetUnit:'unique securities across active accounts',targetSecurities:targets.length,candidates:candidates.length,duplicates,selected:saved,linkedRelationships:linked,summaryUnavailable,providerResults:results,selectionLimit:10,selectionTarget:5}}});
   return {status,runId:String(run.id),kind:plan.kind,date:plan.day,targets:targets.length,saved,duplicates,summaryUnavailable,providers:results,selectionExcluded:Math.max(0,unique.size-saved-[...counts.values()].reduce((s,c)=>s+c.storedDuplicates,0)),linked,nextRetryAt:nextRetryAt?.toISOString()??null,nextScheduledAt:nextNewsAt(config,finished).toISOString()};
  },{timeout:30000});
  // Retain all actual news. Bounded diagnostics/metadata cleanup only, 30 days.
  const old=await db.stockNewsCandidate.findMany({where:{firstSeenAt:{lt:new Date(now.getTime()-30*86400000)}},select:{canonicalHash:true},take:200});
  if(old.length)await db.stockNewsCandidate.deleteMany({where:{canonicalHash:{in:old.map(r=>r.canonicalHash)}}});
  // Legacy keys have no recoverable payload. Mark at most 200 for metadata-based recheck,
  // preserving the keys; only source rediscovery can supply publication/relevance evidence.
  const legacy=await db.stockNewsSeen.findMany({where:{status:'LEGACY_UNKNOWN'},orderBy:{firstSeenAt:'asc'},take:200,select:{key:true}});
  for(const row of legacy){const stored=await db.stockNewsItem.findFirst({where:{OR:[{canonicalHash:row.key},{fingerprint:row.key}]},select:{id:true}});await db.stockNewsSeen.update({where:{key:row.key},data:{status:stored?'STORED':'RECHECK_AVAILABLE',reason:stored?null:'LEGACY_EXCLUSION_UNKNOWN_REDISCOVERY_REQUIRED',lastCheckedAt:finished}});}
  const oldSlots=await db.stockNewsSlot.findMany({where:{scheduledAt:{lt:new Date(now.getTime()-30*86400000)},nextRetryAt:null},select:{key:true},take:100});
  if(oldSlots.length)await db.stockNewsSlot.deleteMany({where:{key:{in:oldSlots.map(r=>r.key)}}});
  const oldRuns=await db.collectorRun.findMany({where:{jobType:job,startedAt:{lt:new Date(now.getTime()-30*86400000)},metadata:{path:'$.policy',equals:'stock-news-v2'}},select:{id:true,metadata:true},orderBy:{id:'asc'},take:10});
  for(const r of oldRuns){const m=r.metadata as any;if(m?.diagnosticsPruned)continue;await db.collectorRun.update({where:{id:r.id},data:{metadata:{policy:'stock-news-v2-retained-counts',kind:m?.kind??null,targetSecurities:m?.targetSecurities??0,candidates:m?.candidates??0,duplicates:m?.duplicates??0,selected:m?.selected??0,diagnosticsPruned:true}}});await db.collectorRunItem.updateMany({where:{runId:r.id},data:{diagnostics:Prisma.DbNull}});}
  return result;
 }catch(error){if(runId){const stillOwner=await db.collectorLock.findUnique({where:{jobName:job}});if(stillOwner?.ownerToken===owner&&stillOwner.lockedUntil>new Date())await db.stockNewsState.update({where:{id:job},data:{lastStatus:'FAILED',lastFinishedAt:new Date()}});if(claimedKey&&stillOwner?.ownerToken===owner&&stillOwner.lockedUntil>new Date()){const slot=await db.stockNewsSlot.findUnique({where:{key:claimedKey}});await db.stockNewsSlot.updateMany({where:{key:claimedKey},data:{status:'FAILED',finishedAt:new Date(),nextRetryAt:slot&&slot.attempts<3?new Date(Date.now()+15*60000):null}});}await db.collectorRun.updateMany({where:{id:runId,status:'RUNNING'},data:{status:'FAILED',finishedAt:new Date(),failureReason:'NEWS_COLLECTION_INTERRUPTED: 기존 목록 보존'}});}throw error;
 }finally{clearInterval(timer);await pending;await repo.releaseLock(job,owner);}
}
