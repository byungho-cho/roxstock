import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authContext} from '../auth/context.js';
import {scopedClient} from '../auth/scoped-db.js';
import {securityUsageReasons} from './security-usage.js';

const admin={userId:1n,role:'ADMIN',sessionId:'test',mustChangePassword:false};
test('administrator legacy-watchlist reads stay blocked but deletion guard can read existence labels',async()=>{
 let reads=0;
 const db=scopedClient({watchlistItem:{count:async()=>1},$queryRaw:async(sql:TemplateStringsArray,...ids:bigint[])=>{
  reads++;assert.equal(ids.length,5);assert.ok(ids.every(id=>id===2487n));
  const text=sql.join('?');for(const table of ['buy_trades','account_watchlist_items','watchlist_items','dividends','daily_position_snapshots'])assert.ok(text.includes(table));
  assert.ok(!/user_id\s*=/.test(text));assert.ok(!text.includes('SELECT *'));
  return [{reason:'기존 관심 목록',privateUserId:'must-not-leak'},{reason:'배당'}];
 }});
 await authContext.run(admin,async()=>{
  await assert.rejects(db.watchlistItem.count(),{code:'LEGACY_PERSONAL_DATA'});
  assert.deepEqual(await securityUsageReasons(db as never,2487n),['기존 관심 목록','배당']);
 });assert.equal(reads,1);
});
test('ordinary users and unauthenticated contexts cannot query cross-user usage',async()=>{
 const db={$queryRaw:async()=>{throw Error('MUST_NOT_QUERY');}};
 await assert.rejects(securityUsageReasons(db as never,1n),{code:'ADMIN_REQUIRED'});
 await authContext.run({...admin,role:'USER'},()=>assert.rejects(securityUsageReasons(db as never,1n),{code:'ADMIN_REQUIRED'}));
});
test('unused securities have no deletion blockers',async()=>{
 await authContext.run(admin,async()=>assert.deepEqual(await securityUsageReasons({$queryRaw:async()=>[]} as never,1n),[]));
});
