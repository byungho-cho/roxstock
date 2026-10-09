import assert from 'node:assert/strict';
import test from 'node:test';
import { cashAllocation } from './cashAllocation';
import { colors } from '../styles/tokens';

const examples = [
  [0, '#ef4444', '#bfdbfe'], [19.99, '#f57a7a', '#8ab7fb'], [20, '#f57a7a', '#8ab7fb'],
  [20.001, '#22c55e', '#fef08a'], [22, '#3dce75', '#fae470'], [28, '#8ceab9', '#eebf22'],
  [29.999, '#a7f3d0', '#eab308'], [30, '#f89494', '#70a6f9'], [40, '#fbafaf', '#5594f8'],
  [50, '#fecaca', '#3b82f6'], [60, '#fecaca', '#3b82f6'], [100, '#fecaca', '#3b82f6'],
] as const;
for (const [cash, stockBar, cashBar] of examples) test(`final option 3: cash ${cash}%`, () => {
  const result = cashAllocation(100 - cash, cash), stable = cash > 20 && cash < 30;
  assert.equal(result.available, true);
  assert.equal(result.stockColor, stable ? colors.positive : colors.marketRise);
  assert.equal(result.cashColor, stable ? colors.warning : colors.marketFall);
  assert.equal(result.stockBarColor, stockBar);
  assert.equal(result.cashBarColor, cashBar);
  assert.ok(Math.abs(result.cashPercent - cash) < 1e-10);
  assert.equal(result.stockPercent + result.cashPercent, 100);
});
test('unknown allocation stays neutral and differs from valid zero cash', () => {
  for (const [stock, cash, complete] of [[0, 0, true], [null, 20, true], [100, null, true], [100, 20, false], [NaN, 20, true], [-10, 20, true], [100, -10, true]] as const) {
    const result = cashAllocation(stock, cash, complete);
    assert.equal(result.available, false);
    assert.ok(Number.isNaN(result.cashPercent));
    assert.equal(result.cashColor, colors.textMuted);
    assert.equal(result.stockBarColor, colors.textMuted);
  }
  assert.equal(cashAllocation(100, 0).cashPercent, 0);
});
