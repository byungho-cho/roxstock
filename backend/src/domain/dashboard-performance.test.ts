import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@roxstock/shared/prisma';
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
  monthDepositAmount: decimal(100),
  monthWithdrawalAmount: decimal(50),
  ...overrides,
});

test('월중 추가 매수와 외부 입출금은 월간 수익으로 잡지 않는다', () => {
  const base = { previousMonthEndSnapshot: snapshot('2026-08-31', 700, 300),
    monthDepositAmount: decimal(0), monthWithdrawalAmount: decimal(0) };
  assert.equal(calculateDashboardPerformance(input({ ...base,
    currentCashBalance: decimal(200), currentStockValue: decimal(800),
  })).stockMonthlyProfit, '0');
  assert.equal(calculateDashboardPerformance(input({ ...base,
    currentCashBalance: decimal(500), currentStockValue: decimal(800), monthDepositAmount: decimal(300),
  })).stockMonthlyProfit, '0');
  assert.equal(calculateDashboardPerformance(input({ ...base,
    currentCashBalance: decimal(100), currentStockValue: decimal(800), monthWithdrawalAmount: decimal(100),
  })).stockMonthlyProfit, '0');
});

test('월간 손익은 입출금 보정한 일별손익 합계와 같고 오늘을 한 번만 포함한다', () => {
  const opening = snapshot('2026-08-31', 700, 300);
  const first = calculateDashboardPerformance(input({ previousDaySnapshot: opening,
    previousMonthEndSnapshot: opening, currentCashBalance: decimal(500), currentStockValue: decimal(800),
    todayDepositAmount: decimal(200), todayWithdrawalAmount: decimal(0),
    monthDepositAmount: decimal(200), monthWithdrawalAmount: decimal(0) }));
  const second = calculateDashboardPerformance(input({ previousDaySnapshot: snapshot('2026-09-01', 500, 800),
    previousMonthEndSnapshot: opening, currentCashBalance: decimal(350), currentStockValue: decimal(810),
    todayDepositAmount: decimal(0), todayWithdrawalAmount: decimal(100),
    monthDepositAmount: decimal(200), monthWithdrawalAmount: decimal(100) }));
  assert.equal(first.stockMonthlyProfit, first.dailyProfit);
  assert.equal(second.stockMonthlyProfit, decimal(first.dailyProfit!).plus(second.dailyProfit!).toString());
  assert.equal(second.stockMonthlyProfit, '60');
});

test('소수 손실과 예수금 누락을 보존하고 전일 누락만으로 월간 계산을 막지 않는다', () => {
  const result = calculateDashboardPerformance(input({ previousDaySnapshot: null,
    previousMonthEndSnapshot: snapshot('2026-08-31', 700, 300),
    currentCashBalance: decimal('200.1234'), currentStockValue: decimal('799.0001'),
    monthDepositAmount: decimal(0), monthWithdrawalAmount: decimal(0) }));
  assert.equal(result.stockMonthlyProfit, '-0.8765');
  const missing = calculateDashboardPerformance(input({ currentCashBalance: null }));
  assert.equal(missing.stockMonthlyProfit, null);
  assert.equal(missing.stockMonthlyProfitUnavailableReason, 'CURRENT_CASH_MISSING');
});

test('입출금을 제거한 총자산 변화로 일별손익과 전일자산 기준 수익률을 계산한다', () => {
  const result = calculateDashboardPerformance(input());
  assert.equal(result.previousDayChange, '200');
  assert.equal(result.previousDayChangeRate, '20');
  assert.equal(result.dailyProfit, '150');
  assert.equal(result.dailyProfitRate, '15');
  assert.equal(result.stockMonthlyProfit, '50');
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

test('월초에도 월간 손익은 외부 입출금을 제외하고 예수금 증감은 기존 기준을 유지한다', () => {
  const result = calculateDashboardPerformance(input({
    previousDaySnapshot: snapshot('2026-08-31', 800, 300),
    previousMonthEndSnapshot: snapshot('2026-08-31', 800, 300),
  }));
  assert.equal(result.stockMonthlyProfit, '50');
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

