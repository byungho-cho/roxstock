import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '../generated/prisma/index.js';
import {
  calculateBuyBalance,
  calculateRemainingQuantity,
  calculateSellBalance,
} from './trade.js';

const decimal = (value: string) => new Prisma.Decimal(value);

test('매수금액과 거래비용을 예수금에서 차감한다', () => {
  const result = calculateBuyBalance(decimal('1000000'), decimal('10'), decimal('50000'), decimal('1000'));
  assert.equal(result.amount.toString(), '500000');
  assert.equal(result.balanceAfter.toString(), '499000');
});

test('매도금액에서 거래비용을 뺀 금액을 예수금에 더한다', () => {
  const result = calculateSellBalance(decimal('100000'), decimal('4'), decimal('60000'), decimal('500'));
  assert.equal(result.amount.toString(), '240000');
  assert.equal(result.balanceAfter.toString(), '339500');
});

test('한 매수 Lot의 여러 분할매도를 합산해 잔여수량을 계산한다', () => {
  const remaining = calculateRemainingQuantity(decimal('10'), [decimal('3'), decimal('2.5')]);
  assert.equal(remaining.toString(), '4.5');
});
