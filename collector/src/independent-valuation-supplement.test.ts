import assert from 'node:assert/strict';
import test from 'node:test';
import {runIndependentSupplement} from './independent-valuation-supplement.js';
import {registerCandidate,scanSupplementCandidates,supplementLimits,supplementSourceVersion} from './valuation-supplement-queue.js';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import type {PrismaClient} from '@roxstock/shared/prisma';
const now=new Date('2026-10-17T12:00:00Z'),config={windowStartHour:18,windowEndHour:6};
const candidate=()=>({id:1n,security_id:1n,fiscal_year:2025,period_type:'ANNUAL',receipt_no:'20260301000001',collected_at:now,normalization_version:3,symbol:'008420',collection_revision:0,code_revision:0,prior_id:null,prior_at:null,valuation_at:null,retry_at:null,corp_code:null,needed:1,unsupported:0,priority:1});
test('disabled collector and daytime perform no DB queries or provider calls',async()=>{
 const db=new Proxy({}, {get(){throw Error('Unexpected DB read');}}) as PrismaClient,old=process.env.VALUATION_SUPPLEMENT_ENABLED;
 try{process.env.VALUATION_SUPPLEMENT_ENABLED='false';assert.equal((await runIndependentSupplement(db,config,now)).status,'DISABLED');delete process.env.VALUATION_SUPPLEMENT_ENABLED;assert.equal((await runIndependentSupplement(db,config,new Date('2026-10-09T03:00:00Z'))).status,'OUTSIDE_WINDOW');}finally{if(old===undefined)delete process.env.VALUATION_SUPPLEMENT_ENABLED;else process.env.VALUATION_SUPPLEMENT_ENABLED=old;}
});
test('daily period cap stops before candidate discovery, locking, run creation or I/O',async()=>{
 const db={valuationSupplementBudget:{findUnique:async()=>({reserved:200}),findUniqueOrThrow:async()=>({reserved:200})},dartApiDailyUsage:{findUnique:async()=>null}} as unknown as PrismaClient;
 assert.equal((await runIndependentSupplement(db,config,now)).status,'QUOTA_BLOCKED');
});
test('DART daily cap also avoids scanning and external calls',async()=>{
 const db={valuationSupplementBudget:{findUnique:async()=>({reserved:0}),findUniqueOrThrow:async()=>({reserved:0})},dartApiDailyUsage:{findUnique:async()=>({apiCallCount:100})}} as unknown as PrismaClient;
 assert.equal((await runIndependentSupplement(db,{...config,apiKey:'fixture',dailyCallLimit:100},now)).status,'QUOTA_BLOCKED');
});
test('scan reads at most two 100-key pages, no financial JSON, and persists restart cursor',async()=>{
 let cursor=0n,pages=0;const queries:string[]=[];
 const db={$queryRaw:async(q:any,...params:any[])=>{const sql=String(q);queries.push(sql);assert.ok(sql.startsWith('SELECT id FROM dart_financial_filings')||sql.startsWith('SELECT f.id'));if(sql.startsWith('SELECT id')){pages++;assert.equal(params.at(-1),100);return Array.from({length:100},(_,i)=>({id:cursor+BigInt(i+1)}));}return [];},valuationSupplementScan:{upsert:async()=>({}),findUniqueOrThrow:async()=>({cursor,upperId:1000000n}),updateMany:async(q:any)=>{if(q.data.cursor!==undefined)cursor=q.data.cursor;return {count:1};}}} as unknown as PrismaClient;
 assert.equal(await scanSupplementCandidates(db,'fixture',now,()=>now),200);assert.equal(pages,2);assert.equal(cursor,200n);
 assert.equal(await scanSupplementCandidates(db,'restart',now,()=>now),200);assert.equal(cursor,400n);assert.ok(!queries.some(q=>/SELECT\s+(?:f\.\*|\*)/.test(q)));assert.equal(supplementLimits.batch,10);
});
test('source versions change only for effective data, identity or policy changes',()=>{
 const row=candidate(),version=supplementSourceVersion(row);
 for(const patch of [{receipt_no:'20260401000001'},{collected_at:new Date(now.getTime()+1)},{prior_id:2n},{collection_revision:1},{symbol:'005930'},{corp_code:'00123456'}])assert.notEqual(supplementSourceVersion({...row,...patch}),version);
 assert.equal(supplementSourceVersion({...row,valuation_at:new Date()}),version);
});
test('unchanged terminal and processing tasks are not reset or repeatedly called',async()=>{
 for(const status of ['COMPLETE','UNAVAILABLE','PROCESSING']){const row=candidate(),db={valuationSupplementTask:{findUnique:async()=>({id:1n,status,sourceVersion:supplementSourceVersion(row),valuationAt:null})}} as unknown as PrismaClient;await registerCandidate(db,row,now);}
});
test('first registration distinguishes unsupported, complete and pending and honors saved retry date',async()=>{
 const writes:any[]=[];const db={valuationSupplementTask:{findUnique:async()=>null},$executeRaw:async(_q:any,...p:any[])=>{writes.push({status:p[6],nextAttemptAt:p[9]});return 1;}} as unknown as PrismaClient;
 await registerCandidate(db,{...candidate(),unsupported:1},now);await registerCandidate(db,{...candidate(),needed:0},now);await registerCandidate(db,{...candidate(),retry_at:new Date(now.getTime()+86400000)},now);
 assert.deepEqual(writes.map(x=>x.status),['UNAVAILABLE','COMPLETE','PENDING']);assert.equal(writes[2].nextAttemptAt.getTime(),now.getTime()+86400000);
});
test('zero and negative denominators are normal absence; NULL remains missing',()=>{
 assert.equal(valueCompletion({eps:'0',bps:'0',per:null,pbr:null,roe:'0'}).complete,true);
 assert.equal(valueCompletion({eps:'-10',bps:'5',per:null,pbr:'1',roe:'-2'}).complete,true);
 assert.equal(valueCompletion({eps:null,bps:'5',per:null,pbr:'1',roe:'0'}).complete,false);
});

test('a frozen frontier completes despite newer inserted IDs, then the next sweep sees them',async()=>{
 let cursor=190n,upperId=200n;const max=500n;
 const db={$queryRaw:async(q:any,...p:any[])=>{const sql=String(q);if(sql.startsWith('SELECT COALESCE(MAX'))return [{upper_id:max}];if(sql.startsWith('SELECT id')){assert.equal(p[1],upperId);const count=Math.min(100,Number(upperId-cursor));return Array.from({length:count},(_,i)=>({id:cursor+BigInt(i+1)}));}return [];},valuationSupplementScan:{upsert:async()=>({}),findUniqueOrThrow:async()=>({cursor,upperId}),updateMany:async(q:any)=>{if(q.data.cursor!==undefined)cursor=q.data.cursor;if(q.data.upperId!==undefined)upperId=q.data.upperId;return {count:1};}}} as unknown as PrismaClient;
 assert.equal(await scanSupplementCandidates(db,'fixture',now,()=>now),10);assert.equal(cursor,0n);assert.equal(upperId,0n);
 assert.equal(await scanSupplementCandidates(db,'fixture-next',now,()=>now),200);assert.equal(upperId,500n);assert.equal(cursor,200n);
});
