import { apiEnvelope } from '../../data/apiClient';
import type { CashHistoryDto, CashTransactionDto, TradeDto, TradeReport } from '../../data/roxstockApi';

// Trade API multiplies Decimal(19,4) quantities and prices: retain all 8 decimal places.
const scale = 100000000n;
export function amount(value: string | null | undefined): bigint | null {
  if (value == null || !/^-?\d+(\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const result = BigInt(whole) * scale + BigInt(fraction.padEnd(8, '0'));
  return value.startsWith('-') ? -result : result;
}
export function won(value: bigint | null, signed = false) {
  if (value === null) return '—';
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : signed && value > 0n ? '+' : ''}${((absolute + scale / 2n) / scale).toLocaleString('ko-KR')}원`;
}
export function rate(profit: bigint | null, cost: bigint | null) {
  if (profit === null || cost === null || cost <= 0n) return '—';
  const absolute = profit < 0n ? -profit : profit;
  const tenths = (absolute * 1000n + cost / 2n) / cost;
  return `${profit < 0n ? '-' : profit > 0n ? '+' : ''}${tenths / 10n}.${tenths % 10n}%`;
}
export type Totals = { buy: bigint | null; sell: bigint | null; cost: bigint | null; trading: bigint | null; dividend: bigint | null; total: bigint | null };
export type ProfitEvent = { date: string; securityId: string; name: string; kind: 'BUY' | 'SELL' | 'DIVIDEND'; buy: bigint | null; sell: bigint | null; trading: bigint | null; dividend: bigint | null; cost: bigint | null };
export type Group = { id: string; label: string; totals: Totals; events: ProfitEvent[] };
export type ProfitData = { totals: Totals; years: Group[]; stocks: Group[]; events: ProfitEvent[] };
const add = (a: bigint | null, b: bigint | null) => a === null || b === null ? null : a + b;
const seoulDate = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(value));
export function totals(events: ProfitEvent[]): Totals {
  const sum = (key: 'buy' | 'sell' | 'cost' | 'trading' | 'dividend') => events.reduce<bigint | null>((sum, row) => add(sum, row[key]), 0n);
  const trading = sum('trading'), dividend = sum('dividend');
  return { buy: sum('buy'), sell: sum('sell'), cost: sum('cost'), trading, dividend, total: add(trading, dividend) };
}
export function groups(events: ProfitEvent[], by: 'year' | 'stock' | 'month'): Group[] {
  const map = new Map<string, ProfitEvent[]>();
  for (const row of events) {
    const id = by === 'stock' ? row.securityId : row.date.slice(0, by === 'year' ? 4 : 7);
    const rows = map.get(id) ?? [];
    rows.push(row);
    map.set(id, rows);
  }
  return [...map].map(([id, rows]) => ({ id, label: by === 'stock' ? rows[0].name : id, events: rows, totals: totals(rows) })).sort((a, b) => by === 'stock' ? a.label.localeCompare(b.label, 'ko') : b.id.localeCompare(a.id));
}
export function calculateProfit(trades: TradeDto[], dividends: CashTransactionDto[], today: string): ProfitData {
  const events: ProfitEvent[] = trades.map(row => {
    const value = amount(row.amount), profit = row.type === 'SELL' ? amount(row.realizedProfitLoss) : 0n;
    return { date: seoulDate(row.tradedAt), securityId: row.security.id, name: row.security.name, kind: row.type,
      buy: row.type === 'BUY' ? value : 0n, sell: row.type === 'SELL' ? value : 0n, trading: profit, dividend: 0n,
      // Existing API: quantity × (sell price - connected buy price); subtract to recover sold-lot cost.
      cost: row.type === 'SELL' ? value === null || profit === null ? null : value - profit : 0n };
  });
  for (const row of dividends) {
    if (!row.dividend) throw new Error('배당의 종목 연결 정보를 확인할 수 없습니다.');
    events.push({ date: seoulDate(row.transactionDate), securityId: row.dividend.securityId, name: row.dividend.securityName, kind: 'DIVIDEND', buy: 0n, sell: 0n, cost: 0n, trading: 0n, dividend: amount(row.dividend.netAmount) });
  }
  const current = events.filter(row => row.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  return { events: current, totals: totals(current), years: groups(current, 'year'), stocks: groups(current, 'stock') };
}
export async function loadProfit(accountId: string, today: string, signal: AbortSignal): Promise<ProfitData> {
  const prefix = `/accounts/${encodeURIComponent(accountId)}`;
  const trades = await apiEnvelope<TradeReport>(`${prefix}/trades?to=${today}`, { signal });
  const dividends: CashTransactionDto[] = [], ids = new Set<string>();
  let expected: number | undefined, firstPage = '';
  for (let offset = 0; ; offset += 100) {
    const page = await apiEnvelope<CashHistoryDto>(`${prefix}/cash-transactions?types=DIVIDEND&to=${today}&limit=100&offset=${offset}`, { signal });
    if (expected === undefined) { expected = page.meta.total; firstPage = JSON.stringify(page); }
    if (!Number.isInteger(expected) || expected < 0 || expected !== page.meta.total) throw new Error('조회 중 배당 내역이 변경되었습니다.');
    for (const row of page.data) { if (ids.has(row.id) || row.transactionType !== 'DIVIDEND') throw new Error('배당 조회 결과가 일치하지 않습니다.'); ids.add(row.id); dividends.push(row); }
    if (dividends.length === expected) break;
    if (!page.data.length || dividends.length > expected) throw new Error('배당 내역을 모두 조회하지 못했습니다.');
  }
  // Publish one immutable account result, and reject records edited while its pages were loading.
  const [verifiedTrades, verifiedDividends] = await Promise.all([
    apiEnvelope<TradeReport>(`${prefix}/trades?to=${today}`, { signal }),
    apiEnvelope<CashHistoryDto>(`${prefix}/cash-transactions?types=DIVIDEND&to=${today}&limit=100&offset=0`, { signal }),
  ]);
  if (JSON.stringify(trades) !== JSON.stringify(verifiedTrades) || firstPage !== JSON.stringify(verifiedDividends)) throw new Error('조회 중 거래 기록이 변경되었습니다. 다시 시도해 주세요.');
  return calculateProfit(trades.data, dividends, today);
}
