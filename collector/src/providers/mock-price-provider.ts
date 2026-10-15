import type { PriceObservation, PriceProvider, SecurityTarget } from '../types.js';

export class MockPriceProvider implements PriceProvider {
  readonly name = 'mock';

  async fetchPrice(security: SecurityTarget): Promise<PriceObservation> {
    const numeric = Number(security.symbol.replace(/\D/g, '').slice(-4)) || 1;
    const current = 10_000 + numeric;
    return {
      symbol: security.symbol,
      currentPrice: String(current),
      previousClosePrice: String(current - 100),
      observedAt: new Date(),
      marketStatus: 'MOCK',
      freshness: 'CURRENT',
    };
  }
}
