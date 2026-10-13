import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { installReadBatch, readPath } from './read-batch.js';
import { sharedRead, withReadScope } from '../domain/read-scope.js';
import { realtimePriceCache } from '../realtime/price-cache.js';

test('read batch rejects recursion, writes, external URLs and canonicalizes filters', () => {
  for (const path of ['/pages/read','/accounts/1/reset','/internal/prices','https://example.com/accounts','//accounts','/accounts/../accounts','/accounts#x']) assert.throws(() => readPath(path));
  assert.equal(readPath('/accounts/1/trades?to=2026-10-13&from=2026-01-01'), '/accounts/1/trades?from=2026-01-01&to=2026-10-13');
  for (const path of ['/accounts','/accounts/1/compound-plans','/accounts/1/target-arrival-conditions','/securities/1/annual-estimates','/security-management/1','/collection/monitoring/realtime-prices/items']) assert.equal(readPath(path), path);
});

test('batch caches separately by account/filters/caller, keeps partial failures and invalidates writes', async () => {
  const app = Fastify(); installReadBatch(app);
  let reads = 0, failed = true;
  app.get('/api/accounts/:id/holdings', async request => ({data:{params:request.params,query:request.query,caller:request.headers.authorization??null,read:++reads}}));
  app.get('/api/accounts/:id/trades', async (_request, reply) => failed ? reply.code(503).send({error:{code:'BUSY'}}) : {data:[]});
  app.post('/api/test-write', async () => ({data:true}));
  const read = (paths: string[], authorization='a') => app.inject({method:'POST',url:'/api/pages/read',payload:{paths},headers:{authorization}});
  try {
    const first = await read(['/accounts/1/holdings','/accounts/1/trades']);
    assert.equal(first.statusCode,200);
    assert.deepEqual(first.json().data.map((p:any)=>p.status),[200,503]);
    assert.equal(first.json().data[0].body.data.caller,'a');
    failed=false;
    const second=(await read(['/accounts/1/holdings','/accounts/1/trades'])).json().data;
    assert.deepEqual(second.map((p:any)=>p.cache),['HIT','MISS']);
    assert.equal(second[1].status,200); assert.equal(reads,1);
    await read(['/accounts/2/holdings']); await read(['/accounts/1/holdings?year=2025']); await read(['/accounts/1/holdings'],'b');
    assert.equal(reads,4);
    await app.inject({method:'POST',url:'/api/test-write'});
    assert.equal((await read(['/accounts/1/holdings'])).json().data[0].cache,'MISS');
    realtimePriceCache.ingest([{securityId:'999998',symbol:'999998',name:'test',currentPrice:'100',previousClosePrice:'90',observedAt:new Date().toISOString(),marketStatus:'TEST'}]);
    assert.equal((await read(['/accounts/1/holdings'])).json().data[0].cache,'MISS');
    for (const paths of [[],Array(9).fill('/accounts'),['/accounts/1/reset']]) assert.notEqual((await read(paths)).statusCode,200);
  } finally { await app.close(); realtimePriceCache.removeSecurity('999998'); }
});

test('batch runs reads concurrently, coalesces identical reads and shares one scoped calculation', async () => {
  const app=Fastify(); installReadBatch(app);
  let calculations=0,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const load=()=>sharedRead('position:1',async()=>{calculations++;await gate;return 42;});
  app.get('/api/accounts/1/holdings',async()=>({data:await load()}));
  app.get('/api/accounts/1/dashboard',async()=>({data:await load()}));
  try {
    const pending=app.inject({method:'POST',url:'/api/pages/read',payload:{paths:['/accounts/1/holdings','/accounts/1/dashboard','/accounts/1/holdings']}});
    await new Promise(resolve=>setTimeout(resolve,30)); release();
    const data=(await pending).json().data;
    assert.deepEqual(data.map((p:any)=>p.body.data),[42,42,42]); assert.equal(calculations,1);
    assert.equal(data[2].cache,'COALESCED');
    await withReadScope(()=>load()); assert.equal(calculations,2);
  } finally {await app.close();}
});
