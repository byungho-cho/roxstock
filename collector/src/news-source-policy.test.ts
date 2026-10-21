import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateKeys,selectNews,type NewsCandidate} from '@roxstock/shared/news/policy';
import {naverArticlesSufficient} from './news-source-policy.js';
const now=new Date('2026-10-21T10:00:00Z');
const make=(i:number):NewsCandidate=>({provider:'NAVER_NEWS',providerId:String(i),title:'검증 회사 실적 발표 '+i,originalUrl:'https://www.hankyung.com/article/'+i,sourceName:'test',publishedAt:now,publishedPrecision:'TIME',materialType:'ARTICLE',priority:2,accessCondition:'UNKNOWN',summary:null,summaryMethod:'NAVER_SEARCH_DESCRIPTION',securityIds:[1n]});
test('skip secondary article sources only when five new Naver articles are available',()=>{
 const rows=Array.from({length:5},(_,i)=>make(i));assert.equal(naverArticlesSufficient(rows,new Set(),now),true);
 assert.equal(naverArticlesSufficient(rows.slice(0,4),new Set(),now),false);
 assert.equal(naverArticlesSufficient(rows,new Set([candidateKeys(rows[0]!).canonicalHash]),now),false);
 assert.equal(naverArticlesSufficient([...rows.slice(0,4),rows[0]!],new Set(),now),false);
 assert.equal(naverArticlesSufficient(rows.map(r=>({...r,publishedAt:new Date('2026-10-01')})),new Set(),now),false);
 assert.equal(naverArticlesSufficient([],new Set(),now),false);
});
test('Naver wins among equally important articles while held securities remain first',()=>{
 const naver=make(1),secondary={...make(2),provider:'HANKYUNG_RSS',publishedAt:new Date(+now+1)};
 assert.equal(selectNews([secondary,naver])[0]!.provider,'NAVER_NEWS');
 assert.equal(selectNews([{...secondary,securityIds:[2n]},naver],new Set(),new Set([2n]))[0]!.provider,'HANKYUNG_RSS');
});
