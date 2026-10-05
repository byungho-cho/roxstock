import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../generated/prisma/index.js';
import { calculateDashboardPerformance, type DashboardPerformanceInput } from './dashboard-performance.js';

const decimal = (value: number | string) => new Prisma.Decimal(value);
const snapshot = (date: string, cash: number, stock: number) => ({
  snapshotDate: new Date(`${date}T00:00:00.000Z`),
  cashBalance: decimal(cash),
  stockValue: decimal(stock),
  totalAssetValue: decimal(cash + stock),
});
const input = (overrides: Partial<DashboardPerformanceInput> = {}): DashboardPerformanceInput => ({
  currentCashBalance: decimal(700),
  currentStockValue: decimal(500),
  previousDaySnapshot: snapshot('2026-09-28', 600, 400),
  previousMonthEndSnapshot: snapshot('2026-08-31', 800, 300),
  todayDepositAmount: decimal(100),
  todayWithdrawalAmount: decimal(50),
  ...overrides,
});

test('입출금을 제거한 총자산 변화로 일별손익과 전일자산 기준 수익률을 계산한다', () => {
  const result = calculateDashboardPerformance(input());
  assert.equal(result.previousDayChange, '200');
  assert.equal(result.previousDayChangeRate, '20');
  assert.equal(result.dailyProfit, '150');
  assert.equal(result.dailyProfitRate, '15');
  assert.equal(result.stockMonthlyProfit, '200');
  assert.equal(result.cashMonthlyProfit, '-100');
});

test('당일 매수와 한 Lot 분할매도는 외부 현금흐름으로 빼지 않아 실현·평가손익이 총자산에 반영된다', () => {
  // 매수/매도는 현금과 주식 사이의 내부 이동이다. 수수료·세금 및 실현손익까지 반영된 현재 총자산만 입력한다.
  const result = calculateDashboardPerformance(input({
    currentCashBalance: decimal(580), currentStockValue: decimal(450),
    todayDepositAmount: decimal(0), todayWithdrawalAmount: decimal(0),
  }));
  assert.equal(result.dailyProfit, '30');
  assert.equal(result.dailyProfitRate, '3');
});

test('거래가 없는 날에도 동일한 기준으로 자산 변화를 계산한다', () => {
  const result = calculateDashboardPerformance(input({
    currentCashBalance: decimal(600), currentStockValue: decimal(410),
    todayDepositAmount: decimal(0), todayWithdrawalAmount: decimal(0),
  }));
  assert.equal(result.dailyProfit, '10');
});

test('월초에는 전월 말 스냅샷을 기준으로 주식과 예수금 변화를 계산한다', () => {
  const result = calculateDashboardPerformance(input({
    previousDaySnapshot: snapshot('2026-08-31', 800, 300),
    previousMonthEndSnapshot: snapshot('2026-08-31', 800, 300),
  }));
  assert.equal(result.stockMonthlyProfit, '200');
  assert.equal(result.cashMonthlyProfit, '-100');
});

test('기준 스냅샷이 없으면 임의의 0 대신 null과 사유를 반환한다', () => {
  const result = calculateDashboardPerformance(input({ previousDaySnapshot: null, previousMonthEndSnapshot: null }));
  assert.equal(result.previousDayChange, null);
  assert.equal(result.previousDayChangeRate, null);
  assert.equal(result.dailyProfit, null);
  assert.equal(result.stockMonthlyProfit, null);
  assert.equal(result.cashMonthlyProfit, null);
  assert.equal(result.dailyProfitUnavailableReason, 'PREVIOUS_DAY_SNAPSHOT_MISSING');
  assert.equal(result.stockMonthlyProfitUnavailableReason, 'PREVIOUS_MONTH_END_SNAPSHOT_MISSING');
});

test('현재 시세가 하나라도 없으면 자산 기반 값은 null이고 예수금 월간 변화는 독립 계산한다', () => {
  const result = calculateDashboardPerformance(input({ currentStockValue: null }));
  assert.equal(result.previousDayChange, null);
  assert.equal(result.previousDayChangeRate, null);
  assert.equal(result.dailyProfit, null);
  assert.equal(result.dailyProfitRate, null);
  assert.equal(result.stockMonthlyProfit, null);
  assert.equal(result.cashMonthlyProfit, '-100');
  assert.equal(result.dailyProfitUnavailableReason, 'CURRENT_PRICE_INCOMPLETE');
});

test('전일 총자산이 0원이면 손익은 계산하되 수익률은 null로 반환한다', () => {
  const result = calculateDashboardPerformance(input({ previousDaySnapshot: snapshot('2026-09-28', 0, 0) }));
  assert.equal(result.previousDayChange, '1200');
  assert.equal(result.previousDayChangeRate, null);
  assert.equal(result.dailyProfit, '1150');
  assert.equal(result.dailyProfitRate, null);
  assert.equal(result.dailyProfitRateUnavailableReason, 'PREVIOUS_DAY_ASSET_VALUE_ZERO');
});

