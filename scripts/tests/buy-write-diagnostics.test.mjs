import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBuyWrites} from '../filter-buy-write-diagnostics.mjs';
test('trade diagnostics correlate status but never disclose identities or request data',()=>{
 const input=[{reqId:'private-id',req:{method:'POST',url:'/api/buy-trades',headers:{cookie:'secret'},body:{accountId:'12345'}}},{reqId:'other',req:{method:'GET',url:'/api/accounts'}},{reqId:'other',res:{statusCode:200}},{reqId:'private-id',res:{statusCode:404}}].map(JSON.stringify).join('\n');
 assert.deepEqual(summarizeBuyWrites(input),{route:'POST /api/buy-trades',statuses:{404:1},originalResponseCodesAvailable:false});assert.doesNotMatch(JSON.stringify(summarizeBuyWrites(input)),/secret|12345|private-id/);
});
