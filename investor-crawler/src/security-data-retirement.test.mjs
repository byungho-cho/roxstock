import test from 'node:test';import assert from 'node:assert/strict';
import {runKisSupplements} from './kis-supplements.mjs';
test('new collector isolates current references from all historical valuation scans and writes',async()=>{
 const old=process.env.SECURITY_DATA_COLLECTION_ENABLED,legacy=process.env.KIS_SUPPLEMENT_ENABLED,current=process.env.KIS_CURRENT_FUNDAMENTALS_ENABLED;let owner,snapshots=0,finalRun;
 const security={id:1n,symbol:'008420',isActive:true,collectionExcluded:false,excludedFeatures:[],collectionRevision:0,codeRevision:0};
 const forbidden=new Proxy({}, {get(){throw Error('Historical valuation scan must not run');}});
 const tx={$queryRaw:async()=>[{owner_token:owner}],security:{findUnique:async()=>security},fundamentalSnapshot:{findUnique:async()=>null,upsert:async()=>{snapshots++;}},periodValuation:forbidden,dartFinancialFiling:forbidden,analysisRevision:{upsert:async()=>{}},collectorRunItem:{create:async()=>({})}};
 const db={collectorLock:{updateMany:async({data})=>{owner=data.ownerToken;return {count:1};},deleteMany:async()=>({count:1})},security:{findMany:async()=>[security]},periodValuation:forbidden,collectorRun:{updateMany:async()=>({count:0}),create:async()=>({id:1n}),update:async({data})=>{finalRun=data;}},collectorRunItem:{create:async()=>({})},$transaction:async fn=>fn(tx)};
 const kis={currentFundamentals:async()=>({per:'2',pbr:'0.2',eps:'1',bps:'10',listedShares:'10',foreignHoldingShares:'0',foreignExhaustionRate:'0',collectedAt:new Date(),raw:{}}),annualFundamentals:async()=>assert.fail('Annual API must never run')};
 try{process.env.SECURITY_DATA_COLLECTION_ENABLED='true';process.env.KIS_SUPPLEMENT_ENABLED='false';process.env.KIS_CURRENT_FUNDAMENTALS_ENABLED='true';const result=await runKisSupplements({db,kis,sleep:async()=>{}});assert.equal(result.stored,1);assert.equal(result.annualFilled,0);assert.equal(snapshots,1);assert.equal(finalRun.metadata.currentReferenceOnly,true);assert.equal(finalRun.metadata.annualMissingOnly,false);
 process.env.KIS_CURRENT_FUNDAMENTALS_ENABLED='false';assert.deepEqual(await runKisSupplements({db:forbidden,kis:forbidden}),{status:'DISABLED'});
 }finally{for(const [key,value]of Object.entries({SECURITY_DATA_COLLECTION_ENABLED:old,KIS_SUPPLEMENT_ENABLED:legacy,KIS_CURRENT_FUNDAMENTALS_ENABLED:current})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
