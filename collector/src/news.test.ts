import test from 'node:test';
import assert from 'node:assert/strict';
import {NewsHttp,parseReports,parseRss,publicDescription} from './news-providers.js';
const targets=[{id:1n,symbol:'005930',name:'삼성전자'},{id:2n,symbol:'005380',name:'현대자동차'}],from=new Date('2026-10-18T15:00:00Z'),to=new Date('2026-10-19T06:00:00Z');
const rss=(title:string,url='https://www.hankyung.com/article/202610190001',date='Mon, 19 Oct 2026 10:00:00 +0900')=>`<?xml version="1.0"?><rss><channel><item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate></item></channel></rss>`;
test('RSS source identity, exact related stock and publication window; malformed input is not zero news',()=>{
 const rows=parseRss(rss('삼성전자 실적 전망 변경'),targets,'HANKYUNG_RSS',from,to);assert.equal(rows.length,1);assert.deepEqual(rows[0]!.securityIds,[1n]);assert.equal(rows[0]!.accessCondition,'UNKNOWN');assert.equal(rows[0]!.summary,null);
 assert.equal(parseRss(rss('삼성전자 실적 전망 변경',undefined,'Sat, 17 Oct 2026 10:00:00 +0900'),targets,'HANKYUNG_RSS',from,to).length,0);
 assert.equal(parseRss(rss('삼성전자서비스 홍보 이벤트'),targets,'HANKYUNG_RSS',from,to).length,0);
 const filing=parseRss(rss('(유가)현대차 - 단일판매ㆍ공급계약체결','https://dart.fss.or.kr/api/link.jsp?rcpNo=20261019000001'),targets,'DART',from,to)[0]!;assert.equal(filing.materialType,'DISCLOSURE');assert.equal(filing.accessCondition,'FREE');assert.deepEqual(filing.securityIds,[2n]);
 assert.throws(()=>parseRss('<html>접근 불가</html>',targets,'DART',from,to));assert.throws(()=>parseRss('<!DOCTYPE x [<!ENTITY a "x">]>'+rss('a'),targets,'DART',from,to));
});
test('report metadata keeps publication date precision and never turns a repeated title into a summary',()=>{
 const row=`<table><tbody><tr><td>2026-10-19</td><td>기업</td><td><a href="/analysis/downpdf?report_idx=12">삼성전자(005930) 실적 전망 변경</a><li>실적 전망 변경</li></td><td>연구원</td><td>검증증권</td><td>PDF</td></tr></tbody></table>`;
 const item=parseReports(row,targets,from,to)[0]!;assert.equal(item.materialType,'REPORT');assert.equal(item.summary,null);assert.equal(item.publishedPrecision,'DATE');assert.equal(item.sourceName,'검증증권');assert.equal(item.accessCondition,'UNKNOWN');assert.ok(item.originalUrl.endsWith('report_idx=12'));
 assert.equal(publicDescription('<meta property="og:description" content="공개된 사업 변화 설명">'),'공개된 사업 변화 설명');
 assert.throws(()=>parseReports('로그인 화면',targets,from,to));
});
test('public HTTP reader cancels at head and rejects PDF/redirects without storing or reading body',async()=>{
 let bodyRead=0;
 const http=new NewsHttp(undefined,(async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('<head><meta name="description" content="public"></head>'));},cancel(){bodyRead++;}}),{headers:{'Content-Type':'text/html'}})) as typeof fetch,0);
 assert.match(await http.text('https://www.hankyung.com/article/1',65536,true),/description/);assert.equal(bodyRead,1);
 await assert.rejects(()=>http.text('https://internal.invalid/secret'));
});
