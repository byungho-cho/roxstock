import test from 'node:test';
import assert from 'node:assert/strict';
import { displayListWithinLimit, orderStocks, reorderVisible, parseKisTrades, quoteMarkets, type DisplayStock } from './live-quotes.js';
const stock = (id: string, held = false): DisplayStock => ({ id, symbol: id.padStart(6, '0'), name: id, held, watched: false, traded: false, quantity: held ? 10 : 0, purchaseAmount: held ? 100 : 0, marketValue: held ? 200 : null, profit: held ? 100 : null, initial: null });
test('six stable sorts keep non-held rows in manual order and never mutate input', () => {
    const rows = [stock('1'), stock('2', true), stock('3', true), stock('4')], order = ['4', '3', '2', '1'], q = { ...Object.fromEntries(rows.map(s => [s.symbol, { symbol: s.symbol, market: 'TOTAL' as const, price: 20, change: 1, rate: 2, observedAt: new Date().toISOString(), receivedAt: Date.now(), source: 'KIS' as const }])) };
    for (const sort of ['manual', 'name', 'price', 'rate', 'holding', 'profit'] as const) {
        const got = orderStocks(rows, order, sort, q).map(s => s.id);
        assert.equal(got.length, 4);
        if (sort === 'holding' || sort === 'profit')
            assert.deepEqual(got, ['3', '2', '4', '1']);
        if (sort === 'price' || sort === 'rate' || sort === 'manual')
            assert.deepEqual(got, order);
    }
    assert.deepEqual(rows.map(s => s.id), ['1', '2', '3', '4']);
});
test('filtered drag preserves all hidden slots; original order and no-op are stable', () => { const all = ['1', '2', '3', '4', '5']; assert.deepEqual(reorderVisible(all, ['1', '3', '5'], '5', '1'), ['5', '2', '1', '4', '3']); assert.deepEqual(reorderVisible(all, ['1', '3', '5'], '1', '1'), all); assert.deepEqual(reorderVisible(all, ['1', '3'], '9', '1'), all); });
test('real trade parsing keeps market separate, handles batched 47-field rows and loss sign', () => { const fields = Array(47).fill('0'); Object.assign(fields, { 0: '005930', 1: '090100', 2: '100', 3: '5', 4: '10', 5: '9.09', 12: '1', 33: '20261030', 46: 'K' }); for (const [market, tr] of Object.entries(quoteMarkets)) {
    const rows = parseKisTrades(`0|${tr}|002|${fields.join('^')}^${fields.join('^')}`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.market, market);
    assert.equal(rows[0]!.change, -10);
    assert.equal(rows[0]!.rate, -9.09);
} for (const frame of ['1|H0STCNT0|001|x', '0|PRIVATE|001|x', '0|H0STCNT0|001|x'])
    assert.throws(() => parseKisTrades(frame)); });

test('display limit allows 50, blocks 51, and preserves legacy reorder/removal without adding members',()=>{const ids=Array.from({length:51},(_,i)=>String(i+1));assert.equal(displayListWithinLimit(ids.slice(0,50)),true);assert.equal(displayListWithinLimit(ids),false);assert.equal(displayListWithinLimit([...ids].reverse(),ids),true);assert.equal(displayListWithinLimit(ids.slice(1),ids),true);assert.equal(displayListWithinLimit([...ids.slice(1),'999'],ids),false);});
