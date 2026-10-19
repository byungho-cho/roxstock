import test from 'node:test';
import {deflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {contentSummary} from '@roxstock/shared/news/policy';
import {publicArticleBody,summaryExtractor,dartDocumentText} from './news-summary.js';
const evidence='회사는 매출액 12,345.67억원과 영업이익률 -3.25%를 공개했습니다. 올해 투자 계획은 500억원입니다.';
const base={id:1n,provider:'HANKYUNG_RSS',providerId:'1',title:'검증 회사 실적 전망',originalUrl:'https://www.hankyung.com/article/202610190001',materialType:'ARTICLE',accessCondition:'UNKNOWN',publishedAt:new Date('2026-10-19T03:00:00Z'),securities:[{security:{id:1n,symbol:'005930',name:'삼성전자'}}]};
test('extractive summary removes title, ad, reporter and disclaimer; preserves numbers and short evidence',()=>{
 const text=contentSummary(base.title+'. 광고 문의는 담당자에게 연락해 주세요. '+evidence+' 기자=홍길동 news@example.com. 무단 전재 및 재배포 금지.',base.title)!;
 assert.equal(text,evidence);assert.equal(contentSummary('회사는 신규 공장 증설을 발표했습니다.'),'회사는 신규 공장 증설을 발표했습니다.');
 assert.ok([...contentSummary((evidence+' ').repeat(20))!].length<=300);
 const long=contentSummary('핵심 사업의 전망을 안내합니다 '.repeat(30)+'12,345.67억원입니다.')!;assert.ok([...long].length<=300);assert.ok(!/12,345\.$/.test(long));
 assert.equal(contentSummary('<script>광고</script>'+base.title,base.title),null);
});
test('only known public article body is extracted; paywall content is not used',()=>{
 assert.ok(publicArticleBody('<div id="article-body"><p>'+evidence+'</p><aside>광고 문구입니다.</aside></div></body>')?.includes(evidence));
 assert.equal(publicArticleBody('<div id="article-body">본문</div><script>{"isAccessibleForFree":false}</script></body>'),null);
 assert.ok(!publicArticleBody('<div id="article-body"><div class="ad-area">잘못된 수치 999억원입니다.</div><p>'+evidence+'</p></div></body>')?.includes('999억원'));
 assert.equal(publicArticleBody('<nav>메뉴만 있는 화면입니다.</nav>'),null);
});
test('provider introduction wins; public body fallback, paid intro and unknown access remain separate',async()=>{
 const signal=new AbortController().signal;let bodyRead=false;
 const extract=(html:string)=>summaryExtractor({} as any,signal,{text:async(_u,_b,head)=>{bodyRead=!head;return html;}});
 const intro=await extract('<head><meta property="og:description" content="'+evidence+'"></head><body></body>')(base);assert.equal(intro.method,'PUBLIC_DESCRIPTION_EXTRACT');assert.equal(intro.access,'UNKNOWN');
 const body=await extract('<head></head><body><div id="article-body"><p>'+evidence+'</p></div></body>')(base);assert.equal(body.method,'PUBLIC_BODY_SENTENCES');assert.equal(body.summary,evidence);
 const paid=await extract('<head><meta name="description" content="'+evidence+'"></head>')({...base,accessCondition:'PAID'});assert.equal(paid.summary,evidence);assert.equal(bodyRead,false);
 const noIntro=await extract('<head></head><body><div id="article-body">'+evidence+'</div></body>')({...base,accessCondition:'PAID'});assert.equal(noIntro.status,'NO_DATA');assert.equal(noIntro.summary,null);
});
test('report metadata is bounded and reused; no PDF fetching and repeated title is not summary',async()=>{
 let calls=0;const html='<table><tbody><tr><td>2026-10-19</td><td>기업</td><td><a>삼성전자(005930) 실적 전망</a><li>'+evidence+'</li></td><td>기자</td><td>증권사</td><td><a href="/analysis/downpdf?report_idx=12">PDF</a></td></tr></tbody></table>';
 const extract=summaryExtractor({} as any,new AbortController().signal,{text:async url=>{calls++;assert.ok(url.includes('/analysis/list?'));return html;}});
 const item={...base,provider:'HANKYUNG_CONSENSUS',providerId:'12',materialType:'REPORT',title:'삼성전자(005930) 실적 전망',originalUrl:'https://consensus.hankyung.com/analysis/downpdf?report_idx=12'};
 assert.equal((await extract(item)).summary,evidence);await extract(item);assert.equal(calls,1);
});
test('DART archive rejects invalid or oversized input and mismatched receipt before content use',()=>{
 assert.throws(()=>dartDocumentText(new Uint8Array(2_000_001),'20261019000001'),/BOUND/);
 assert.throws(()=>dartDocumentText(Buffer.from('not a zip'),'20261019000001'),/ARCHIVE/);
 assert.throws(()=>dartDocumentText(Buffer.from(''),'wrong'),/BOUND/);
});

const zipDocument = (xml: string): Uint8Array => {
  const name = Buffer.from('20261019000001.xml');
  const source = Buffer.from(xml);
  const compressed = deflateRawSync(source);
  const local = Buffer.alloc(30 + name.length + compressed.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(source.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  compressed.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
};

test('official DART exact-receipt XML prose is extracted without inventing table values',()=>{
 const archive=zipDocument('<DOCUMENT><TITLE>검증 공시</TITLE><P>'+evidence+'</P><TABLE><TR><TD>123</TD></TR></TABLE></DOCUMENT>');
 assert.equal(contentSummary(dartDocumentText(archive,'20261019000001')),evidence);
 assert.throws(()=>dartDocumentText(archive,'20261019000002'),/RECEIPT_MISMATCH/);
 const corrupted=Buffer.from(archive);corrupted.writeUInt32LE(6_000_000,corrupted.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]))+24);assert.throws(()=>dartDocumentText(corrupted,'20261019000001'));
});
