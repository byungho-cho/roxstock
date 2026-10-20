import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash,passwordMatches,randomToken,tokenHash,validPassword} from './crypto.js';
test('passwords retain spaces and long Unicode phrases; salts differ; hashes reject mismatches',async()=>{
 const password='  나의 긴 비밀번호 문장  ';
 assert.ok(validPassword(password));assert.ok(!validPassword('short'));
 const a=await passwordHash(password),b=await passwordHash(password);
 assert.notEqual(a,b);assert.ok(!a.includes(password));
 assert.ok(await passwordMatches(password,a));assert.ok(!await passwordMatches(password.trim(),a));
 assert.ok(!await passwordMatches(password,'invalid'));
 const token=randomToken();assert.equal(token.length,43);assert.equal(tokenHash(token).length,64);assert.notEqual(token,randomToken());
});
