import test from 'node:test';
import assert from 'node:assert/strict';
import {latestBuy} from '../../src/pages/trade/latestBuy.ts';
test('latest registered purchase uses date then exact BIGINT id, without mutating source order',()=>{
 const rows=[{id:'9007199254740992',boughtAt:'2026-10-01T03:00:00Z',quantity:'11',remainingQuantity:'0'},
 {id:'9999999999999999',boughtAt:'2025-10-01T03:00:00Z',quantity:'99',remainingQuantity:'99'},
 {id:'9007199254740993',boughtAt:'2026-10-01T03:00:00Z',quantity:'20',remainingQuantity:'0'}];
 assert.equal(latestBuy(rows)?.quantity,'20');assert.equal(rows[0].quantity,'11');assert.equal(latestBuy([]),undefined);
});
