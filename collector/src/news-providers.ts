import type {PrismaClient} from '@roxstock/shared/prisma';
import {reportTargetIds} from './news-report-identity.js';
import {canonicalUrl,contentSummary,importance,kstStart,plainText,relatedTargets,seoulDay,type NewsCandidate,type NewsTarget} from '@roxstock/shared/news/policy';
import {loadCollectorConfig} from '@roxstock/shared/collection/config';
import {withFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {OpenDartProvider,DartApiError} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import {randomUUID} from 'node:crypto';
import {naverNewsSource} from './naver-news.js';
export type ProviderResult={provider:string;candidates:NewsCandidate[];warnings:string[];requests:number;available?:boolean;diagnostics?:Record<string,number>;gaps?:{from:string;to:string;reason:string;section?:string}[];normalExcluded?:number};
export type NewsSource={id:string;collect:(targets:NewsTarget[],from:Date,to:Date,signal?:AbortSignal,requiredFrom?:Date)=>Promise<ProviderResult>};
const sleep=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{if(signal?.aborted)return reject(Error('ABORTED'));const t=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);const abort=()=>{clearTimeout(t);reject(Error('ABORTED'));};signal?.addEventListener('abort',abort,{once:true});});
/** Only bounded public metadata responses; never download research PDFs or persist article HTML. */
export class NewsHttp {
 requests=0;private last=new Map<string,number>();
 constructor(private signal?:AbortSignal,private fetchFn:typeof fetch=fetch,private delay=1000,private maxAttempts=2){}
 async text(raw:string,maxBytes=1000000,headOnly=false){
  const url=new URL(raw);if(!['www.hankyung.com','consensus.hankyung.com','dart.fss.or.kr'].includes(url.hostname)||url.protocol!=='https:')throw Error('SOURCE_URL_REJECTED');
  let lastError:unknown;
  for(let attempt=0;attempt<this.maxAttempts;attempt++){
   if(this.requests>=180)throw Error('NEWS_REQUEST_BOUND');
   const wait=this.delay-(Date.now()-(this.last.get(url.hostname)??0));if(wait>0)await sleep(wait,this.signal);
   this.requests++;this.last.set(url.hostname,Date.now());
   try{
    const response=await this.fetchFn(url,{headers:{'User-Agent':'RoxStock/1.0 (public metadata reader)','Accept':headOnly?'text/html':'application/rss+xml, text/xml, text/html'},redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(15000),...(this.signal?[this.signal]:[])])});
    if(!response.ok)throw Error('SOURCE_HTTP_'+response.status);
    if(/application\/pdf/i.test(response.headers.get('content-type')??''))throw Error('PDF_BODY_NOT_COLLECTED');
    const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_SOURCE_BODY');let size=0;const decoder=new TextDecoder();let result='';
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();if(headOnly)return result;throw Error('SOURCE_SIZE_BOUND');}result+=decoder.decode(value,{stream:true});if(headOnly&&/<\/head\s*>/i.test(result)){await reader.cancel();return result.split(/<\/head\s*>/i)[0]!;}}}finally{reader.releaseLock();}
    if(/Block access|Access Denied/i.test(result.slice(0,500)))throw Error('SOURCE_ACCESS_DENIED');
    if(!result.trim()||/Site Unavailable|로그인이 필요/.test(result.slice(0,500)))throw Error('SOURCE_UNAVAILABLE');return result;
   }catch(e){lastError=e;if(e instanceof Error&&/SOURCE_ACCESS_DENIED|SOURCE_HTTP_40[134]|PDF_BODY/.test(e.message))throw e;if(this.signal?.aborted)throw e;if(attempt+1<this.maxAttempts)await sleep(2000,this.signal);}
  }throw lastError;
 }
}
const tag=(xml:string,name:string)=>plainText(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i').exec(xml)?.[1]??'');
export function rssItemDates(xml:string){return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m=>new Date(tag(m[1]!,'pubDate')||tag(m[1]!,'dc:date')).getTime()).filter(Number.isFinite);}
export function parseRss(xml:string,targets:NewsTarget[],provider:string,from:Date,to:Date,diagnostics:Record<string,number>={rawParsed:0,periodPassed:0,securityMatched:0,selectionExcluded:0}):NewsCandidate[]{
 if(!/<rss\b/i.test(xml)||!/<channel\b/i.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('INVALID_RSS');
 const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
 return items.flatMap(match=>{
  diagnostics.rawParsed=(diagnostics.rawParsed??0)+1;
  const item=match[1]!,title=tag(item,'title'),rawUrl=tag(item,'link'),date=tag(item,'pubDate')||tag(item,'dc:date'),publishedAt=new Date(date),securityIds=relatedTargets(title,targets);
  if(!title||!Number.isFinite(publishedAt.getTime()))throw Error('INVALID_RSS_METADATA');
  if(publishedAt<from||publishedAt>to)return [];diagnostics.periodPassed=(diagnostics.periodPassed??0)+1;if(!securityIds.length){diagnostics.irrelevant=(diagnostics.irrelevant??0)+1;return [];}diagnostics.securityMatched=(diagnostics.securityMatched??0)+1;
  const originalUrl=canonicalUrl(rawUrl),materialType=provider==='DART'?'DISCLOSURE':'ARTICLE',priority=importance(title,materialType);if(!priority){diagnostics.selectionExcluded=(diagnostics.selectionExcluded??0)+1;return [];}
  return [{provider,providerId:provider==='DART'?new URL(originalUrl).searchParams.get('rcpNo')!:originalUrl,title:title.slice(0,500),originalUrl,sourceName:provider==='DART'?'전자공시 DART':'한국경제',publishedAt,publishedPrecision:'TIME',materialType,priority,accessCondition:provider==='DART'?'FREE':'UNKNOWN',summary:contentSummary(tag(item,'description'),title),summaryMethod:tag(item,'description')?'PUBLIC_FEED_DESCRIPTION':'NONE',securityIds} as NewsCandidate];
 });
}
export function parseReports(html:string,targets:NewsTarget[],from:Date,to:Date,diagnostics:Record<string,number>={rawParsed:0,periodPassed:0,securityMatched:0,selectionExcluded:0}):NewsCandidate[]{
 if(!/<tbody\b/i.test(html)||!html.includes('report_idx')){
  if(/검색.*결과.*없|데이터.*없/.test(plainText(html)))return [];throw Error('INVALID_REPORT_LIST');
 }
 return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(match=>{
  const row=match[1]!,cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]!);
  if(cells.length<6)return [];const title=plainText(/<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(cells[2]!)?.[1]??'');
  diagnostics.rawParsed=(diagnostics.rawParsed??0)+1;
  const reportId=/report_idx=(\d+)/.exec(row)?.[1],day=plainText(cells[0]!);if(!reportId||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!title)throw Error('INVALID_REPORT_METADATA');
  const publishedAt=kstStart(day),securityIds=reportTargetIds(title,targets);if(day<seoulDay(from)||publishedAt>to)return [];diagnostics.periodPassed=(diagnostics.periodPassed??0)+1;if(!securityIds.length){diagnostics.irrelevant=(diagnostics.irrelevant??0)+1;return [];}diagnostics.securityMatched=(diagnostics.securityMatched??0)+1;
  const sourceName=plainText(cells[4]!).slice(0,120),snippets=[...cells[2]!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>plainText(m[1]!));
  const shortTitle=title.replace(/^.*?\(\d{6}\)\s*/,''),evidence=snippets.filter(s=>s!==title&&s!==shortTitle).join(' '),summary=contentSummary(evidence,title),priority=importance(title,'REPORT');if(!priority)return [];
  return [{provider:'HANKYUNG_CONSENSUS',providerId:reportId,title:title.slice(0,500),originalUrl:canonicalUrl('https://consensus.hankyung.com/analysis/downpdf?report_idx='+reportId),sourceName,publishedAt,publishedPrecision:'DATE',materialType:'REPORT',priority,accessCondition:'UNKNOWN',summary,summaryMethod:summary?'PUBLIC_REPORT_ABSTRACT':'NONE',securityIds} as NewsCandidate];
 });
}
export function publicDescription(head:string){
 for(const m of head.matchAll(/<meta\b[^>]*>/gi)){
  const attrs=Object.fromEntries([...m[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(a=>[a[1]!.toLowerCase(),a[3]!]));
  if((attrs.property??attrs.name)==='og:description'||attrs.name==='description')return attrs.content??null;
 }return null;
}
export function defaultNewsSources(db:PrismaClient):NewsSource[]{
 return [
  ...(process.env.NAVER_NEWS_ENABLED==='true'?[naverNewsSource()]:[]),
  {id:'HANKYUNG_RSS',collect:async(targets,from,to,signal,requiredFrom)=>{
   const http=new NewsHttp(signal),candidates:NewsCandidate[]=[],warnings:string[]=[],diagnostics:Record<string,number>={rawParsed:0,periodPassed:0,securityMatched:0,selectionExcluded:0},gaps:NonNullable<ProviderResult['gaps']>=[];let readable=0;
   for(const section of ['finance','economy','it'])try{
    const xml=await http.text('https://www.hankyung.com/feed/'+section);
    try{candidates.push(...parseRss(xml,targets,'HANKYUNG_RSS',from,to,diagnostics));}catch{warnings.push('FEED_'+section.toUpperCase()+'_PARSE_FAILED');continue;}
    readable++;
    // Channel pubDate is not an article. Only valid item publication times define coverage.
    const dates=rssItemDates(xml),lower=(requiredFrom??from).getTime();
    if(dates.length>=50&&Math.min(...dates)>lower){warnings.push('FEED_'+section.toUpperCase()+'_WINDOW_LIMIT');gaps.push({from:new Date(lower).toISOString(),to:new Date(Math.min(...dates)).toISOString(),reason:'RSS_RETENTION_LIMIT_NO_BACKFILL_ROUTE',section});}
   }catch{warnings.push('FEED_'+section.toUpperCase()+'_UNAVAILABLE');}
   return {provider:'HANKYUNG_RSS',candidates,warnings,requests:http.requests,available:readable>0,diagnostics,gaps};
  }},
  {id:'HANKYUNG_CONSENSUS',collect:async(targets,from,to,signal)=>{const http=new NewsHttp(signal),candidates:NewsCandidate[]=[],diagnostics:Record<string,number>={rawParsed:0,periodPassed:0,securityMatched:0,selectionExcluded:0};for(let page=1;page<=8;page++){
   const url='https://consensus.hankyung.com/analysis/list?'+new URLSearchParams({sdate:seoulDay(from),edate:seoulDay(to),now_page:String(page),pagenum:'80',report_type:'',search_value:''});
   let html:string;try{html=await http.text(url);candidates.push(...parseReports(html,targets,from,to,diagnostics));}catch{return {provider:'HANKYUNG_CONSENSUS',candidates,diagnostics,warnings:['REPORT_PAGE_UNAVAILABLE'],requests:http.requests,available:page>1};}
   const pages=[...html.matchAll(/now_page=(\d+)/g)].map(m=>Number(m[1]));if(Math.max(1,...pages)<=page)return {provider:'HANKYUNG_CONSENSUS',candidates,diagnostics,warnings:[],requests:http.requests};
  }return {provider:'HANKYUNG_CONSENSUS',candidates,diagnostics,warnings:['REPORT_PAGE_BOUND'],requests:http.requests};}},
  {id:'DART',collect:async(targets,from,to,signal)=>{
   const http=new NewsHttp(signal),candidates:NewsCandidate[]=[],warnings:string[]=[],diagnostics:Record<string,number>={rawParsed:0,periodPassed:0,securityMatched:0,selectionExcluded:0};const corporate=targets.filter(t=>!['ETF','ETN'].includes(t.securityType??'STOCK')),excluded=targets.length-corporate.length,mapped=corporate.filter(t=>t.corpCode),missing=corporate.filter(t=>!t.corpCode);if(excluded)warnings.push('NORMAL_EXCLUDED:'+excluded);if(missing.length)warnings.push('CORP_MAPPING_MISSING:'+missing.length);if(!mapped.length)return {provider:'DART',candidates,warnings,requests:0,normalExcluded:excluded,diagnostics:{...diagnostics,normalExcluded:excluded,mappingMissing:missing.length,corporateTargets:corporate.length}};
   // Public RSS improves publication time precision; Open DART fills its short lookback window.
   for(const target of mapped){try{const xml=await http.text('https://dart.fss.or.kr/api/companyRSS.xml?crpCd='+target.corpCode);candidates.push(...parseRss(xml,targets,'DART',from,to,diagnostics));}catch{warnings.push('RSS_UNAVAILABLE:'+target.symbol);}}
   const config=loadCollectorConfig(),repo=new PrismaDartRepository(db),state=await repo.getState(),owner=randomUUID();
   const limit=state?.backfillCompletedAt?config.dartDailyCallLimit:config.dartBackfillDailyCallLimit,delay=state?.backfillCompletedAt?config.dartMinDelayMs:config.dartBackfillMinDelayMs;
   const manual=()=>db.collectorRun.findFirst({where:{jobType:'dart-financial-statements',status:'RUNNING',metadata:{path:'$.phase',equals:'MANUAL'}},select:{id:true}});
   const quotaBlocked=state?.lastRunAt&&seoulDay(state.lastRunAt)===seoulDay(to)&&/^(020|DAILY_CALL_LIMIT)(?::|$)/.test(state.lastError??'');
   if(!config.dartEnabled||!process.env.DART_API_KEY||quotaBlocked||((await repo.getDailyUsage(to))?.apiCallCount??0)>=limit){warnings.push('DART_API_UNAVAILABLE_OR_QUOTA');return {provider:'DART',candidates,warnings,diagnostics:{...diagnostics,normalExcluded:excluded,mappingMissing:missing.length,corporateTargets:corporate.length},requests:http.requests,available:candidates.length>0};}
   if(await manual()||!await repo.acquireLock(owner,90)){warnings.push('DART_YIELDED_TO_EXISTING_WORK');return {provider:'DART',candidates,warnings,diagnostics:{...diagnostics,normalExcluded:excluded,mappingMissing:missing.length,corporateTargets:corporate.length},requests:http.requests,available:candidates.length>0};}
   let calls=0,apiCompleted=false;
   try{await sleep(delay,signal);await withFinancialLease(owner,async()=>{
    // The financial worker may have exhausted the shared budget before this lease was acquired.
    const current=await repo.getState(),usage=await repo.getDailyUsage(new Date());
    if((current?.lastRunAt&&seoulDay(current.lastRunAt)===seoulDay(new Date())&&/^(020|DAILY_CALL_LIMIT)(?::|$)/.test(current.lastError??''))||(usage?.apiCallCount??0)>=limit)throw new DartApiError('DAILY_CALL_LIMIT','Existing DART daily budget is exhausted.');
    const provider=new OpenDartProvider({apiKey:process.env.DART_API_KEY!,dailyCallLimit:limit,minDelayMs:delay,reserveCall:async l=>{if(signal?.aborted||calls>=100)throw new DartApiError('NEWS_CALL_BOUND','News collection request bound.');if(await manual())throw new DartApiError('NEWS_MANUAL_PRIORITY','Yield to manual financial request.');calls++;return repo.reserveApiCall(l,new Date(),owner);},onApiStatus:async status=>{await repo.recordApiResult(status==='013'?'NO_DATA':'ERROR');if(status==='020')await db.dartCollectorState.update({where:{id:1},data:{lastError:'020: DART quota confirmed by news metadata request'}});}});
    for(const target of mapped){const rows=await provider.listNewsDisclosures(target.corpCode!,seoulDay(from).replaceAll('-',''),seoulDay(to).replaceAll('-',''));
     for(const row of rows){diagnostics.rawParsed=(diagnostics.rawParsed??0)+1;diagnostics.periodPassed=(diagnostics.periodPassed??0)+1;diagnostics.securityMatched=(diagnostics.securityMatched??0)+1;const receipt=row.rcept_no!,day=row.rcept_dt!,publishedAt=kstStart(day.slice(0,4)+'-'+day.slice(4,6)+'-'+day.slice(6)),title=target.name+' - '+row.report_nm,priority=importance(title,'DISCLOSURE');if(!priority)continue;
      candidates.push({provider:'DART',providerId:receipt,title:title.slice(0,500),originalUrl:canonicalUrl('https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt),sourceName:'전자공시 DART',publishedAt,publishedPrecision:'DATE',materialType:'DISCLOSURE',priority,accessCondition:'FREE',summary:null,summaryMethod:'NONE',securityIds:[target.id]});}
    }
   });apiCompleted=true;}catch(error){warnings.push(error instanceof DartApiError?error.code:'DART_API_FAILED');}finally{await repo.releaseLock(owner);}
   return {provider:'DART',candidates,warnings,diagnostics:{...diagnostics,normalExcluded:excluded,mappingMissing:missing.length,corporateTargets:corporate.length},requests:http.requests+calls,available:apiCompleted||candidates.length>0};
  }},
 ];
}
