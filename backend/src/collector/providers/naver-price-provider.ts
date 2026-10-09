import { normalizeProviderSymbol, isSecuritySymbol } from '../../domain/security-symbol.js';
import type { PriceObservation, PriceProvider, SecurityTarget } from '../types.js';
import { getSeoulClock } from '../time.js';

type FetchLike = typeof fetch;

interface NaverStockData {
  itemCode?: string;
  closePriceRaw?: string;
  compareToPreviousClosePriceRaw?: string;
  compareToPreviousPrice?: { name?: string };
  localTradedAt?: string;
  marketStatus?: string;
  overMarketPriceInfo?: {
    tradingSessionType?: string;
    overMarketStatus?: string;
    overPrice?: string;
    overPriceRaw?: string;
    compareToPreviousClosePrice?: string;
    compareToPreviousClosePriceRaw?: string;
    compareToPreviousPrice?: { name?: string };
    localTradedAt?: string;
  };
}

interface NaverResponse {
  pollingInterval?: number;
  datas?: NaverStockData[];
}

const normalizeSymbol = (symbol: string): string => {
  const normalized = normalizeProviderSymbol(symbol);
  if (!isSecuritySymbol(normalized)) throw new Error(`Unsupported Korean security symbol: ${symbol}`);
  return normalized;
};

const positivePrice = (value: string | undefined, field: string): number => {
  const parsed = Number(value?.replaceAll(',', ''));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid ${field} from Naver Finance`);
  return parsed;
};

const numeric = (value: string | undefined): number => Number((value ?? '0').replaceAll(',', ''));

export const parseNaverPrice = (security: SecurityTarget, response: NaverResponse, now = new Date()): PriceObservation => {
  const symbol = normalizeSymbol(security.symbol);
  const data = response.datas?.find((item) => item.itemCode === symbol);
  if (!data) throw new Error(`Naver Finance response did not contain ${symbol}`);

  const overMarket = data.overMarketPriceInfo;
  const usesNxt = overMarket?.overMarketStatus === 'OPEN'
    && (overMarket.tradingSessionType === 'PRE_MARKET' || overMarket.tradingSessionType === 'AFTER_MARKET')
    && Boolean(overMarket.overPriceRaw ?? overMarket.overPrice);
  const current = positivePrice(
    usesNxt ? (overMarket?.overPriceRaw ?? overMarket?.overPrice) : data.closePriceRaw,
    usesNxt ? 'overMarketPriceInfo.overPrice' : 'closePriceRaw',
  );
  const difference = Math.abs(numeric(usesNxt
    ? (overMarket?.compareToPreviousClosePriceRaw ?? overMarket?.compareToPreviousClosePrice)
    : data.compareToPreviousClosePriceRaw));
  if (!Number.isFinite(difference)) throw new Error('Invalid compareToPreviousClosePriceRaw from Naver Finance');
  const direction = usesNxt ? overMarket?.compareToPreviousPrice?.name : data.compareToPreviousPrice?.name;
  const previous = direction === 'RISING' ? current - difference : direction === 'FALLING' ? current + difference : current;
  if (previous <= 0) throw new Error('Calculated previous close price is invalid');
  const localTradedAt = usesNxt ? overMarket?.localTradedAt : data.localTradedAt;
  if (!localTradedAt) throw new Error('Naver Finance response did not include localTradedAt');

  const observedAt = new Date(localTradedAt);
  if (Number.isNaN(observedAt.getTime())) throw new Error('Invalid localTradedAt from Naver Finance');
  const observedDate = getSeoulClock(observedAt).dateKey;
  const nowClock = getSeoulClock(now);
  const expectedDate = nowClock.hour < 6
    ? getSeoulClock(new Date(now.getTime() - 24 * 60 * 60 * 1000)).dateKey
    : nowClock.dateKey;
  const stale = observedDate !== expectedDate;

  return {
    symbol,
    currentPrice: String(current),
    previousClosePrice: String(previous),
    observedAt,
    marketStatus: usesNxt ? `NXT_${overMarket?.tradingSessionType}` : (data.marketStatus ?? 'UNKNOWN'),
    freshness: stale ? 'STALE' : 'CURRENT',
    freshnessReason: stale ? `provider trading date ${observedDate} differs from expected market date ${expectedDate}` : undefined,
  };
};

export class NaverPriceProvider implements PriceProvider {
  readonly name = 'naver-finance-polling';

  constructor(
    private readonly requestTimeoutMs: number,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async fetchPrice(security: SecurityTarget): Promise<PriceObservation> {
    const symbol = normalizeSymbol(security.symbol);
    const response = await this.fetchFn(`https://polling.finance.naver.com/api/realtime/domestic/stock/${symbol}`, {
      headers: { accept: 'application/json', 'user-agent': 'RoxStockCollector/1.0' },
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`Naver Finance returned HTTP ${response.status}`);
    return parseNaverPrice(security, (await response.json()) as NaverResponse);
  }
}
