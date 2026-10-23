import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('session diagnostics emit aggregate allowlist only, bounded by line count',()=>{
 const raw=[{reqId:'private-request',req:{url:'/api/auth/me',headers:{cookie:'private-cookie'}}},{reqId:'private-request',authEvent:'AUTH_SESSION_EXPIRED',email:'private-email'},{reqId:'private-request',res:{statusCode:401}},{authEvent:'private-untrusted-event'}].map(JSON.stringify).join('\n');
 const r=spawnSync(process.execPath,['scripts/auth-log-summary.mjs'],{input:raw,encoding:'utf8'});assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout).counts,{AUTH_SESSION_EXPIRED:1,authCheckHTTP4xx:1});assert.ok(!r.stdout.includes('private-'));
});
