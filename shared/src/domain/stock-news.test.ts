import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateKeys,canonicalUrl,contentSummary,importance,relatedTargets,selectNews,type NewsCandidate} from '../news/policy.js';
const make=(n:number,priority=1):NewsCandidate=>({provider:'TEST',providerId:String(n),title:'회사 실적 전망 '+n,originalUrl:'https://www.hankyung.com/article/'+n,sourceName:'test',publishedAt:new Date('2026-10-19T03:00:00Z'),publishedPrecision:'TIME',materialType:'ARTICLE',priority,accessCondition:'UNKNOWN',summary:null,summaryMethod:'NONE',securityIds:[1n]});
test('news canonical links, provider/transfer duplicates, stable priority and no forced filling',()=>{
 assert.equal(canonicalUrl('https://www.hankyung.com/article/1?utm_source=x#fragment'),'https://www.hankyung.com/article/1');
 assert.equal(canonicalUrl('https://dart.fss.or.kr/api/link.jsp?rcpNo=20261019000001'),'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261019000001');
 for(const u of ['javascript:alert(1)','https://www.hankyung.com.evil.org/article/1','https://user:pass@www.hankyung.com/article/1','https://www.hankyung.com:4000/article/1'])assert.throws(()=>canonicalUrl(u));
 const rows=Array.from({length:20},(_,i)=>make(i,i<12?2:1));assert.equal(selectNews(rows).length,5);assert.ok(selectNews(rows).every(x=>x.priority===2));
 const one=make(1);assert.equal(selectNews([one,{...make(2),providerId:one.providerId}]).length,1);assert.equal(selectNews([one,{...one,providerId:'other',originalUrl:one.originalUrl+'?utm_medium=x'}]).length,1);
 assert.equal(selectNews([make(1),make(2)]).length,2);assert.deepEqual(selectNews([make(2),make(1,2)]).map(r=>r.providerId),['1','2']);
});
test('summary is evidence-only, Unicode-safe, <=300 with unknown access untouched',()=>{
 assert.equal(contentSummary(null),null);assert.equal(contentSummary('실적 전망 점검','실적 전망 점검'),null);
 const evidence='회사는 전년 동기 대비 실적 변화를 공개했습니다. '+ '원문에서 확인되는 사업 부문별 매출과 투자 계획을 안내합니다. '.repeat(20)+'😀';
 const result=contentSummary(evidence)!;assert.ok([...result].length<=300);assert.ok(result.startsWith('회사는'));assert.ok(!result.includes('디자인'));
 assert.equal(importance('삼성전자 주가 급락 특징주','ARTICLE'),0);assert.equal(importance('삼성전자 잠정실적 발표','DISCLOSURE'),2);
 assert.deepEqual(relatedTargets('현대차는 실적 전망을 발표',[]),[]);
 assert.deepEqual(relatedTargets('현대차는 실적 전망을 발표',[{id:1n,symbol:'005380',name:'현대자동차'},{id:2n,symbol:'005930',name:'삼성전자'}]),[1n]);
 assert.deepEqual(relatedTargets('삼성전자서비스 홍보 이벤트',[{id:2n,symbol:'005930',name:'삼성전자'}]),[]);
});
test('current holdings rank before watchlist news, then importance and recency',()=>{
 const held={...make(1,1),securityIds:[2n]},watched={...make(2,2),publishedAt:new Date('2026-10-20')};
 assert.deepEqual(selectNews([watched,held],new Set(),new Set([2n])).map(r=>r.providerId),['1','2']);
});
test('each collection selects at most five, with no accumulated daily cap',()=>{
 const rows=Array.from({length:18},(_,i)=>make(i,2)),existing=new Set<string>();let saved=0;
 for(let run=0;run<4;run++){
  const selected=selectNews(rows,existing);assert.ok(selected.length<=5);saved+=selected.length;
  for(const c of selected)existing.add(candidateKeys(c).canonicalHash);
 }
 assert.equal(saved,18);
});
test('article and report limits are independent, all eligible disclosures are retained',()=>{
 const rows=Array.from({length:18},(_,i)=>make(i,2));
 const candidates=rows.flatMap((r,i)=>[r,{...make(100+i,2),materialType:'REPORT' as const},{...make(200+i,2),materialType:'DISCLOSURE' as const}]);
 const selected=selectNews(candidates);
 assert.equal(selected.filter(r=>r.materialType==='ARTICLE').length,5);
 assert.equal(selected.filter(r=>r.materialType==='REPORT').length,5);
 assert.equal(selected.filter(r=>r.materialType==='DISCLOSURE').length,18);
 assert.equal(selected.length,28);
});
