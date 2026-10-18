import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPeriodicReports,OpenDartProvider} from './dart-provider.js';
import {parsePublicAnnual,publicAnnualTarget,publicSectionUrls} from './dart-public-source.js';
import {getCfsThenOfs} from './dart-collector.js';

const corp='00380429',original='20180330001415',corrected='20180814002823';
const raw=(receipt:string,title='사업보고서',period='2017.12')=>({corp_code:corp,rcept_no:receipt,rcept_dt:receipt.slice(0,8),report_nm:`${title} (${period})`,rm:'정연'});
const report=()=>publicAnnualTarget(mapPeriodicReports([raw(original),raw(corrected,'[기재정정]사업보고서')],2017)[0]!,corp,2017)!;
const url=(receipt=corrected)=>'https://dart.fss.or.kr/report/viewer.do?rcpNo='+receipt;
const row=(name:string,n:string)=>`<tr><td>${name}</td><td>${n}</td><td>10</td></tr>`;
function sections(){return [{title:'사 업 보 고 서',url:url(),html:'사업보고서 (제17기) 사업연도 2017년 01월 01일 부터 2017년 12월 31일 까지'},
 {title:'2. 연결재무제표',url:url(),html:`연결 재무상태표 제17기 2017.12.31 현재 제16기 2016.12.31 현재 (단위 : 원)
 <table><tr><th>과목</th><th>제17기</th><th>제16기</th></tr>${row('자산총계','109568153346')}${row('부채총계','11624133943')}${row('자본총계','97944019403')}</table>
 연결 포괄손익계산서 제17기 2017.01.01 부터 2017.12.31 까지 (단위 : 원)
 <table><tr><th>과목</th><th>제17기</th><th>제16기</th></tr>${row('매출액','41535587785')}${row('영업이익(손실)','1558607063')}${row('당기순이익(손실)','2834900621')}</table>`}];}

test('restated source keeps its own receipt and corrected CMG balance/flow rather than original API values',()=>{
 const result=parsePublicAnnual(report(),corp,2017,sections());
 assert.equal(result.source.receiptNo,corrected);
 assert.equal(result.rows.find(r=>r.accountName==='자본총계')?.currentAmount,'97944019403');
 assert.equal(result.rows.find(r=>r.accountName==='당기순이익')?.currentAmount,'2834900621');
 assert.equal(result.source.sourceValidation.relationship,'EXACT');
 assert.equal(result.source.sourceValidation.publicDocument.fiscalDuration.months,12);
});
test('transition picks final calendar closing but preserves a three-month fiscal duration',()=>{
 const annual=mapPeriodicReports([raw('20151228000179','사업보고서','2015.09'),raw('20160328000548','사업보고서','2015.12')],2015)[0]!;
 const target=publicAnnualTarget(annual,corp,2015)!;assert.equal(target.receiptNo,'20160328000548');
 const ss=sections().map(s=>({...s,url:url(target.receiptNo),html:s.html.replaceAll('2017','2015').replaceAll('2016','2014').replaceAll('2015년 01월','2015년 10월').replaceAll('2015.01.01','2015.10.01')}));
 const result=parsePublicAnnual(target,corp,2015,ss);assert.equal(result.source.sourceValidation.publicDocument.fiscalDuration.months,3);
 assert.equal(annual.selection?.periodError,'MULTIPLE_ANNUAL_PERIODS','cached evidence stays immutable');
});
for(const [name,mutate] of [
 ['foreign source',(ss:ReturnType<typeof sections>)=>{ss[1]!.url='https://example.com/report/viewer.do?rcpNo='+corrected;}],
 ['wrong receipt',(ss:ReturnType<typeof sections>)=>{ss[1]!.url=url(original);}],
 ['wrong accounting period',(ss:ReturnType<typeof sections>)=>{ss[0]!.html=ss[0]!.html.replace('12월 31일','09월 30일');}],
 ['inconsistent statement duration',(ss:ReturnType<typeof sections>)=>{ss[1]!.html=ss[1]!.html.replace('2017.01.01','2017.07.01');}],
 ['wrong current column',(ss:ReturnType<typeof sections>)=>{ss[1]!.html=ss[1]!.html.replaceAll('<th>제17기</th>','<th>제16기</th>');}],
 ['balance mismatch',(ss:ReturnType<typeof sections>)=>{ss[1]!.html=ss[1]!.html.replace('97944019403','101134421009');}],
 ['foreign/mixed unit',(ss:ReturnType<typeof sections>)=>{ss[1]!.html=ss[1]!.html.replace('(단위 : 원)','(단위 : USD)');}],
 ['missing current amount must not use comparative',(ss:ReturnType<typeof sections>)=>{ss[1]!.html=ss[1]!.html.replace('1558607063','-');}],
 ['malformed CFS must not fall back to OFS',(ss:ReturnType<typeof sections>)=>{ss.push({...ss[1]!,title:'4. 재무제표'});ss[1]!.html=ss[1]!.html.replace('자산총계','미확인항목');}],
 ['short unrecognized CFS must not fall back to OFS',(ss:ReturnType<typeof sections>)=>{ss.push({...ss[1]!,title:'4. 재무제표'});ss[1]!.html='본문 확인 불가';}],
] as const)test('public source rejects '+name,()=>{const ss=sections();mutate(ss);assert.throws(()=>parsePublicAnnual(report(),corp,2017,ss));});
test('zero and loss amounts are retained; notes and later equity matrices do not replace income',()=>{
 const ss=sections();ss[1]!.html=ss[1]!.html.replace('1558607063','0').replace('2834900621','(123)')+`<p>단위:천원</p><table>${row('당기순이익(손실)','999')}</table>`;
 const parsed=parsePublicAnnual(report(),corp,2017,ss);assert.equal(parsed.rows[4]!.currentAmount,'0');assert.equal(parsed.rows[5]!.currentAmount,'-123');
});
test('only numeric same-receipt dart3/dart4 viewer coordinates are followed',()=>{
 const main=`node2['text'] = "2. 연결재무제표"; node2['rcpNo']="${corrected}";node2['dcmNo']="10";node2['eleId']="2";node2['offset']="20";node2['length']="30";node2['dtd']="dart4.xsd";`;
 assert.equal(publicSectionUrls(main,corrected).length,1);assert.equal(publicSectionUrls(main,original).length,0);assert.equal(publicSectionUrls(main.replace('"20"','"javascript:alert(1)"'),corrected).length,0);
});
test('public document requests respect existing API quota and make no network call after exhaustion',async()=>{
 let calls=0;const p=new OpenDartProvider({apiKey:'fixture',dailyCallLimit:1,minDelayMs:0,reserveCall:async()=>false,fetchFn:async()=>{calls++;throw Error('must not fetch');}});
 await assert.rejects(getCfsThenOfs(p,corp,2017,'11011',report()),{code:'DAILY_CALL_LIMIT'});assert.equal(calls,0);
});
test('ordinary uncorrected reports retain the established JSON financial path',async()=>{
 const ordinary=mapPeriodicReports([raw(original)],2017)[0]!;assert.equal(publicAnnualTarget(ordinary,corp,2017),undefined);
 let calls=0;const provider={fetchPublicAnnual:async()=>undefined,fetchFinancials:async()=>{calls++;return [{receiptNo:original}];}} as unknown as OpenDartProvider;
 assert.equal((await getCfsThenOfs(provider,corp,2017,'11011',ordinary)).rows.length,1);assert.equal(calls,1);
});
test('a withdrawal, unknown correction or missing original never becomes a public annual target',()=>{
 const r=report();for(const correctionType of ['WITHDRAWAL','UNKNOWN'] as const){assert.equal(publicAnnualTarget({...r,selection:{...r.selection!,candidates:[...r.selection!.candidates,{...r.selection!.candidates[0]!,correctionType}]}},corp,2017),undefined);}
 assert.equal(publicAnnualTarget({...r,selection:{...r.selection!,candidates:r.selection!.candidates.filter(c=>c.correctionType!=='ORIGINAL')}},corp,2017),undefined);
});
test('the shared automatic/manual entry reads the selected corrected viewer and never requests old JSON financials',async()=>{
 const navigation=(title:string,id:string)=>`node2['text']="${title}";node2['rcpNo']="${corrected}";node2['dcmNo']="10";node2['eleId']="${id}";node2['offset']="20";node2['length']="1000";node2['dtd']="dart3.xsd";`;
 const calls:string[]=[];let reservations=0;const contents=sections();
 const p=new OpenDartProvider({apiKey:'fixture',dailyCallLimit:10,minDelayMs:0,reserveCall:async()=>{reservations++;return true;},fetchFn:async input=>{const u=new URL(String(input));calls.push(u.pathname);assert.equal(u.searchParams.has('crtfc_key'),false,'public viewers receive no API credential');return new Response(u.pathname==='/dsaf001/main.do'?navigation('사 업 보 고 서','1')+navigation('2. 연결재무제표','13'):contents[u.searchParams.get('eleId')==='1'?0:1]!.html);}});
 const result=await getCfsThenOfs(p,corp,2017,'11011',report());assert.equal(result.source?.receiptNo,corrected);assert.equal(result.rows[5]!.currentAmount,'2834900621');assert.equal(reservations,3);assert.deepEqual(calls,['/dsaf001/main.do','/report/viewer.do','/report/viewer.do']);
});

for(const marker of ['해당사항 없음','해당사항 없습니다.','해당사항이 없습니다.'])test('explicit CFS absence marker: '+marker,()=>{
 const ss=sections();ss.push({...ss[1]!,title:'4. 재무제표'});ss[1]={...ss[1]!,html:'2. 연결재무제표 '+marker};
 assert.equal(parsePublicAnnual(report(),corp,2017,ss).division,'OFS');
});
