import {test} from 'node:test';
import assert from 'node:assert/strict';
import {naverNewsSource} from './naver-news.js';
import {canonicalUrl} from '@roxstock/shared/news/policy';
const target={id:1n,symbol:'005930',name:'삼성전자'};
const env={NAVER_NEWS_CLIENT_ID:'test-id',NAVER_NEWS_CLIENT_SECRET:'test-secret'};
const from=new Date('2026-10-21T00:00:00Z'),to=new Date('2026-10-21T12:00:00Z');
const row={title:'<b>삼성전자</b> 실적 발표',link:'https://n.news.naver.com/mnews/article/001/0012345678?sid=101',originallink:'https://publisher.example/article/1',description:'삼성전자의 영업이익과 매출이 전년보다 증가했습니다.',pubDate:'Wed, 21 Oct 2026 15:00:00 +0900'};
test('fixed endpoint, headers, API summary, relevance and deduplication',async()=>{
 let requests=0;
 const fetcher:typeof fetch=async(input,init)=>{
  requests++;const url=new URL(String(input));assert.equal(url.origin,'https://naverapihub.apigw.ntruss.com');assert.equal(url.searchParams.get('query'),'삼성전자');assert.equal(url.searchParams.get('sort'),'date');assert.ok(!url.href.includes('test-secret'));assert.equal((init!.headers as Record<string,string>)['X-NCP-APIGW-API-KEY'],'test-secret');assert.equal(init!.redirect,'error');
  return Response.json({total:3,items:[row,row,{...row,title:'다른회사 실적 발표'}]});
 };
 const result=await naverNewsSource(env,fetcher).collect([target],from,to);
 assert.equal(requests,1);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0]!.title,'삼성전자 실적 발표');assert.ok(result.candidates[0]!.summary);assert.equal(result.warnings.length,0);
});
test('missing description keeps title and marks the single API summary attempt',async()=>{
 const result=await naverNewsSource(env,async()=>Response.json({total:1,items:[{...row,description:''}]})).collect([target],from,to);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0]!.summary,null);assert.equal(result.candidates[0]!.summaryMethod,'NAVER_SEARCH_DESCRIPTION');
});
test('routine outlook and price-only news are not selected as major news',async()=>{
 const result=await naverNewsSource(env,async()=>Response.json({total:2,items:[{...row,title:'삼성전자 업황 전망'},{...row,title:'삼성전자 주가 급등 특징주'}]})).collect([target],from,to);
 assert.equal(result.candidates.length,0);
});
test('unconfigured, authentication, quota and network failures never retry or leak bodies',async()=>{
 let calls=0;const none=await naverNewsSource({},async()=>{calls++;throw Error('unexpected');}).collect([target],from,to);assert.equal(calls,0);assert.deepEqual(none.warnings,['NAVER_CONFIG_MISSING']);
 for(const status of [401,403,429,500]){calls=0;const result=await naverNewsSource(env,async()=>{calls++;return new Response('test-secret',{status});}).collect([target,target],from,to);assert.equal(calls,1);assert.equal(result.available,false);assert.ok(!JSON.stringify(result).includes('test-secret'));}
 const failed=await naverNewsSource(env,async()=>{throw Error('test-secret');}).collect([target],from,to);assert.deepEqual(failed.warnings,['NAVER_API_FAILED']);
});
test('body bound and malformed response handled without article fetch',async()=>{
 for(const body of ['x'.repeat(1000001),'{bad',JSON.stringify({total:1,items:[null]})]){
  const result=await naverNewsSource(env,async()=>new Response(body)).collect([target],from,to);assert.equal(result.candidates.length,0);assert.ok(result.warnings.length);
 }
});
test('pagination stops at the requested date and unsupported links stay excluded',async()=>{
 let calls=0;const result=await naverNewsSource(env,async()=>{calls++;return Response.json({total:1000,items:[{...row,pubDate:'Tue, 20 Oct 2026 10:00:00 +0900'}]});}).collect([target],from,to);assert.equal(calls,1);assert.equal(result.candidates.length,0);
 const unsupported=await naverNewsSource(env,async()=>Response.json({total:1,items:[{...row,link:'https://evil.example/x'}]})).collect([target],from,to);assert.equal(unsupported.candidates.length,0);assert.ok(unsupported.warnings.includes('NAVER_UNSUPPORTED_LINK'));
});
test('Naver canonical identity accepts only exact article hosts and paths',()=>{
 assert.equal(canonicalUrl('https://news.naver.com/main/read.naver?oid=001&aid=0012345678'),canonicalUrl(row.link));
 for(const url of ['https://n.news.naver.com.evil.org/mnews/article/001/0012345678','https://n.news.naver.com/redirect?url=https://evil.example','http://n.news.naver.com/mnews/article/001/0012345678'])assert.throws(()=>canonicalUrl(url));
});
