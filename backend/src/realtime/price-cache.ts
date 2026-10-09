import { normalizeSecuritySymbol, isSecuritySymbol } from '../domain/security-symbol.js';
export interface RealtimePriceDto {
  securityId: string;
  symbol: string;
  name: string;
  currentPrice: string;
  previousClosePrice: string | null;
  observedAt: string;
  marketStatus: string;
}

type Listener = (prices: RealtimePriceDto[]) => void;

const validDecimal = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0;

const parsePrice = (value: unknown): RealtimePriceDto | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RealtimePriceDto>;
  const timestamp = typeof candidate.observedAt === 'string' ? Date.parse(candidate.observedAt) : Number.NaN;
  if (
    typeof candidate.securityId !== 'string' || !/^\d+$/.test(candidate.securityId)
    || typeof candidate.symbol !== 'string' || !isSecuritySymbol(normalizeSecuritySymbol(candidate.symbol))
    || typeof candidate.name !== 'string' || candidate.name.length === 0
    || !validDecimal(candidate.currentPrice)
    || (candidate.previousClosePrice !== null && !validDecimal(candidate.previousClosePrice))
    || !Number.isFinite(timestamp)
    || typeof candidate.marketStatus !== 'string'
  ) return null;
  return {
    securityId: candidate.securityId,
    symbol: normalizeSecuritySymbol(candidate.symbol),
    name: candidate.name,
    currentPrice: candidate.currentPrice,
    previousClosePrice: candidate.previousClosePrice,
    observedAt: new Date(timestamp).toISOString(),
    marketStatus: candidate.marketStatus,
  };
};

export class RealtimePriceCache {
  private readonly values = new Map<string, RealtimePriceDto>();
  private readonly listeners = new Set<Listener>();

  ingest(input: unknown[]): RealtimePriceDto[] {
    const accepted: RealtimePriceDto[] = [];
    for (const raw of input) {
      const price = parsePrice(raw);
      if (!price) continue;
      const prior = this.values.get(price.symbol);
      if (prior && Date.parse(price.observedAt) < Date.parse(prior.observedAt)) continue;
      this.values.set(price.symbol, price);
      accepted.push(price);
    }
    if (accepted.length > 0) for (const listener of this.listeners) listener(accepted);
    return accepted;
  }

  get(symbols?: Set<string>): RealtimePriceDto[] {
    return [...this.values.values()]
      .filter((price) => !symbols || symbols.has(price.symbol))
      .sort((left, right) => left.symbol.localeCompare(right.symbol));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const realtimePriceCache = new RealtimePriceCache();
