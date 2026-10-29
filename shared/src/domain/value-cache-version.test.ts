import test from 'node:test';
import assert from 'node:assert/strict';
import {ValueReadModel} from '../read-model/value-cache.js';

test('schema 9 refreshes all financial projections even when DB revisions are unchanged, then persists across restart',async()=>{
 let stored:any={key:'value:2026',revision:'old',generatedAt:new Date(),payload:{schemaVersion:9,financialRevision:'1',revisions:{},rows:[],priceCacheGeneratedAt:new Date().toISOString()}},loads=0;
 const db:any={analysisRevision:{findUnique:async()=>({revision:1n}),findMany:async()=>[]},analysisReadCache:{findUnique:async()=>stored,updateMany:async({where,data}:any)=>{
  assert.equal(where.revision,stored.revision);stored={...stored,...data};return{count:1};
 }}};
 const loader=async(_year:number,ids?:bigint[])=>{loads++;assert.equal(ids,undefined);return[];};
 const result=await new ValueReadModel(db,loader).get(2026);
 assert.equal(result.meta.status,'REFRESHED');assert.equal(loads,1);assert.equal(stored.payload.schemaVersion,11);
 const restarted=await new ValueReadModel(db,async()=>{throw Error('Unexpected reload');}).get(2026);
 assert.equal(restarted.meta.status,'PERSISTED_HIT');assert.equal(restarted.meta.financialRevision,'1');
});
