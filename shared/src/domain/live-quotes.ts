export const quoteMarkets = { TOTAL: 'H0UNCNT0', NXT: 'H0NXCNT0', KRX: 'H0STCNT0' } as const;
export type QuoteMarket = keyof typeof quoteMarkets;
export type LiveQuote = {
    symbol: string;
    market: QuoteMarket;
    price: number;
    change: number;
    rate: number;
    observedAt: string;
    receivedAt: number;
    source: 'KIS' | 'CACHE';
    halted?: boolean;
};
export type DisplayStock = {
    id: string;
    symbol: string;
    name: string;
    held: boolean;
    watched: boolean;
    traded: boolean;
    quantity: number;
    purchaseAmount: number;
    marketValue: number | null;
    profit: number | null;
    initial: LiveQuote | null;
};
export const quoteLimit = 41;
export type QuoteSort = 'manual' | 'name' | 'price' | 'rate' | 'holding' | 'profit';
export function orderStocks(rows: DisplayStock[], order: string[], sort: QuoteSort, quotes: Record<string, LiveQuote>) {
    const index = new Map(order.map((id, i) => [id, i]));
    const value = (s: DisplayStock) => { const p = quotes[s.symbol]?.price; return sort === 'price' ? p ?? s.initial?.price ?? -Infinity : sort === 'rate' ? quotes[s.symbol]?.rate ?? s.initial?.rate ?? -Infinity : sort === 'holding' ? (p === undefined ? s.marketValue : p * s.quantity) ?? -Infinity : (p === undefined ? s.profit : p * s.quantity - s.purchaseAmount) ?? -Infinity; };
    return [...rows].sort((a, b) => { let comparison = 0; if (sort === 'name')
        comparison = a.name.localeCompare(b.name, 'ko');
    else if (sort !== 'manual') {
        if ((sort === 'holding' || sort === 'profit') && a.held !== b.held)
            return a.held ? -1 : 1;
        if ((sort !== 'holding' && sort !== 'profit') || a.held)
            comparison = value(b) - value(a);
    } return (Number.isNaN(comparison) ? 0 : comparison) || (index.get(a.id) ?? 1e9) - (index.get(b.id) ?? 1e9) || a.id.localeCompare(b.id); });
}
/** Reorder only visible slots; filtered-out securities keep their exact positions. */
export function reorderVisible(full: string[], visible: string[], from: string, to: string) {
    if (from === to || !visible.includes(from) || !visible.includes(to))
        return full;
    const next = visible.filter(id => id !== from);
    next.splice(visible.indexOf(to), 0, from);
    const selected = new Set(visible);
    let i = 0;
    return full.map(id => selected.has(id) ? next[i++]! : id);
}
export function parseKisTrades(text: string): LiveQuote[] {
    const [flag, tr, count, ...payload] = text.split('|'), market = (Object.keys(quoteMarkets) as QuoteMarket[]).find(m => quoteMarkets[m] === tr), n = Number(count), fields = payload.join('|').split('^');
    if (flag !== '0' || !market || !Number.isInteger(n) || n < 1 || n > 100 || fields.length !== 47 * n)
        throw Error('INVALID_TRADE_FRAME');
    return Array.from({ length: n }, (_, i) => {
        const a = fields.slice(i * 47, (i + 1) * 47), symbol = a[0]!, time = a[1]!, date = a[33]!, sign = ({ 1: 1, 2: 1, 3: 0, 4: -1, 5: -1 } as Record<string, number>)[a[3]!];
        if (!/^\d{6}$/.test(symbol) || !/^(?:[01]\d|2[0-3])[0-5]\d[0-5]\d$/.test(time) || !/^\d{8}$/.test(date) || sign === undefined || ![a[2], a[4], a[5], a[12]].every(x => typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x)))
            throw Error('INVALID_TRADE');
        const price = Number(a[2]), change = Number(a[4]), rate = Number(a[5]);
        if (price <= 0 || Number(a[12]) <= 0 || !Number.isSafeInteger(price) || sign > 0 && (change < 0 || rate < 0) || sign === 0 && (change !== 0 || rate !== 0))
            throw Error('INVALID_PRICE');
        const day = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T00:00:00Z`);
        if (!Number.isFinite(+day) || day.toISOString().slice(0, 10).replaceAll('-', '') !== date)
            throw Error('INVALID_DATE');
        const observedAt = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4)}+09:00`).toISOString();
        if (new Date(observedAt).getTime() > Date.now() + 60000)
            throw Error('FUTURE_TRADE');
        return { symbol, market, price, change: Math.abs(change) * sign, rate: Math.abs(rate) * sign, observedAt, receivedAt: Date.now(), source: 'KIS' };
    });
}

export const maxDisplayStocks=50;
// Preserve existing oversized lists for reorder/removal, without permitting any new member.
export function displayListWithinLimit(ids:readonly string[],previous:readonly string[]=[]):boolean {
  if(ids.length<=maxDisplayStocks)return true;
  const existing=new Set(previous);
  return previous.length>maxDisplayStocks&&ids.length<=previous.length&&ids.every(id=>existing.has(id));
}
