import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash,passwordMatches,randomToken,tokenHash,validPassword} from './crypto.js';
test('password policy accepts 8–20 characters with at least two of letters, digits and symbols',()=>{
 for(const value of ['Abcdefg1','a1'.repeat(10),'Abcdefg!','1234567!','Abcd12!@','Abcd[]{}','Abcd<>/|'])assert.ok(validPassword(value));
 for(const value of ['Abcdef1','a1'.repeat(10)+'a','abcdefgh','12345678','!@#$%^&*',' Abcdef12','Abcdef12 ','한글Abcd12',null])assert.ok(!validPassword(value));
});
test('hashing preserves exact input; salts differ; hashes reject mismatches',async()=>{
 const password='  나의 긴 비밀번호 문장  ';
 const a=await passwordHash(password),b=await passwordHash(password);
 assert.notEqual(a,b);assert.ok(!a.includes(password));
 assert.ok(await passwordMatches(password,a));assert.ok(!await passwordMatches(password.trim(),a));
 assert.ok(!await passwordMatches(password,'invalid'));
 const token=randomToken();assert.equal(token.length,43);assert.equal(tokenHash(token).length,64);assert.notEqual(token,randomToken());
});
