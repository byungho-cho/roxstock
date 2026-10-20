import test from 'node:test';
import assert from 'node:assert/strict';
import {apiRequest} from './apiClient';
import {setAuthIdentity} from '../auth/client';
test('bodyless DELETE and POST retain JSON, CSRF and the rendered identity',async()=>{
 const fetchBefore=globalThis.fetch,documentBefore=Object.getOwnPropertyDescriptor(globalThis,'document'),windowBefore=Object.getOwnPropertyDescriptor(globalThis,'window');
 const requests:RequestInit[]=[];
 Object.defineProperty(globalThis,'document',{value:{cookie:'rox_csrf=test-csrf'},configurable:true});
 Object.defineProperty(globalThis,'window',{value:new EventTarget(),configurable:true});
 globalThis.fetch=async(_input,init)=>{requests.push(init!);return Response.json({data:{ok:true}});};setAuthIdentity('101');
 try{
  await apiRequest('/accounts/5',{method:'DELETE'});await apiRequest('/accounts/5/action',{method:'POST'});
  for(const request of requests){const headers=new Headers(request.headers);assert.equal(headers.get('content-type'),'application/json');assert.equal(headers.get('x-csrf-token'),'test-csrf');assert.equal(headers.get('x-auth-user'),'101');assert.deepEqual(JSON.parse(String(request.body)),{});}
  assert.equal(requests.length,2);
 }finally{globalThis.fetch=fetchBefore;setAuthIdentity();for(const [name,value] of [['document',documentBefore],['window',windowBefore]] as const){if(value)Object.defineProperty(globalThis,name,value);else Reflect.deleteProperty(globalThis,name);}}
});
