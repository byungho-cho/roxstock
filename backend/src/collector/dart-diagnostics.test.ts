import test from 'node:test';
import assert from 'node:assert/strict';
import {dartDiagnostic,storedDartCode,recordDartFailure} from './dart-diagnostics.js';
import {DartApiError} from './dart-provider.js';
test('codes retain distinct full identities and oversized identifiers do not collide by prefix',()=>{
 for(const code of ['NOT_DART_LISTED_EQUITY','DART_CORP_CODE_NOT_MAPPED','SECURITY_TYPE_NOT_APPLICABLE'])assert.equal(storedDartCode(code),code);
 assert.notEqual(storedDartCode('X'.repeat(80)+'A'),storedDartCode('X'.repeat(80)+'B'));
 assert.ok(storedDartCode('X'.repeat(80)).length<=64);
});
test('diagnostics never export raw messages, cause, credentials or stack URLs',async()=>{
 const secret='secret-key-fixture';const events:string[]=[];const old=console.error;console.error=(s)=>events.push(String(s));
 try{
 const error=Object.assign(new Error(`DATABASE_URL=mysql://user:${secret}@host/db Authorization: Bearer ${secret}`),{code:'P2000',cause:{token:secret}});
 error.stack=`Error ${secret}\n at fn (https://bad/${secret})\n at fn (/srv/backend/dist/collector/dart-repository.js:370:9)`;
 const d=await recordDartFailure(error,'MARK_UNMAPPED',12n,[{stage:'RUN_FINISH',write:async()=>{throw new Error(secret)}}]);
 assert.equal(d.code,'P2000');assert.equal(d.category,'DATABASE');assert.deepEqual(d.frames,['collector/dart-repository.js:370:9']);
 assert.equal(events.length,2);assert.ok(events[1]!.includes('primaryCode'));assert.ok(!events.join('').includes(secret));assert.ok(!events.join('').includes('mysql://'));
 assert.equal(dartDiagnostic(new SyntaxError(secret),'CORP_PARSE').category,'PARSING');
 assert.equal(dartDiagnostic(new DartApiError('020',secret),'CORP_FETCH').code,'020');
 assert.equal(dartDiagnostic(new Error(secret),'TASK_QUERY').category,'INTERNAL');
 }finally{console.error=old;}
});
