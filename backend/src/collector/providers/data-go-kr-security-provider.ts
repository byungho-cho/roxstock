import type { SecurityMasterBatch, SecurityMasterItem, SupportedMarketType } from '../types.js';

interface ApiItem {
  basDt?: unknown;
  srtnCd?: unknown;
  itmsNm?: unknown;
  mrktCtg?: unknown;
}

interface ApiResponse {
  response?: {
    header?: { resultCode?: unknown; resultMsg?: unknown };
    body?: { totalCount?: unknown; items?: { item?: ApiItem | ApiItem[] } | '' };
  };
}

const formatUtcDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
};

const marketType = (value: unknown): SupportedMarketType | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'KOSPI' || normalized === '유가증권시장') return 'KOSPI';
  if (normalized === 'KOSDAQ' || normalized === '코스닥시장') return 'KOSDAQ';
  return null;
};

const toItems = (value: ApiItem | ApiItem[] | undefined): ApiItem[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

export const parseSecurityMasterResponse = (payload: unknown): { totalCount: number; items: SecurityMasterItem[] } => {
  const parsed = payload as ApiResponse;
  const code = String(parsed.response?.header?.resultCode ?? '');
  if (code !== '00') throw new Error(`data.go.kr error ${code || 'UNKNOWN'}: ${String(parsed.response?.header?.resultMsg ?? '')}`);
  const rawItems = typeof parsed.response?.body?.items === 'object'
    ? toItems(parsed.response.body.items.item)
    : [];
  const items: SecurityMasterItem[] = [];
  for (const raw of rawItems) {
    const market = marketType(raw.mrktCtg);
    const symbol = String(raw.srtnCd ?? '').replace(/^A/i, '').trim();
    const name = String(raw.itmsNm ?? '').trim();
    if (market && /^\d{6}$/.test(symbol) && name) items.push({ symbol, name, marketType: market });
  }
  return { totalCount: Number(parsed.response?.body?.totalCount ?? 0), items };
};

export interface DataGoKrSecurityProviderOptions {
  serviceKey: string;
  endpoint: string;
  timeoutMs: number;
  pageSize: number;
  lookbackDays: number;
  now?: Date;
}

export class DataGoKrSecurityProvider {
  readonly name = 'data-go-kr-stock-price';

  constructor(private readonly options: DataGoKrSecurityProviderOptions) {}

  private async fetchPage(baseDate: string, pageNo: number): Promise<{ totalCount: number; items: SecurityMasterItem[] }> {
    const url = new URL(this.options.endpoint);
    url.searchParams.set('serviceKey', this.options.serviceKey);
    url.searchParams.set('resultType', 'json');
    url.searchParams.set('basDt', baseDate);
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('numOfRows', String(this.options.pageSize));
    const response = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs) });
    if (!response.ok) throw new Error(`data.go.kr HTTP ${response.status}`);
    return parseSecurityMasterResponse(await response.json());
  }

  async fetchLatest(): Promise<SecurityMasterBatch> {
    const today = this.options.now ?? new Date();
    let selected: { baseDate: string; totalCount: number; items: SecurityMasterItem[] } | null = null;
    for (let offset = 0; offset <= this.options.lookbackDays; offset += 1) {
      const candidate = new Date(today.getTime() - offset * 86_400_000);
      const baseDate = formatUtcDate(candidate);
      const first = await this.fetchPage(baseDate, 1);
      if (first.totalCount > 0 && first.items.length > 0) {
        selected = { baseDate, ...first };
        break;
      }
    }
    if (!selected) throw new Error(`no KOSPI/KOSDAQ data found within ${this.options.lookbackDays} days`);
    const pageCount = Math.ceil(selected.totalCount / this.options.pageSize);
    for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
      selected.items.push(...(await this.fetchPage(selected.baseDate, pageNo)).items);
    }
    const unique = new Map<string, SecurityMasterItem>();
    for (const item of selected.items) unique.set(`${item.marketType}:${item.symbol}`, item);
    return { baseDate: selected.baseDate, items: [...unique.values()] };
  }
}
