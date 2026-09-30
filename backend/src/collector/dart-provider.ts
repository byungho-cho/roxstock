import { inflateRawSync } from 'node:zlib';

export type DartReportCode = '11013' | '11012' | '11014' | '11011';
export type DartPeriodType = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL';

export interface DartCorporation {
  corpCode: string;
  corpName: string;
  stockCode: string;
  modifiedDate: string;
}

export interface DartReport {
  receiptNo: string;
  receiptDate: string;
  reportName: string;
  reportCode: DartReportCode;
  periodType: DartPeriodType;
  withdrawn: boolean;
}

export interface DartFinancialRow {
  receiptNo: string;
  fiscalYear: number;
  reportCode: DartReportCode;
  corpCode: string;
  statementDivision: string;
  statementName: string;
  accountId: string;
  accountName: string;
  currentAmount: string | null;
  currentYtdAmount: string | null;
  currency: string;
}

export interface DartFinancialValues {
  revenueQuarter: string | null;
  revenueYtd: string | null;
  operatingProfitQuarter: string | null;
  operatingProfitYtd: string | null;
  netIncomeQuarter: string | null;
  netIncomeYtd: string | null;
  totalAssets: string | null;
  totalLiabilities: string | null;
  totalEquity: string | null;
  operatingCashFlowQuarter: string | null;
  operatingCashFlowYtd: string | null;
  capitalExpenditureQuarter: string | null;
  capitalExpenditureYtd: string | null;
  accountSources: Record<string, { statementDivision: string; accountId: string; accountName: string; amount: string | null; ytdAmount: string | null }>;
}

export class DartApiError extends Error {
  constructor(readonly code: string, message: string, readonly noData = false, readonly quotaExceeded = false) {
    super(message);
    this.name = 'DartApiError';
  }
}

export interface DartRequestOptions {
  apiKey: string;
  dailyCallLimit: number;
  minDelayMs: number;
  reserveCall: (limit: number) => Promise<boolean>;
  isCallAllowed?: () => boolean;
  onApiStatus?: (status: string) => Promise<void>;
  fetchFn?: typeof fetch;
  sleepFn?: (milliseconds: number) => Promise<void>;
}

interface DartEnvelope<T> { status: string; message?: string; list?: T[]; total_page?: string | number; }
interface RawCorp { corp_code?: string; corp_name?: string; stock_code?: string; modify_date?: string; }
interface RawReport { rcept_no?: string; rcept_dt?: string; report_nm?: string; corp_code?: string; rm?: string; }
interface RawFinancial extends Record<string, unknown> {
  rcept_no?: string; bsns_year?: string; reprt_code?: string; corp_code?: string;
  sj_div?: string; sj_nm?: string; account_id?: string; account_nm?: string;
  thstrm_amount?: string; thstrm_add_amount?: string; currency?: string;
}

const sleepDefault = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const numericText = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim() || value.trim() === '-') return null;
  const normalized = value.replaceAll(',', '').trim();
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
};

const xmlValue = (xml: string, tag: string): string => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return (match?.[1] ?? '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").trim();
};

/** Reads the single XML file in Open DART's ZIP response without adding a runtime dependency. */
export const unzipDartCorpCodeXml = (data: Uint8Array): string => {
  const direct = new TextDecoder().decode(data.subarray(0, Math.min(data.length, 100)));
  if (direct.includes('<?xml') || direct.includes('<result')) return new TextDecoder('utf-8').decode(data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  const min = Math.max(0, data.length - 65_557);
  for (let i = data.length - 22; i >= min; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new DartApiError('INVALID_CORP_CODE_ARCHIVE', 'Open DART corporation-code response was not a ZIP archive.');
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
    if (name.toLowerCase().endsWith('.xml')) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) break;
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = data.subarray(start, start + compressedSize);
      const uncompressed = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (!uncompressed) throw new DartApiError('UNSUPPORTED_CORP_CODE_COMPRESSION', 'Open DART corporation-code archive uses an unsupported compression method.');
      return new TextDecoder('utf-8').decode(uncompressed);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new DartApiError('CORP_CODE_XML_MISSING', 'Open DART corporation-code archive did not contain an XML file.');
};

export const parseDartCorpCodeXml = (xml: string): DartCorporation[] => [...xml.matchAll(/<list>([\s\S]*?)<\/list>/gi)]
  .map(([, row = '']) => ({
    corpCode: xmlValue(row, 'corp_code'),
    corpName: xmlValue(row, 'corp_name'),
    stockCode: xmlValue(row, 'stock_code'),
    modifiedDate: xmlValue(row, 'modify_date'),
  }))
  .filter((item) => /^\d{8}$/.test(item.corpCode) && /^\d{6}$/.test(item.stockCode) && item.corpName.length > 0);

const dateInReportName = (name: string): { year: number; month: number } | null => {
  const match = name.match(/\((\d{4})\.(\d{2})\)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
};

const expectedPeriod = (fiscalYear: number, fiscalYearEndMonth: number, monthsBeforeEnd: number) => {
  const date = new Date(Date.UTC(fiscalYear, fiscalYearEndMonth - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - monthsBeforeEnd);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
};

/** Maps report titles to DART reprt_code using the displayed reporting-period date. */
export const mapPeriodicReports = (reports: RawReport[], fiscalYear: number): DartReport[] => {
  const parsed = reports.map((raw) => ({ raw, date: dateInReportName(raw.report_nm ?? '') }));
  const annual = parsed.find((item) => item.raw.report_nm?.includes('사업보고서') && item.date?.year === fiscalYear);
  const yearEndMonth = annual?.date?.month ?? 12;
  const targets: Array<{ code: DartReportCode; period: DartPeriodType; months: number; title: string }> = [
    { code: '11013', period: 'Q1', months: 9, title: '분기보고서' },
    { code: '11012', period: 'Q2', months: 6, title: '반기보고서' },
    { code: '11014', period: 'Q3', months: 3, title: '분기보고서' },
    { code: '11011', period: 'ANNUAL', months: 0, title: '사업보고서' },
  ];
  return targets.flatMap((target) => {
    const expected = expectedPeriod(fiscalYear, yearEndMonth, target.months);
    const matches = parsed.filter((item) => item.date?.year === expected.year && item.date.month === expected.month && item.raw.report_nm?.includes(target.title));
    const latest = matches
      .filter((item) => !item.raw.rm?.includes('철'))
      .sort((a, b) => (b.raw.rcept_dt ?? '').localeCompare(a.raw.rcept_dt ?? '') || (b.raw.rcept_no ?? '').localeCompare(a.raw.rcept_no ?? ''))[0];
    if (!latest?.raw.rcept_no || !/^\d{14}$/.test(latest.raw.rcept_no) || !/^\d{8}$/.test(latest.raw.rcept_dt ?? '')) return [];
    return [{
      receiptNo: latest.raw.rcept_no,
      receiptDate: latest.raw.rcept_dt!,
      reportName: latest.raw.report_nm ?? '',
      reportCode: target.code,
      periodType: target.period,
      withdrawn: false,
    }];
  });
};

export const normalizeDartFinancialRows = (rows: DartFinancialRow[]): DartFinancialValues => {
  const result: DartFinancialValues = {
    revenueQuarter: null, revenueYtd: null, operatingProfitQuarter: null, operatingProfitYtd: null,
    netIncomeQuarter: null, netIncomeYtd: null, totalAssets: null, totalLiabilities: null, totalEquity: null,
    operatingCashFlowQuarter: null, operatingCashFlowYtd: null, capitalExpenditureQuarter: null, capitalExpenditureYtd: null,
    accountSources: {},
  };
  const rules: Array<{ key: keyof Omit<DartFinancialValues, 'accountSources'>; field: string; statement: string[]; accountIds: string[]; accountNames: string[]; amount: 'currentAmount' | 'currentYtdAmount' }> = [
    { key: 'revenueQuarter', field: 'revenue', statement: ['IS', 'CIS'], accountIds: ['ifrs-full_Revenue'], accountNames: ['매출액', '수익(매출액)'], amount: 'currentAmount' },
    { key: 'revenueYtd', field: 'revenue', statement: ['IS', 'CIS'], accountIds: ['ifrs-full_Revenue'], accountNames: ['매출액', '수익(매출액)'], amount: 'currentYtdAmount' },
    { key: 'operatingProfitQuarter', field: 'operatingProfit', statement: ['IS', 'CIS'], accountIds: ['dart_OperatingIncomeLoss'], accountNames: ['영업이익'], amount: 'currentAmount' },
    { key: 'operatingProfitYtd', field: 'operatingProfit', statement: ['IS', 'CIS'], accountIds: ['dart_OperatingIncomeLoss'], accountNames: ['영업이익'], amount: 'currentYtdAmount' },
    { key: 'netIncomeQuarter', field: 'netIncome', statement: ['IS', 'CIS'], accountIds: ['ifrs-full_ProfitLoss'], accountNames: ['당기순이익'], amount: 'currentAmount' },
    { key: 'netIncomeYtd', field: 'netIncome', statement: ['IS', 'CIS'], accountIds: ['ifrs-full_ProfitLoss'], accountNames: ['당기순이익'], amount: 'currentYtdAmount' },
    { key: 'totalAssets', field: 'totalAssets', statement: ['BS'], accountIds: ['ifrs-full_Assets'], accountNames: ['자산총계'], amount: 'currentAmount' },
    { key: 'totalLiabilities', field: 'totalLiabilities', statement: ['BS'], accountIds: ['ifrs-full_Liabilities'], accountNames: ['부채총계'], amount: 'currentAmount' },
    { key: 'totalEquity', field: 'totalEquity', statement: ['BS'], accountIds: ['ifrs-full_Equity'], accountNames: ['자본총계'], amount: 'currentAmount' },
    { key: 'operatingCashFlowQuarter', field: 'operatingCashFlow', statement: ['CF'], accountIds: ['ifrs-full_CashFlowsFromUsedInOperatingActivities'], accountNames: ['영업활동으로 인한 현금흐름'], amount: 'currentAmount' },
    { key: 'operatingCashFlowYtd', field: 'operatingCashFlow', statement: ['CF'], accountIds: ['ifrs-full_CashFlowsFromUsedInOperatingActivities'], accountNames: ['영업활동으로 인한 현금흐름'], amount: 'currentYtdAmount' },
    { key: 'capitalExpenditureQuarter', field: 'capitalExpenditure', statement: ['CF'], accountIds: ['ifrs-full_PurchaseOfPropertyPlantAndEquipment'], accountNames: [], amount: 'currentAmount' },
    { key: 'capitalExpenditureYtd', field: 'capitalExpenditure', statement: ['CF'], accountIds: ['ifrs-full_PurchaseOfPropertyPlantAndEquipment'], accountNames: [], amount: 'currentYtdAmount' },
  ];
  for (const rule of rules) {
    const source = rows.find((row) => rule.statement.includes(row.statementDivision)
      && (rule.accountIds.includes(row.accountId) || (!row.accountId && rule.accountNames.includes(row.accountName))));
    if (!source) continue;
    const value = numericText(source[rule.amount])
      ?? (rule.amount === 'currentYtdAmount' && source.reportCode === '11011' ? numericText(source.currentAmount) : null);
    if (value !== null) result[rule.key] = value;
    result.accountSources[rule.field] = {
      statementDivision: source.statementDivision, accountId: source.accountId, accountName: source.accountName,
      amount: numericText(source.currentAmount), ytdAmount: numericText(source.currentYtdAmount),
    };
  }
  return result;
};

export class OpenDartProvider {
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (milliseconds: number) => Promise<void>;
  private lastResponseAt = 0;

  constructor(private readonly options: DartRequestOptions) {
    if (!options.apiKey) throw new DartApiError('API_KEY_MISSING', 'DART_API_KEY is not configured.');
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleepFn = options.sleepFn ?? sleepDefault;
  }

  private async request(url: URL): Promise<Response> {
    const remaining = this.options.minDelayMs - (Date.now() - this.lastResponseAt);
    if (this.lastResponseAt && remaining > 0) await this.sleepFn(remaining);
    if (this.options.isCallAllowed && !this.options.isCallAllowed()) {
      throw new DartApiError('SCHEDULE_WINDOW_ENDED', 'The configured DART collection window has ended.', false, true);
    }
    if (!await this.options.reserveCall(this.options.dailyCallLimit)) {
      throw new DartApiError('DAILY_CALL_LIMIT', 'Configured daily DART API call limit has been reached.', false, true);
    }
    try {
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        try { await response.arrayBuffer(); } finally { this.lastResponseAt = Date.now(); }
        throw new DartApiError('HTTP_ERROR', `Open DART returned HTTP ${response.status}.`);
      }
      return response;
    } catch (error) {
      this.lastResponseAt = Date.now();
      if (error instanceof DartApiError) throw error;
      await this.options.onApiStatus?.('NETWORK_ERROR');
      throw new DartApiError('NETWORK_ERROR', 'Open DART request failed due to a network or timeout error.');
    }
  }

  private url(path: string, params: Record<string, string>): URL {
    const url = new URL(`https://opendart.fss.or.kr/api/${path}`);
    url.searchParams.set('crtfc_key', this.options.apiKey);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }

  private async json<T>(path: string, params: Record<string, string>): Promise<DartEnvelope<T>> {
    const response = await this.request(this.url(path, params));
    let body: DartEnvelope<T>;
    try { body = await response.json() as DartEnvelope<T>; }
    catch { throw new DartApiError('INVALID_JSON', 'Open DART returned an invalid JSON response.'); }
    finally { this.lastResponseAt = Date.now(); }
    if (body.status !== '000') await this.options.onApiStatus?.(body.status || 'UNKNOWN');
    if (body.status === '013') return body;
    if (body.status === '020') throw new DartApiError(body.status, 'Open DART daily request quota was exceeded.', false, true);
    if (body.status !== '000') throw new DartApiError(body.status || 'UNKNOWN', `Open DART request returned status ${body.status || 'unknown'}.`);
    return body;
  }

  async fetchCorporations(): Promise<DartCorporation[]> {
    const response = await this.request(this.url('corpCode.xml', {}));
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await response.arrayBuffer()); }
    finally { this.lastResponseAt = Date.now(); }
    return parseDartCorpCodeXml(unzipDartCorpCodeXml(bytes));
  }

  async listPeriodicReports(corpCode: string, fiscalYear: number): Promise<DartReport[]> {
    const start = `${fiscalYear - 1}0101`;
    const end = `${fiscalYear + 1}0630`;
    const all: RawReport[] = [];
    let page = 1;
    let total = 1;
    while (page <= total) {
      const body = await this.json<RawReport>('list.json', {
        corp_code: corpCode, bgn_de: start, end_de: end, last_reprt_at: 'N', pblntf_ty: 'A',
        sort: 'date', sort_mth: 'asc', page_no: String(page), page_count: '100',
      });
      if (body.status === '013') break;
      all.push(...(body.list ?? []));
      total = Math.max(1, Number(body.total_page ?? 1));
      page += 1;
    }
    return mapPeriodicReports(all, fiscalYear);
  }

  async fetchFinancials(corpCode: string, fiscalYear: number, reportCode: DartReportCode, fsDiv: 'CFS' | 'OFS'): Promise<DartFinancialRow[]> {
    const body = await this.json<RawFinancial>('fnlttSinglAcntAll.json', {
      corp_code: corpCode, bsns_year: String(fiscalYear), reprt_code: reportCode, fs_div: fsDiv,
    });
    return (body.list ?? []).flatMap((row) => {
      const receiptNo = String(row.rcept_no ?? '');
      const year = Number(row.bsns_year);
      const code = String(row.reprt_code ?? '') as DartReportCode;
      const corp = String(row.corp_code ?? '');
      if (!/^\d{14}$/.test(receiptNo) || year !== fiscalYear || code !== reportCode || corp !== corpCode) return [];
      return [{
        receiptNo, fiscalYear: year, reportCode: code, corpCode: corp,
        statementDivision: String(row.sj_div ?? ''), statementName: String(row.sj_nm ?? ''),
        accountId: String(row.account_id ?? ''), accountName: String(row.account_nm ?? ''),
        currentAmount: numericText(row.thstrm_amount), currentYtdAmount: numericText(row.thstrm_add_amount),
        currency: String(row.currency ?? ''),
      }];
    });
  }
}
