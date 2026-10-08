import test from 'node:test';
import assert from 'node:assert/strict';
import { KrxProvider } from './krx-provider.js';
const master={ISU_CD:'KR7005930003',ISU_SRT_CD:'005930',KIND_STKCERT_TP_NM:'보통주'};
const quote={ISU_CD:'005930',BAS_DD:'2025/12/30',TDD_CLSPRC:'100,000',LIST_SHRS:'5,000'};
test('shared market/date requests, explicit empty-day traversal, exact symbol/master and unadjusted provenance',async()=>{
 const requests:string[]=[];
 const provider=new KrxProvider('private-test',async(input,init)=>{const url=String(input);requests.push(url);assert.equal((init?.headers as any).AUTH_KEY,'private-test');assert.ok(!url.includes('private-test'));return Response.json({OutBlock_1:url.includes('20251231')?[]:url.includes('base_info')?[master]:[quote]});});
 const [first,second]=await Promise.all([provider.close('005930',new Date('2025-12-31'),'KOSPI'),provider.close('005930',new Date('2025-12-31'),'KOSPI')]);
 assert.equal(first.value,'100000');assert.equal(first.date,'2025-12-30');assert.equal(first.isin,'KR7005930003');assert.equal(first.value,second.value);assert.equal(first.date,second.date);assert.equal(requests.length,3);
});
test('auth, permission, rate limit, malformed responses and communication never advance to earlier dates',async()=>{
 for(const [fetcher,category] of [[async()=>new Response('',{status:401}),'AUTH'],[async()=>new Response('',{status:403}),'PERMISSION'],[async()=>new Response('',{status:429}),'RATE_LIMIT'],[async()=>new Response('not-json'),'PARSE'],[async()=>Response.json({error:'private-test'}),'PARSE'],[async()=>{throw Error('private-test')},'COMMUNICATION']] as const){let calls=0;const provider=new KrxProvider('private-test',async()=>{calls++;return fetcher();});await assert.rejects(provider.close('005930',new Date('2025-12-31'),'KOSPI'),(e:any)=>e.category===category&&!String(e).includes('private-test'));assert.equal(calls,1);}
});
test('nonempty market without exact symbol is not treated as a holiday; preferred stock and wrong date rejected',async()=>{
 for(const [rows,code] of [[[{...quote,ISU_CD:'005935'}],'KRX_SYMBOL_NO_DATA'],[[{...quote,BAS_DD:'2026/01/01'}],'KRX_PRICE_INVALID']] as const){const p=new KrxProvider('test',async()=>Response.json({OutBlock_1:rows}));await assert.rejects(p.close('005930',new Date('2025-12-30'),'KOSPI'),{code});}
 const p=new KrxProvider('test',async input=>Response.json({OutBlock_1:String(input).includes('base_info')?[{...master,KIND_STKCERT_TP_NM:'우선주'}]:[quote]}));await assert.rejects(p.close('005930',new Date('2025-12-30'),'KOSPI'),{code:'KRX_ORDINARY_SHARE_BASIS_UNCONFIRMED'});
});
test('failed responses are not cached; KOSDAQ uses its approved endpoints',async()=>{let calls=0;const p=new KrxProvider('test',async input=>{assert.ok(String(input).includes('ksq_bydd_trd'));calls++;return calls===1?new Response('',{status:429}):Response.json({OutBlock_1:[]});});await assert.rejects(p.rows('KOSDAQ','20151230'));assert.deepEqual(await p.rows('KOSDAQ','20151230'),[]);assert.equal(calls,2);});
