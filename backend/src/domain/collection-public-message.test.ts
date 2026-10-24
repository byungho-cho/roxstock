import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionPublicMetadata,collectionPublicMessage} from './collection-public-message.js';

test('legacy missing cash message identifies cash rather than a missing market price',()=>{
 assert.equal(collectionPublicMessage('snapshot not written: missing prices for CURRENT_CASH_MISSING'),'스냅샷 미생성: 예수금이 등록되지 않았습니다.');
});
test('manual lease credentials are hidden while hashed owner identity remains traceable',()=>{
 const result=collectionPublicMetadata({lockOwner:'private-lease',ownerId:'0123456789abcdef'}) as Record<string,string>;
 assert.equal(result.lockOwner,'[민감 원문 숨김]');assert.equal(result.ownerId,'0123456789abcdef');
});
