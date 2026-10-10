import assert from 'node:assert/strict';
import test from 'node:test';
import {accountUpdatedAt} from '../../src/utils/accountUpdatedAt';
test('account time is Seoul, zero-padded and 24-hour regardless of runtime timezone',()=>{
 assert.equal(accountUpdatedAt('2026-10-08T23:01:00Z'),'2026.10.09 08:01');
 assert.equal(accountUpdatedAt('2026-10-09T15:00:00Z'),'2026.10.10 00:00');
 assert.equal(accountUpdatedAt('2026-10-09T08:10:00Z'),'2026.10.09 17:10');
 for(const value of [null,undefined,'invalid'])assert.equal(accountUpdatedAt(value),'—');
});
