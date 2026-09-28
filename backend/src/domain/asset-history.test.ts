import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../generated/prisma/index.js';

import { calculateAssetPeriod, calculatePointChange } from './asset-history.js';

const d = (value: number) => new Prisma.Decimal(value);

test('asset period excludes net deposits and withdrawals from profit', () => {
  assert.deepEqual(calculateAssetPeriod(
    [{ totalAssetValue: d(1_000_000) }, { totalAssetValue: d(1_250_000) }],
    d(200_000),
    d(50_000),
  ), {
    assetChange: '250000', netContribution: '150000', profitLoss: '100000', returnRate: '10',
  });
});

test('asset period does not invent a zero return with insufficient snapshots', () => {
  assert.deepEqual(calculateAssetPeriod([{ totalAssetValue: d(1_000_000) }], d(0), d(0)), {
    assetChange: null, netContribution: '0', profitLoss: null, returnRate: null,
  });
});

test('point change is null for first point and handles a zero denominator', () => {
  assert.deepEqual(calculatePointChange(d(100)), { change: null, changeRate: null });
  assert.deepEqual(calculatePointChange(d(100), d(0)), { change: '100', changeRate: null });
  assert.deepEqual(calculatePointChange(d(120), d(100)), { change: '20', changeRate: '20' });
});
