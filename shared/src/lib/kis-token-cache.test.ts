import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {persistentKisToken} from './kis-token-cache.js';

test('token persists across callers, concurrent calls issue once, and credential/environment changes isolate caches',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'kis-token-cache-'));let calls=0;const issue=async()=>{calls++;return {token:'private-token',expiresAt:Date.now()+86400000};};const options={directory,appKey:'key',appSecret:'secret',origin:'https://real.invalid',issue};
 try{await Promise.all(Array.from({length:12},()=>persistentKisToken(options)));assert.equal(calls,1);await persistentKisToken({...options,issue:async()=>{throw Error('must reuse persisted token');}});assert.equal(calls,1);await persistentKisToken({...options,appSecret:'rotated'});await persistentKisToken({...options,origin:'https://demo.invalid'});assert.equal(calls,3);for(const file of await readdir(directory)){assert.ok(!file.includes('key'));const raw=await readFile(join(directory,file),'utf8');assert.ok(!raw.includes('secret'));}}finally{await rm(directory,{recursive:true,force:true});}
});
test('expiry renews once, failed issuance cools down, malformed cache fails closed without exposing values',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'kis-token-expiry-')),base={directory,appKey:'key',appSecret:'secret',origin:'https://real.invalid'};let calls=0;const issue=async()=>({token:'private-token-'+(++calls),expiresAt:Date.now()+3600000});
 try{await persistentKisToken({...base,issue});const file=join(directory,(await readdir(directory))[0]!);const saved=JSON.parse(await readFile(file,'utf8'));await writeFile(file,JSON.stringify({...saved,expiresAt:Date.now()-1,attemptedAt:Date.now()-61000}));await persistentKisToken({...base,issue});assert.equal(calls,2);await writeFile(file,'invalid private payload');await assert.rejects(persistentKisToken({...base,issue}),{code:'KIS_TOKEN_CACHE_INVALID'});assert.equal(calls,2);await rm(file);await assert.rejects(persistentKisToken({...base,issue:async()=>{throw Error('fixture issue failed');}}),/fixture issue failed/);await assert.rejects(persistentKisToken({...base,issue}),{code:'KIS_TOKEN_ISSUE_COOLDOWN'});assert.equal(calls,2);}finally{await rm(directory,{recursive:true,force:true});}
});
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('separate processes and a restarted process reuse one persisted issuance',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'kis-token-process-')),counter=join(directory,'issues.txt');
 const script=`import {persistentKisToken} from ${JSON.stringify(new URL('./kis-token-cache.ts',import.meta.url).href)};import {appendFile} from 'node:fs/promises';await persistentKisToken({directory:${JSON.stringify(directory)},appKey:'process-key',appSecret:'process-secret',origin:'https://real.invalid',issue:async()=>{await appendFile(${JSON.stringify(counter)},'issued\\n');await new Promise(r=>setTimeout(r,200));return {token:'dummy-private-token',expiresAt:Date.now()+3600000};}});`;
 const run=()=>promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script],{timeout:15000});
 try{await Promise.all([run(),run(),run(),run()]);await run();assert.equal((await readFile(counter,'utf8')).trim().split('\n').length,1);}finally{await rm(directory,{recursive:true,force:true});}
});
import {mkdir,utimes} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('abandoned expired issuance lock is recovered before issuing once',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'kis-token-abandoned-'));const scope=createHash('sha256').update(JSON.stringify(['https://real.invalid','key','secret'])).digest('hex');const lock=join(directory,scope+'.lock');
 try{await mkdir(lock);const old=new Date(Date.now()-180000);await utimes(lock,old,old);let calls=0;await persistentKisToken({directory,appKey:'key',appSecret:'secret',origin:'https://real.invalid',issue:async()=>{calls++;return {token:'dummy-private-token',expiresAt:Date.now()+3600000};}});assert.equal(calls,1);assert.deepEqual((await readdir(directory)).filter(f=>f.endsWith('.lock')),[]);}finally{await rm(directory,{recursive:true,force:true});}
});
