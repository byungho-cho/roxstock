import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../generated/prisma/index.js';
import { calculateDashboard, calculateHoldings, type PortfolioLotInput } from './portfolio.js';

const lot = (overrides: Partial<PortfolioLotInput> = {}): PortfolioLotInput => ({
  securityId: 1n, symbol: '005930', name: '삼성전자', marketType: 'KOSPI',
  quantity: new Prisma.Decimal(5), unitPrice: new Prisma.Decimal(100), soldQuantities: [],
  currentPrice: new Prisma.Decimal(120), previousClosePrice: new Prisma.Decimal(110),
  priceUpdatedAt: new Date('2026-09-28T01:00:00Z'), marketStatus: 'OPEN', ...overrides,
});

test('보유종목은 Lot별 잔여수량과 매입금액을 합산한다', () => {
  const holdings = calculateHoldings([
    lot({ quantity: new Prisma.Decimal(5), unitPrice: new Prisma.Decimal(100), soldQuantities: [new Prisma.Decimal(2)] }),
    lot({ quantity: new Prisma.Decimal(2), unitPrice: new Prisma.Decimal(150) }),
  ]);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0]?.quantity.toString(), '5');
  assert.equal(holdings[0]?.purchaseAmount.toString(), '600');
  assert.equal(holdings[0]?.marketValue?.toString(), '600');
  assert.equal(holdings[0]?.unrealizedProfitLoss?.toString(), '0');
});

test('전량 매도한 Lot은 보유종목에서 제외한다', () => {
  const holdings = calculateHoldings([lot({ soldQuantities: [new Prisma.Decimal(5)] })]);
  assert.equal(holdings.length, 0);
});

test('가격이 누락되면 총자산을 0원으로 만들지 않는다', () => {
  const holdings = calculateHoldings([lot({ currentPrice: null, previousClosePrice: null, priceUpdatedAt: null })]);
  const dashboard = calculateDashboard(new Prisma.Decimal(1000), holdings);
  assert.equal(dashboard.pricingComplete, false);
  assert.equal(dashboard.stockValue, null);
  assert.equal(dashboard.totalAssetValue, null);
  assert.deepEqual(dashboard.missingPriceSymbols, ['005930']);
});

test('가격이 모두 있으면 예수금과 평가금액을 더해 총자산을 계산한다', () => {
  const holdings = calculateHoldings([lot()]);
  const dashboard = calculateDashboard(new Prisma.Decimal(1000), holdings);
  assert.equal(dashboard.stockValue?.toString(), '600');
  assert.equal(dashboard.totalAssetValue?.toString(), '1600');
  assert.equal(dashboard.unrealizedProfitLoss?.toString(), '100');
  assert.equal(dashboard.unrealizedReturnRate?.toString(), '20');
});
