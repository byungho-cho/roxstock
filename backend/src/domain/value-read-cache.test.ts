import test from 'node:test';import assert from 'node:assert/strict';
import {ValueReadModel} from '@roxstock/shared/read-model/value-cache';
function fixture(){
 let revision=0n,fail=false,writeFail=false;const records=new Map<string,any>(),versions=new Map<string,bigint>();let loads=0,price='100';let lastIds:bigint[]|undefined;
 const db={analysisRevision:{findUnique:async()=>({revision}),findMany:async()=>[...versions].map(([key,revision])=>({key,revision}))},analysisReadCache:{findUnique:async({where}:any)=>records.get(where.key)??null,create:async({data}:any)=>{if(writeFail)throw Error('write failed');records.set(data.key,data);return data;},updateMany:async({where,data}:any)=>{if(writeFail)throw Error('write failed');const old=records.get(where.key);if(old?.revision!==where.revision)return {count:0};records.set(where.key,{...old,...data});return {count:1};}}} as any;
 const loader=async(_year:number,ids?:bigint[],previous?:Map<string,any>)=>{loads++;lastIds=ids;if(fail)throw Error('read failed');return ['1','2'].filter(id=>!ids||ids.includes(BigInt(id))).map(id=>({id,symbol:id,currentPrice:previous?.get(id)?.currentPrice??price,previousClosePrice:'90',priceUpdatedAt:'2026-10-13',collectionErrors:[],collectionStatus:'COMPLETE'})) as any;};
 return {db,loader,records,versions,get loads(){return loads;},get lastIds(){return lastIds;},price:(v:string)=>price=v,dirty:(id='1')=>{revision++;versions.set('security:'+id,revision);},fail:(v:boolean)=>fail=v,writeFail:(v:boolean)=>writeFail=v};
}
test('fallback, daily build, same query hit, restart persisted hit and targeted financial refresh retain daily prices',async()=>{
 const f=fixture(),model=new ValueReadModel(f.db,f.loader);
 assert.equal((await model.get(2026)).meta.status,'FALLBACK');await model.warm(2026);const n=f.loads;
 f.price('200');assert.equal((await model.get(2026)).rows[0]!.currentPrice,'100');assert.equal(f.loads,n);
 const restarted=new ValueReadModel(f.db,f.loader);assert.equal((await restarted.get(2026)).meta.status,'PERSISTED_HIT');assert.equal(f.loads,n);
 f.dirty();const r=await restarted.get(2026);assert.equal(r.meta.status,'REFRESHED');assert.deepEqual(f.lastIds,[1n]);assert.equal(r.rows.find(v=>v.id==='1')?.currentPrice,'100');
 await restarted.warm(2026);assert.equal((await model.get(2026)).rows[0]!.currentPrice,'200');
});
test('generation/read/write failures keep complete prior snapshot and never become zero or successful refresh',async()=>{
 const f=fixture(),model=new ValueReadModel(f.db,f.loader);await model.warm(2026);const old=f.records.get('value:2026');
 f.fail(true);await assert.rejects(model.warm(2026));assert.equal(f.records.get('value:2026'),old);
 f.dirty();assert.equal((await model.get(2026)).meta.status,'STALE');assert.equal((await model.get(2026)).rows[0]!.currentPrice,'100');
 f.fail(false);f.writeFail(true);await assert.rejects(model.warm(2026));assert.equal(f.records.get('value:2026'),old);
});
test('a financial mutation during generation cannot publish mixed data',async()=>{
 const f=fixture(),model=new ValueReadModel(f.db,async(year,ids,previous)=>{const rows=await f.loader(year,ids,previous);f.dirty();return rows;});
 await assert.rejects(model.warm(2026),/REVISION_CHANGED/);assert.equal(f.records.size,0);
});

test('partial evening collection keeps previous numeric prices and exposes collection failure',async()=>{
 const f=fixture(),model=new ValueReadModel(f.db,f.loader);await model.warm(2026,['1']);const row=(await model.get(2026)).rows.find(r=>r.id==='1')!;assert.equal(row.currentPrice,'100');assert.equal(row.collectionStatus,'ERROR');assert.deepEqual(row.collectionErrors,['PRICE_COLLECTION_FAILED_LAST_VALUE_RETAINED']);
});

test('old or invalid persisted schema falls back and can be atomically rebuilt',async()=>{
 const f=fixture(),model=new ValueReadModel(f.db,f.loader);await model.warm(2026);f.records.get('value:2026').payload.schemaVersion=0;
 const restarted=new ValueReadModel(f.db,f.loader);assert.equal((await restarted.get(2026)).meta.status,'FALLBACK');await restarted.warm(2026);assert.equal((await restarted.get(2026)).meta.status,'HIT');
 f.records.get('value:2026').payload=null;const repaired=new ValueReadModel(f.db,f.loader);assert.equal((await repaired.get(2026)).meta.status,'FALLBACK');await repaired.warm(2026);assert.equal((await repaired.get(2026)).meta.status,'HIT');
});

test('fallback cache shares reads, isolates filters/revisions and clears explicitly',async()=>{
 const f=fixture(),model=new ValueReadModel(f.db,f.loader);
 await Promise.all([model.get(2026),model.get(2026)]);assert.equal(f.loads,1);
 await model.get(2026);assert.equal(f.loads,1);
 await model.get(2026,{query:'other'});assert.equal(f.loads,2);
 f.dirty();await model.get(2026);assert.equal(f.loads,3);
 model.clear();await model.get(2026);assert.equal(f.loads,4);
});
