import test from 'node:test';import assert from 'node:assert/strict';import {valueCollectionStatus} from './value-collection-status.js';
test('real error takes priority, unavailable items and non-applicable ratios do not become collector failures',()=>{
 assert.equal(valueCollectionStatus({},undefined,[]).collectionStatus,'COMPLETE');
 assert.equal(valueCollectionStatus({eps:'NOT_COLLECTED'},undefined,[]).collectionStatus,'PARTIAL');
 assert.equal(valueCollectionStatus({eps:'NOT_PROVIDED'},{status:'FAILED',reasons:{eps:'CONSENSUS_ITEM_NOT_PROVIDED'}},[]).collectionStatus,'PARTIAL');
 assert.equal(valueCollectionStatus({}, {status:'FAILED',reasons:{per:'EPS_NON_POSITIVE'}},[]).collectionStatus,'COMPLETE');
 assert.equal(valueCollectionStatus({eps:'NOT_PROVIDED'},undefined,[{status:'FAILED',errorCode:'HTTP_429'}]).collectionStatus,'ERROR');
 assert.equal(valueCollectionStatus({}, {status:'PARTIAL',reasons:{},supplemental:{manualAttempt:{errors:{source:'TIMEOUT'}}}},[]).collectionStatus,'ERROR');
});
