import {canonicalUrl,contentSummary,importance,plainText,relatedTargets,type NewsCandidate} from '@roxstock/shared/news/policy';
import type {NewsSource,ProviderResult} from './news-providers.js';

/** Credentials go only to this fixed endpoint; article URLs are never fetched here. */
export function naverNewsSource(env:NodeJS.ProcessEnv=process.env,fetchFn:typeof fetch=fetch):NewsSource {
 return {id:'NAVER_NEWS',collect:async(targets,from,to,signal)=>{
  const result:ProviderResult={provider:'NAVER_NEWS',candidates:[],warnings:[],requests:0,diagnostics:{}};
  const id=env.NAVER_NEWS_CLIENT_ID?.trim(),secret=env.NAVER_NEWS_CLIENT_SECRET?.trim();
  if(!id||!secret)return {...result,available:false,warnings:['NAVER_CONFIG_MISSING']};
  const seen=new Set<string>();let readable=0;
  for(const target of targets){
   let covered=false;
   for(let start=1;start<=901;start+=100){
    if(result.requests>=180){result.warnings.push('NAVER_REQUEST_BOUND');break;}
    const url=new URL('https://naverapihub.apigw.ntruss.com/search/v1/news');
    url.search=new URLSearchParams({query:target.name,display:'100',start:String(start),sort:'date'}).toString();
    result.requests++;
    try{
     const response=await fetchFn(url,{headers:{'X-NCP-APIGW-API-KEY-ID':id,'X-NCP-APIGW-API-KEY':secret,Accept:'application/json'},redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])});
     if(!response.ok){await response.body?.cancel();throw Error(response.status===429?'NAVER_QUOTA':response.status===401||response.status===403?'NAVER_AUTH_FAILED':'NAVER_API_FAILED');}
     const reader=response.body?.getReader();if(!reader)throw Error('NAVER_API_FAILED');
     let text='',bytes=0;const decoder=new TextDecoder();
     try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1000000){await reader.cancel();throw Error('NAVER_RESPONSE_BOUND');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
     const data=JSON.parse(text) as {total?:number;items?:unknown[]};
     if(!Array.isArray(data.items)||data.items.length>100||!Number.isSafeInteger(data.total)||data.total!<0)throw Error('NAVER_PARSE_FAILED');
     readable++;let oldest=Infinity,invalid=false;
     for(const raw of data.items){
      const item=raw as Record<string,unknown>;
      if(!item||typeof item.title!=='string'||typeof item.pubDate!=='string'){invalid=true;continue;}
      const publishedAt=new Date(item.pubDate);if(!Number.isFinite(+publishedAt)){invalid=true;continue;}oldest=Math.min(oldest,+publishedAt);
      const title=plainText(item.title).slice(0,500),securityIds=relatedTargets(title,targets),priority=importance(title,'ARTICLE');
      if(!title||publishedAt<from||publishedAt>to||!securityIds.length||priority<2||/특징주|종목NO|기념행사|기념전시|인수\s*\d+년/.test(title))continue;
      let originalUrl:string|undefined;
      // Prefer a trusted publisher URL, otherwise the exact Naver article URL. No generic host bypass.
      for(const field of ['originallink','link'])try{if(typeof item[field]==='string'){originalUrl=canonicalUrl(item[field] as string);break;}}catch{/* Unsupported publisher: try the Naver article link. */}
      if(!originalUrl){result.diagnostics!.unsupportedLinks=(result.diagnostics!.unsupportedLinks??0)+1;continue;}
      if(seen.has(originalUrl))continue;seen.add(originalUrl);
      result.candidates.push({provider:'NAVER_NEWS',providerId:originalUrl,title,originalUrl,sourceName:new URL(originalUrl).hostname==='www.hankyung.com'?'한국경제':'네이버 뉴스',publishedAt,publishedPrecision:'TIME',materialType:'ARTICLE',accessCondition:'UNKNOWN',summary:contentSummary(typeof item.description==='string'?item.description:null,title),summaryMethod:'NAVER_SEARCH_DESCRIPTION',securityIds,priority} satisfies NewsCandidate);
     }
     if(invalid)result.warnings.push('NAVER_PARSE_FAILED');
     if(oldest<=+from||start+data.items.length>data.total!||data.items.length===0){covered=!invalid;break;}
    }catch(error){
     const code=error instanceof Error&&/^NAVER_[A-Z_]+$/.test(error.message)?error.message:'NAVER_API_FAILED';
     result.warnings.push(code);result.available=readable>0;
     // Never retry a failed request or continue sending credentials after auth/quota/network errors.
     return result;
    }
   }
   if(!covered){result.warnings.push('NAVER_WINDOW_LIMIT');(result.gaps??=[]).push({from:from.toISOString(),to:to.toISOString(),reason:'NAVER_SEARCH_WINDOW_LIMIT',section:target.symbol});}
   if(result.requests>=180)break;
  }
  if(result.diagnostics!.unsupportedLinks)result.warnings.push('NAVER_UNSUPPORTED_LINK');
  result.warnings=[...new Set(result.warnings)];return result;
 }};
}
