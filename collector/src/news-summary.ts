import {randomUUID} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {canonicalUrl,contentSummary,plainText,seoulDay,type AccessCondition} from '@roxstock/shared/news/policy';
import {loadCollectorConfig} from '@roxstock/shared/collection/config';
import {withFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {PrismaCollectorRepository} from './repository.js';
import {PrismaDartRepository} from './dart-repository.js';
import {OpenDartProvider,DartApiError} from './dart-provider.js';
import {NewsHttp,publicDescription,parseReports} from './news-providers.js';

type SummaryItem={id:bigint;provider:string;providerId:string;title:string;originalUrl:string;materialType:string;accessCondition:string;publishedAt:Date;securities:{security:{id:bigint;symbol:string;name:string}}[]};
export type SummaryResult={summary:string|null;method:string;status:'READY'|'NO_DATA'|'BLOCKED'|'UNSUPPORTED'|'RETRY';reason:string|null;source:string|null;access?:AccessCondition};
const none=(status:SummaryResult['status'],reason:string,source:string|null=null):SummaryResult=>({summary:null,method:'NONE',status,reason,source});
const ready=(evidence:string|null,title:string,method:string,source:string):SummaryResult=>{const summary=contentSummary(evidence,title);return summary?{summary,method,status:'READY',reason:null,source}:none('NO_DATA','NO_VERIFIABLE_SUMMARY',source);};
/** Only known public article containers. No generic whole-page extraction or body persistence. */
export function publicArticleBody(html:string){
 if(/["']isAccessibleForFree["']\s*:\s*false|paywall|로그인이 필요|결제 후/i.test(html))return null;
 const body=/<(?:div|article)\b[^>]*(?:id=["']article-body["']|class=["'][^"']*\barticle-body\b[^"']*["'])[^>]*>([\s\S]*?)(?:<div[^>]*(?:article-bottom|article-footer)|<\/article>|<\/body>)/i.exec(html)?.[1];
 if(!body)return null;
 return body.replace(/<(script|style|nav|footer|aside|figure|button)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<br\s*\/?\s*>|<\/p>/gi,'\n');
}
/** DART API archive: exact receipt identity, bounded entries/bytes/inflate; never written to disk. */
export function dartDocumentText(data:Uint8Array,receipt:string){
 if(!/^\d{14}$/.test(receipt)||data.length>2_000_000)throw Error('DART_DOCUMENT_BOUND');
 const b=Buffer.from(data);let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('DART_DOCUMENT_ARCHIVE');const count=b.readUInt16LE(end+10);if(count>20)throw Error('DART_DOCUMENT_ENTRIES');let pos=b.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  if(pos+46>b.length||b.readUInt32LE(pos)!==0x02014b50)throw Error('DART_DOCUMENT_ARCHIVE');
  const nameLength=b.readUInt16LE(pos+28),extra=b.readUInt16LE(pos+30),comment=b.readUInt16LE(pos+32),name=b.subarray(pos+46,pos+46+nameLength).toString('utf8');
  if(name===receipt+'.xml'){
   const size=b.readUInt32LE(pos+20),expanded=b.readUInt32LE(pos+24),offset=b.readUInt32LE(pos+42),method=b.readUInt16LE(pos+10);
   if(expanded>5_000_000||offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50)throw Error('DART_DOCUMENT_BOUND');
   const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);if(start+size>b.length)throw Error('DART_DOCUMENT_BOUND');
   const compressed=b.subarray(start,start+size),out=method===0?compressed:method===8?inflateRawSync(compressed,{maxOutputLength:5_000_000}):null;
   if(!out||out.length!==expanded||out.length>5_000_000)throw Error('DART_DOCUMENT_BOUND');
   const xml=new TextDecoder('utf-8',{fatal:true}).decode(out);if(/<!ENTITY/i.test(xml))throw Error('DART_DOCUMENT_ENTITY');
   // Keep prose and complete labeled table rows, never isolated financial numeric cells.
   const paragraphs=[...xml.matchAll(/<P\b[^>]*>([\s\S]*?)<\/P>/gi)].map(m=>plainText(m[1]!)).filter(t=>t.length>=12&&!/^[\d\s,.%+−-]+$/.test(t));
   return paragraphs.join('\n');
  }pos+=46+nameLength+extra+comment;
 }throw Error('DART_DOCUMENT_RECEIPT_MISMATCH');
}
async function dartEvidence(db:PrismaClient,item:SummaryItem,signal:AbortSignal):Promise<SummaryResult>{
 const config=loadCollectorConfig(),repo=new PrismaDartRepository(db),owner=randomUUID(),state=await repo.getState(),now=new Date();
 const limit=state?.backfillCompletedAt?config.dartDailyCallLimit:config.dartBackfillDailyCallLimit,delay=state?.backfillCompletedAt?config.dartMinDelayMs:config.dartBackfillMinDelayMs;
 const manual=()=>db.collectorRun.findFirst({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.phase',equals:'MANUAL'}},select:{id:true}});
 if(!config.dartEnabled||!process.env.DART_API_KEY)return none('UNSUPPORTED','DART_API_DISABLED');
 if((state?.lastRunAt&&seoulDay(state.lastRunAt)===seoulDay(now)&&/^(020|DAILY_CALL_LIMIT)(?::|$)/.test(state.lastError??''))||((await repo.getDailyUsage(now))?.apiCallCount??0)>=limit)return none('RETRY','DART_SHARED_QUOTA');
 if(await manual()||!await repo.acquireLock(owner,90))return none('RETRY','DART_MANUAL_OR_LOCK_PRIORITY');
 try{return await withFinancialLease(owner,async()=>{
  // A previous financial owner may have exhausted the shared quota before this lease.
  const current=await repo.getState();if(current?.lastRunAt&&seoulDay(current.lastRunAt)===seoulDay(new Date())&&/^(020|DAILY_CALL_LIMIT)(?::|$)/.test(current.lastError??''))return none('RETRY','DART_SHARED_QUOTA');
  const provider=new OpenDartProvider({apiKey:process.env.DART_API_KEY!,dailyCallLimit:limit,minDelayMs:delay,isCallAllowed:()=>!signal.aborted,reserveCall:async l=>{if(signal.aborted||await manual())throw Error('DART_MANUAL_PRIORITY');return repo.reserveApiCall(l,new Date(),owner);},onApiStatus:async status=>{await repo.recordApiResult(status==='013'?'NO_DATA':'ERROR');if(status==='020')await db.dartCollectorState.update({where:{id:1},data:{lastError:'020: DART quota confirmed by news summary request'}});}});
  await new Promise<void>((resolve,reject)=>{if(signal.aborted)return reject(Error('ABORTED'));const timer=setTimeout(resolve,delay);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('ABORTED'));},{once:true});});
  const bytes=await provider.newsDocument(item.providerId,signal);return ready(dartDocumentText(bytes,item.providerId),item.title,'PUBLIC_DART_DOCUMENT','https://opendart.fss.or.kr/api/document.xml?rcept_no='+item.providerId);
 });}catch(e){return none(e instanceof DartApiError&&e.code==='013'?'NO_DATA':'RETRY',e instanceof DartApiError?'DART_'+e.code:'DART_DOCUMENT_UNAVAILABLE');}finally{await repo.releaseLock(owner);}
}
export function summaryExtractor(db:PrismaClient,signal:AbortSignal,http:Pick<NewsHttp,'text'>=new NewsHttp(signal)){
 const reports=new Map<string,Promise<string>>();
 return async(item:SummaryItem):Promise<SummaryResult>=>{
  const url=canonicalUrl(item.originalUrl);
  if(item.provider==='DART')return dartEvidence(db,item,signal);
  if(item.provider==='HANKYUNG_CONSENSUS'){
   const day=seoulDay(item.publishedAt),source='https://consensus.hankyung.com/analysis/list?'+new URLSearchParams({sdate:day,edate:day,now_page:'1',pagenum:'80'});
   // A shared bounded day-page response is reused by all matching reports in this batch.
   let response=reports.get(day);if(!response){response=http.text(source);reports.set(day,response);}const html=await response;
   const match=parseReports(html,item.securities.map(s=>({...s.security})),new Date(day+'T00:00:00+09:00'),new Date(day+'T23:59:59+09:00')).find(r=>r.providerId===item.providerId);
   if(!match)return none('NO_DATA','REPORT_ABSTRACT_NOT_IN_BOUNDED_PAGE',source);
   return ready(match.summary,item.title,'PUBLIC_REPORT_ABSTRACT',source);
  }
  if(item.provider==='HANKYUNG_RSS'){
   const html=await http.text(url,item.accessCondition==='PAID'||item.accessCondition==='LOGIN'?65536:1_000_000,item.accessCondition==='PAID'||item.accessCondition==='LOGIN'),head=html.split(/<\/head\s*>/i)[0]??'',free=/["']isAccessibleForFree["']\s*:\s*(true|false)/.exec(head)?.[1],access:AccessCondition=free==='false'?'PAID':free==='true'?'FREE':item.accessCondition as AccessCondition;
   const description=ready(publicDescription(head),item.title,'PUBLIC_DESCRIPTION_EXTRACT',url);
   if(description.summary)return {...description,access};
   if(access==='PAID'||access==='LOGIN')return {...none('NO_DATA','PUBLIC_INTRO_UNAVAILABLE',url),access};
   return {...ready(publicArticleBody(html),item.title,'PUBLIC_BODY_SENTENCES',url),access};
  }
  return none('UNSUPPORTED','PROVIDER_UNSUPPORTED',url);
 };
}

/** Durable missing-summary queue; same stock-news lease prevents collection/backfill races. */
export async function supplementNewsSummaries(db:PrismaClient,options:{now?:Date;signal?:AbortSignal;extract?:(item:SummaryItem)=>Promise<SummaryResult>}={}){
 if(process.env.STOCK_NEWS_ENABLED==='false')return {status:'DISABLED'};
 const job='stock-news',owner=randomUUID(),repo=new PrismaCollectorRepository(db),now=options.now??new Date();if(!await repo.acquireLock(job,owner,120))return {status:'LOCKED'};
 const signal=AbortSignal.any([AbortSignal.timeout(90_000),...(options.signal?[options.signal]:[])]);let runId:bigint|undefined;
 try{
  await db.collectorRun.updateMany({where:{jobType:'stock-news-summary',status:'RUNNING'},data:{status:'FAILED',finishedAt:now,failureReason:'NEWS_SUMMARY_LEASE_EXPIRED: recovered under shared news lock'}});
  // One bounded batch, selected by persisted status/retry time, no loading all stored news.
  const items=await db.stockNewsItem.findMany({where:{summary:null,securities:{some:{security:{collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}}}}},summaryAttempts:{lt:3},summaryStatus:{in:['PENDING','RETRY']},OR:[{summaryNextRetryAt:null},{summaryNextRetryAt:{lte:now}}]},include:{securities:{include:{security:{select:{id:true,symbol:true,name:true}}}}},orderBy:{id:'asc'},take:5});
  if(!items.length)return {status:'IDLE'};
  const run=await db.collectorRun.create({data:{jobType:'stock-news-summary',provider:'PUBLIC_EVIDENCE',metadata:{policy:'stock-news-summary-v1',batchLimit:5,target:items.length}}});runId=run.id;
  let saved=0,unavailable=0,failed=0;const extract=options.extract??summaryExtractor(db,signal);
  for(const item of items){
   if(signal.aborted)break;
   let result:SummaryResult;try{result=await extract(item);}catch(e){const reason=e instanceof Error?e.message:'';result=none(/SOURCE_HTTP_40[13]|SOURCE_ACCESS_DENIED/.test(reason)?'BLOCKED':'RETRY',/SOURCE_HTTP_40[13]|SOURCE_ACCESS_DENIED/.test(reason)?'SOURCE_ACCESS_DENIED':'SOURCE_TEMPORARILY_UNAVAILABLE');}
   if(result.summary){const valid=contentSummary(result.summary,item.title);result=valid?{...result,summary:valid,status:'READY'}:none('NO_DATA','NO_VERIFIABLE_SUMMARY',result.source);}
   const terminal=result.status!=='RETRY'||item.summaryAttempts+1>=3;
   const retry=result.reason==='DART_SHARED_QUOTA'?new Date(seoulDay(now)+'T06:00:00+09:00').getTime()+86400000:now.getTime()+3600000;
   const written=await db.$transaction(async tx=>{
    const [lease]=await tx.$queryRaw<{owner_token:string;valid:number}[]>`SELECT owner_token,(locked_until>UTC_TIMESTAMP(3)) AS valid FROM collector_locks WHERE job_name=${job} FOR UPDATE`;
    if(lease?.owner_token!==owner||!lease.valid)throw Error('NEWS_SUMMARY_LEASE_LOST');
    const changed=await tx.stockNewsItem.updateMany({where:{id:item.id,summary:null,summaryAttempts:item.summaryAttempts},data:{summary:result.summary,summaryMethod:result.method,summaryStatus:result.status,summaryAttempts:{increment:1},summaryCheckedAt:now,summaryNextRetryAt:terminal?null:new Date(retry),summarySource:result.source,summaryReason:result.reason,...(result.access?{accessCondition:result.access}:{})}});
    if(changed.count)await tx.collectorRunItem.create({data:{runId:run.id,symbol:item.provider,status:result.summary?'SUCCESS':result.status==='RETRY'?'FAILED':'NO_DATA',message:result.summary?'공개 근거 요약 저장':result.reason,diagnostics:{newsId:String(item.id),summaryMethod:result.method,summaryStatus:result.status,terminal,attempt:item.summaryAttempts+1}}});
    return changed.count;
   });if(written){if(result.summary)saved++;else if(result.status==='RETRY')failed++;else unavailable++;}
  }
  const status=failed?'PARTIAL':'SUCCESS';await db.collectorRun.update({where:{id:run.id},data:{status,finishedAt:new Date(),successCount:saved,skippedCount:unavailable,failureCount:failed,metadata:{policy:'stock-news-summary-v1',batchLimit:5,target:items.length,saved,unavailable,failed,requestsBound:40,noAI:true}}});
  return {status,runId:String(run.id),targets:items.length,saved,unavailable,failed};
 }catch(e){if(runId)await db.collectorRun.updateMany({where:{id:runId,status:'RUNNING'},data:{status:'FAILED',finishedAt:new Date(),failureReason:'NEWS_SUMMARY_INTERRUPTED: restart resumes only pending or due retries'}});throw e;}
 finally{await repo.releaseLock(job,owner);}
}
