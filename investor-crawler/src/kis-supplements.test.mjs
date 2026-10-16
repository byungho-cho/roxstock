import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KisInvestorProvider} from './kis-provider.mjs';
import {supplementData,supplementPermissions,runKisSupplements} from './kis-supplements.mjs';
const security={id:1n,symbol:'005930',isActive:true,collectionExcluded:false,excludedFeatures:[],collectionRevision:0};
const observation={per:'12',pbr:'1.2',eps:'-4',bps:'100',listedShares:'1000',foreignHoldingShares:'250',foreignExhaustionRate:'30',collectedAt:new Date('2026-10-16T01:00:00Z'),raw:{per:'12',lstn_stcn:'1000',frgn_hldn_qty:'250',hts_frgn_ehrt:'30'}};
test('current endpoint validates symbol, preserves loss EPS and foreign zero, and does not invent missing shares',async()=>{
 let output={stck_shrn_iscd:'005930',per:'0',pbr:'1.2',eps:'-4',bps:'100',lstn_stcn:'1000',frgn_hldn_qty:'0',hts_frgn_ehrt:'0'};
 const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async(url,init)=>{assert.ok(url.includes('/inquire-price?'));assert.equal(init.headers.tr_id,'FHKST01010100');return new Response(JSON.stringify({rt_cd:'0',output}));}});
 const data=await provider.currentFundamentals('005930');assert.equal(data.per,null);assert.equal(data.eps,'-4');assert.equal(data.foreignHoldingShares,'0');assert.equal(data.foreignExhaustionRate,'0');assert.ok(!JSON.stringify(data).includes('secret'));
 output.frgn_hldn_qty='';assert.equal((await provider.currentFundamentals('005930')).foreignHoldingShares,null);
 output.stck_shrn_iscd='000660';await assert.rejects(provider.currentFundamentals('005930'),{code:'KIS_SYMBOL_OR_SCHEMA_MISMATCH'});
 await assert.rejects(provider.currentFundamentals('Z99001'),{code:'EXCLUDED_SYMBOL'});
});
test('ownership and exhaustion are separate; per-feature exclusions redact original fields too',()=>{
 const data=supplementData(observation,security,new Date('2026-10-16'));
 assert.equal(data.foreignHoldingRatio,'25');assert.equal(data.foreignExhaustionRate,'30');assert.equal(data.raw.sourceAsOf,null);
 const excluded=supplementData(observation,{...security,excludedFeatures:['share-counts']},new Date());assert.equal(excluded.listedShares,null);assert.equal(excluded.foreignHoldingRatio,null);assert.ok(!('lstn_stcn' in excluded.raw.fields));
 const noValuation=supplementData(observation,{...security,excludedFeatures:['valuation']},new Date());assert.equal(noValuation.per,null);assert.equal(noValuation.foreignHoldingShares,null);assert.deepEqual(noValuation.raw.fields,{lstn_stcn:'1000'});
 assert.deepEqual(supplementPermissions({...security,symbol:'Z99001'}),{valuation:false,shares:false});
 assert.throws(()=>supplementData({...observation,foreignHoldingShares:'1001'},security,new Date()),{code:'KIS_FOREIGN_SHARES_EXCEED_LISTED'});
});
test('collector revalidates identity under owner lock and stores current snapshots without touching period models',async()=>{
 let owner,stored,finalRun,query,minimumDelay=0;
 const current={...security};
 const db={collectorLock:{updateMany:async({data})=>{owner=data.ownerToken;return {count:1}},deleteMany:async()=>({count:1})},security:{findMany:async(q)=>{query=q;return [security]}},collectorRun:{updateMany:async()=>({count:0}),create:async()=>({id:7n}),update:async({data})=>{finalRun=data}},collectorRunItem:{create:async()=>({})},$transaction:async fn=>fn({$queryRaw:async()=>[{owner_token:owner}],security:{findUnique:async()=>current},kisFundamentalSnapshot:{upsert:async({create,update})=>{assert.deepEqual(update,{});stored=create}},collectorRunItem:{create:async()=>({})}})};
 const result=await runKisSupplements({db,kis:{currentFundamentals:async()=>observation},now:()=>new Date('2026-10-16T01:00:00Z'),sleep:async(ms)=>{minimumDelay=ms}});
 assert.equal(result.stored,1);assert.equal(stored.collectionSymbol,'005930');assert.equal(finalRun.status,'SUCCESS');assert.equal(minimumDelay,2000);assert.equal(query.where.kisFundamentalSnapshots.none.observedDate.toISOString(),'2026-10-16T00:00:00.000Z');
 stored=null;current.collectionRevision=1;const changed=await runKisSupplements({db,kis:{currentFundamentals:async()=>observation},sleep:async()=>{}});assert.equal(changed.skipped,1);assert.equal(stored,null);
});
