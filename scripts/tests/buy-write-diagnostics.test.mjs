import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBuyWrites} from '../filter-buy-write-diagnostics.mjs';
test('trade diagnostics correlate status but never disclose identities or request data',()=>{
 const input=[{reqId:'private-id',req:{method:'POST',url:'/api/buy-trades',headers:{cookie:'secret'},body:{accountId:'12345'}}},{reqId:'other',req:{method:'GET',url:'/api/accounts'}},{reqId:'other',res:{statusCode:200}},{reqId:'private-id',res:{statusCode:404}}].map(JSON.stringify).join('\n');
 assert.deepEqual(summarizeBuyWrites(input),{route:'POST /api/buy-trades',statuses:{404:1},responseCodes:{},originalResponseCodesAvailable:false});assert.doesNotMatch(JSON.stringify(summarizeBuyWrites(input)),/secret|12345|private-id/);
});

test('structured rejection codes are counted without copying the source row',()=>{assert.deepEqual(summarizeBuyWrites(JSON.stringify({event:'BUY_WRITE_REJECTED',code:'NOT_FOUND',body:{token:'secret'}})).responseCodes,{NOT_FOUND:1});assert.equal(summarizeBuyWrites(JSON.stringify({event:'BUY_WRITE_REJECTED',code:'NOT_FOUND'})).originalResponseCodesAvailable,true);});
