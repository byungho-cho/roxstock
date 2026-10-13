import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRead } from './readBatch';

test('read transport batching, isolated failures, cancellation and rollback', async t => {
  const original=globalThis.fetch;
  const requests: {url:string;init?:RequestInit}[]=[];
  let hold: (()=>void)|undefined;
  globalThis.fetch=(async(input,init)=>{
    requests.push({url:String(input),init});
    if(hold) await new Promise<void>(resolve=>{hold=resolve;});
    const paths=JSON.parse(String(init?.body)).paths as string[];
    return Response.json({data:paths.map(path=>({status:path.endsWith('/trades')?503:200,body:{data:path}}))});
  }) as typeof fetch;
  try {
    await t.test('one network request, duplicate path deduplication and per-part status',async()=>{
      const result=await Promise.all(['/accounts/1/holdings','/accounts/1/holdings','/accounts/1/trades'].map(path=>fetchRead(path,{})));
      assert.equal(requests.length,1);assert.equal(JSON.parse(String(requests[0].init?.body)).paths.length,2);
      assert.deepEqual(result.map(r=>r.status),[200,200,503]);
      assert.equal((await result[0].json()).data,'/accounts/1/holdings');
    });
    await t.test('cancelled queued read does not go on the wire',async()=>{
      const controller=new AbortController();const pending=fetchRead('/accounts/2/holdings',{signal:controller.signal});controller.abort();
      await assert.rejects(pending,{name:'AbortError'});await new Promise(r=>setTimeout(r,5));assert.equal(requests.length,1);
    });
    await t.test('cancelling one in-flight caller preserves its sibling',async()=>{
      hold=()=>{};const controller=new AbortController();
      const first=fetchRead('/accounts/1/holdings',{signal:controller.signal});const second=fetchRead('/accounts/2/holdings',{});
      await new Promise(r=>setTimeout(r,5));controller.abort();await assert.rejects(first,{name:'AbortError'});
      assert.equal(requests.at(-1)?.init?.signal?.aborted,false);
      const release=hold;hold=undefined;release();assert.equal((await second).status,200);
    });
    await t.test('new bootstrap and refresh status endpoints stay direct',async()=>{
      globalThis.fetch=(async(input,init)=>{requests.push({url:String(input),init});return Response.json({data:null});}) as typeof fetch;
      await fetchRead('/pages/home',{});await fetchRead('/securities/1/financial-refresh/active',{});
      assert.deepEqual(requests.slice(-2).map(r=>r.url),['/api/pages/home','/api/securities/1/financial-refresh/active']);
    });
    await t.test('only outer 404 activates legacy fallback',async()=>{
      let status=503;
      globalThis.fetch=(async(input)=>String(input)==='/api/pages/read'?Response.json({error:{message:'unavailable'}},{status}):Response.json({data:'legacy'})) as typeof fetch;
      assert.equal((await fetchRead('/accounts',{})).status,503);
      status=404;assert.equal((await (await fetchRead('/accounts',{})).json()).data,'legacy');
      status=500;assert.equal((await (await fetchRead('/accounts',{})).json()).data,'legacy');
    });
  } finally {globalThis.fetch=original;}
});
