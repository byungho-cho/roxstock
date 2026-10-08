import { HistoricalPriceError } from './historical-price-error.js';
import type { Supplemental } from '../domain/period-valuation.js';
export type KrxMarket = 'KOSPI' | 'KOSDAQ';
type Row = Record<string, string>;
const endpoints = { KOSPI: { daily: 'stk_bydd_trd', master: 'stk_isu_base_info' }, KOSDAQ: { daily: 'ksq_bydd_trd', master: 'ksq_isu_base_info' } };
const numeric = (value: string | undefined) => value?.replaceAll(',', '').trim();
const day = (value: string) => value.replaceAll('/', '').replaceAll('-', '');
const validDay = (value: string) => /^\d{8}$/.test(value) && !Number.isNaN(Date.parse(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`));
/** One full-market response per date. Only successful parsed responses are cached. */
export class KrxProvider {
  private cache = new Map<string, { expires: number; rows: Row[] }>();
  private inflight = new Map<string, Promise<Row[]>>();
  constructor(private key: string, private fetcher: typeof fetch = fetch) {}
  async rows(market: KrxMarket, date: string, kind: 'daily' | 'master' = 'daily'): Promise<Row[]> {
    if (!this.key.trim()) throw new HistoricalPriceError('KRX_KEY_MISSING', 'AUTH');
    if (!validDay(date) || date < '20150101') throw new HistoricalPriceError('KRX_DATE_INVALID', 'PROVIDER');
    const id = `${market}:${kind}:${date}`, hit = this.cache.get(id);
    if (hit && hit.expires > Date.now()) return hit.rows;
    const pending = this.inflight.get(id); if (pending) return pending;
    const request = this.request(market, date, kind).then(rows => {
      if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id, { rows, expires: Date.now() + (rows.length ? 3600000 : 30000) });
      return rows;
    }).finally(() => this.inflight.delete(id));
    this.inflight.set(id, request); return request;
  }
  private async request(market: KrxMarket, date: string, kind: 'daily' | 'master'): Promise<Row[]> {
    let response: Response;
    try { response = await this.fetcher(`https://data-dbg.krx.co.kr/svc/apis/sto/${endpoints[market][kind]}?basDd=${date}`, { headers: { AUTH_KEY: this.key, accept: 'application/json' }, signal: AbortSignal.timeout(15000) }); }
    catch { throw new HistoricalPriceError('KRX_COMMUNICATION', 'COMMUNICATION'); }
    if (!response.ok) {
      const category = response.status === 401 ? 'AUTH' : response.status === 403 ? 'PERMISSION' : response.status === 429 ? 'RATE_LIMIT' : 'COMMUNICATION';
      throw new HistoricalPriceError(`KRX_${category}`, category, String(response.status));
    }
    let body: { OutBlock_1?: unknown };
    try { body = await response.json(); } catch { throw new HistoricalPriceError('KRX_RESPONSE_PARSE', 'PARSE'); }
    if (!Array.isArray(body.OutBlock_1) || body.OutBlock_1.some(r => !r || typeof r !== 'object')) throw new HistoricalPriceError('KRX_RESPONSE_SCHEMA', 'PARSE');
    return body.OutBlock_1 as Row[];
  }
  async close(symbol: string, end: Date, market: KrxMarket): Promise<NonNullable<Supplemental['price']>> {
    const normalized = symbol.replace(/^A/, '');
    if (!/^\d{6}$/.test(normalized)) throw new HistoricalPriceError('KRX_SYMBOL_INVALID', 'PROVIDER');
    // Only an explicitly empty entire-market response advances to a previous date.
    for (let offset = 0; offset <= 7; offset++) {
      const date = new Date(end.getTime() - offset * 86400000).toISOString().slice(0,10).replaceAll('-', '');
      const rows = await this.rows(market, date);
      if (!rows.length) continue;
      const row = rows.find(r => r.ISU_CD === normalized);
      if (!row) throw new HistoricalPriceError('KRX_SYMBOL_NO_DATA', 'NO_DATA');
      if (day(row.BAS_DD ?? '') !== date || !/^\d+(\.\d+)?$/.test(numeric(row.TDD_CLSPRC) ?? '') || Number(numeric(row.TDD_CLSPRC)) <= 0) throw new HistoricalPriceError('KRX_PRICE_INVALID', 'PARSE');
      const master = (await this.rows(market, date, 'master')).find(r => r.ISU_SRT_CD === normalized);
      if (!master) throw new HistoricalPriceError('KRX_MASTER_NO_DATA', 'NO_DATA');
      if (master.KIND_STKCERT_TP_NM !== '보통주') throw new HistoricalPriceError('KRX_ORDINARY_SHARE_BASIS_UNCONFIRMED', 'PROVIDER');
      return { value: numeric(row.TDD_CLSPRC)!, date: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`, source: 'KRX_UNADJUSTED_CLOSE', collectedAt: new Date().toISOString(), shareBasis: 'ORDINARY_UNADJUSTED', listedShares: numeric(row.LIST_SHRS), parValue: numeric(master.PARVAL), isin: master.ISU_CD, market };
    }
    throw new HistoricalPriceError('KRX_PERIOD_NO_DATA', 'NO_DATA');
  }
}
let shared: KrxProvider | undefined, configuredKey: string | undefined;
export function configuredKrx(): KrxProvider {
  const key = process.env.KRX_API_KEY?.trim() ?? '';
  if (!shared || key !== configuredKey) { shared = new KrxProvider(key); configuredKey = key; }
  return shared;
}
