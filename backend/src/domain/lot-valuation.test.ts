import assert from 'node:assert/strict';
import test from 'node:test';
import { valueBuyLot } from './lot-valuation.js';
const now = new Date('2026-10-01T03:10:00Z');
test('recent buy valuation uses original quantity, Seoul calendar days and signed returns', () => {
  const result = valueBuyLot(new Date('2026-09-30T14:59:00Z'), '10', '180000', '200000', now, now);
  assert.equal(result.holdingDays, 1); assert.equal(result.profitLoss, '200000');
  assert.equal(result.buyDate, '2026-09-30'); assert.equal(result.valuationStatus, 'AVAILABLE');
  assert.equal(valueBuyLot(now, '10', '100', '90', now, now).profitLoss, '-100');
  assert.equal(valueBuyLot(now, '10', '100', '100', now, now).returnRate, '0');
});
test('missing/future quotes and invalid cost stay unavailable without zero substitution', () => {
  for (const [cost, price, quote] of [['100', null, now], ['0', '100', now], ['100', '0', now], ['100', '110', new Date(now.getTime() + 1)]] as const) {
    const result = valueBuyLot(now, '10', cost, price, quote, now);
    assert.equal(result.currentPrice, null); assert.equal(result.profitLoss, null); assert.equal(result.returnRate, null);
  }
});
