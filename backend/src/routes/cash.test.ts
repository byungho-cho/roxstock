import assert from 'node:assert/strict';
import test from 'node:test';
import { CashTransactionType, Prisma } from '../generated/prisma/index.js';

import { cashDelta, kstMonthRange, kstYearRange, summarizeCashGroups } from './cash.js';

test('cash delta includes fee and tax with the correct sign', () => {
  const amount = new Prisma.Decimal(1000);
  const fee = new Prisma.Decimal(10);
  assert.equal(cashDelta(CashTransactionType.BUY, amount, fee).toString(), '-1010');
  assert.equal(cashDelta(CashTransactionType.SELL, amount, fee).toString(), '990');
  assert.equal(cashDelta(CashTransactionType.DEPOSIT, amount, fee).toString(), '1000');
  assert.equal(cashDelta(CashTransactionType.WITHDRAWAL, amount, fee).toString(), '-1000');
  assert.equal(cashDelta(CashTransactionType.DIVIDEND, amount, fee).toString(), '1000');
});

test('cash summary aggregates all transaction types and net change', () => {
  const decimal = (value: number) => new Prisma.Decimal(value);
  const summary = summarizeCashGroups([
    { transactionType: CashTransactionType.BUY, _sum: { amount: decimal(1000), feeTaxAmount: decimal(10) } },
    { transactionType: CashTransactionType.SELL, _sum: { amount: decimal(600), feeTaxAmount: decimal(5) } },
    { transactionType: CashTransactionType.DEPOSIT, _sum: { amount: decimal(5000), feeTaxAmount: decimal(0) } },
    { transactionType: CashTransactionType.WITHDRAWAL, _sum: { amount: decimal(500), feeTaxAmount: decimal(0) } },
    { transactionType: CashTransactionType.DIVIDEND, _sum: { amount: decimal(100), feeTaxAmount: decimal(0) } },
  ]);
  assert.deepEqual(summary, {
    buy: '1000', sell: '600', deposit: '5000', withdrawal: '500', dividend: '100', netChange: '4185',
  });
});

test('KST month and year ranges use exclusive upper boundaries', () => {
  assert.equal(kstMonthRange(2026, 9).gte.toISOString(), '2026-08-31T15:00:00.000Z');
  assert.equal(kstMonthRange(2026, 12).lt.toISOString(), '2026-12-31T15:00:00.000Z');
  assert.equal(kstYearRange(2026).gte.toISOString(), '2025-12-31T15:00:00.000Z');
  assert.equal(kstYearRange(2026).lt.toISOString(), '2026-12-31T15:00:00.000Z');
});
