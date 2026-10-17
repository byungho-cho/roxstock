import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionPublicMetadata} from './collection-public-message.js';
test('manual lease credentials are hidden while hashed owner identity remains traceable',()=>{
 const result=collectionPublicMetadata({lockOwner:'private-lease',ownerId:'0123456789abcdef'}) as Record<string,string>;
 assert.equal(result.lockOwner,'[민감 원문 숨김]');assert.equal(result.ownerId,'0123456789abcdef');
});
