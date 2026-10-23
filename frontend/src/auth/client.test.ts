import test from 'node:test';import assert from 'node:assert/strict';
import {authRequest,confirmedSessionFailure,AuthRequestError} from './client';
test('only recognized server session failures end identity; malformed/5xx/403/network are recoverable',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [status,body,confirmed] of [[401,{error:{code:'AUTH_SESSION_EXPIRED'}},true],[401,{error:{code:'LOGIN_REQUIRED'}},true],[403,{error:{code:'ADMIN_REQUIRED'}},false],[503,{error:{code:'UNAVAILABLE'}},false],[401,{},false],[200,{},false]] as const){
   globalThis.fetch=async()=>Response.json(body,{status});try{await authRequest('me');assert.fail('must fail');}catch(error){assert.equal(confirmedSessionFailure(error),confirmed);}
  }
  globalThis.fetch=async()=>new Response('bad proxy response',{status:401});await assert.rejects(authRequest('me'),e=>e instanceof AuthRequestError&&e.code==='AUTH_RESPONSE_INVALID'&&!confirmedSessionFailure(e));
  globalThis.fetch=async()=>{throw new TypeError('network');};await assert.rejects(authRequest('me'),e=>e instanceof AuthRequestError&&e.code==='AUTH_NETWORK_UNAVAILABLE'&&!confirmedSessionFailure(e));
 }finally{globalThis.fetch=original;}
});
