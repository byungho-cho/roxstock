import {publicAnnualTarget,publicSectionUrls,parsePublicAnnual} from './dart-public-source.js';
import {checkCollection,collectionFetch,CollectionExcluded} from '@roxstock/shared/collection/collection-policy';
import { normalizeProviderSymbol, isSecuritySymbol } from '@roxstock/shared/domain/security-symbol';
import { inflateRawSync } from 'node:zlib';
import {shareClassOf} from '@roxstock/shared/domain/share-counts';

import type {DartReportCode,DartPeriodType,DartCorporation,DartReport,DartCorrectionType,DartDisclosure,DartReportSelection,DartFinancialRow,DartFinancialValues} from '@roxstock/shared/collection/dart-types';
export type {DartReportCode,DartPeriodType,DartCorporation,DartReport,DartCorrectionType,DartDisclosure,DartReportSelection,DartFinancialRow,DartFinancialValues} from '@roxstock/shared/collection/dart-types';
import {DartApiError} from '@roxstock/shared/collection/dart-types';
export {DartApiError} from '@roxstock/shared/collection/dart-types';
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
export interface RawReport { rcept_no?: string; rcept_dt?: string; report_nm?: string; corp_code?: string; rm?: string; }
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

export function validateDartCorporations(rows: DartCorporation[]): void {
 if(!rows.length)throw new DartApiError('CORP_MAPPING_EMPTY','No listed corporations in response.');
 const codes=new Set<string>();
 for(const row of rows){
  if(!/^\d{8}$/.test(row.corpCode)||!isSecuritySymbol(row.stockCode)||!row.corpName.trim()||row.corpName.length>200||!/^\d{8}$/.test(row.modifiedDate)||codes.has(row.corpCode))throw new DartApiError('CORP_MAPPING_INVALID','Corporation row validation failed.');
  codes.add(row.corpCode);
 }
}
export const parseDartCorpCodeXml = (xml: string): DartCorporation[] => {
 const status=xmlValue(xml,'status');
 if(status && status!=='000')throw new DartApiError(/^\d{3}$/.test(status)?status:'CORP_RESPONSE_INVALID','DART corporation response rejected.',false,status==='020');
 if(!/^\s*(?:<\?xml[^>]*>\s*)?<result>[\s\S]*<\/result>\s*$/.test(xml)||/<!(?:DOCTYPE|ENTITY)/i.test(xml))throw new DartApiError('CORP_XML_INVALID','Malformed corporation XML.');
 const lists=[...xml.matchAll(/<list>([\s\S]*?)<\/list>/gi)];
 if(lists.length!==(xml.match(/<list>/gi)??[]).length || lists.length!==(xml.match(/<\/list>/gi)??[]).length)throw new DartApiError('CORP_XML_INVALID','Malformed corporation list.');
 const all=lists.map(([,row=''])=>({corpCode:xmlValue(row,'corp_code'),corpName:xmlValue(row,'corp_name'),stockCode:normalizeProviderSymbol(xmlValue(row,'stock_code')),modifiedDate:xmlValue(row,'modify_date')}));
 if(all.some(r=>!/^\d{8}$/.test(r.corpCode)||!r.corpName||!/^\d{8}$/.test(r.modifiedDate)||(r.stockCode!==''&&!isSecuritySymbol(r.stockCode))))throw new DartApiError('CORP_MAPPING_INVALID','Invalid corporation list row.');
 const listed=all.filter(r=>r.stockCode!=='');validateDartCorporations(listed);return listed;
};

const dateInReportName = (name: string): { year: number; month: number } | null => {
  const match = name.match(/\((\d{4})\.(\d{2})\)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
};

export const dartCorrectionType = (name: string, remarks = ''): DartCorrectionType => {
  if (name.includes('철회') || remarks.includes('철')) return 'WITHDRAWAL';
  if (name.includes('[기재정정]')) return 'CONTENT';
  if (name.includes('[첨부정정]')) return 'ATTACHMENT';
  if (name.includes('[첨부추가]')) return 'ADDITION';
  return name.includes('[') ? 'UNKNOWN' : 'ORIGINAL';
};
const orderDisclosure = (a: DartDisclosure, b: DartDisclosure) =>
  b.receiptDate.localeCompare(a.receiptDate) || b.receiptNo.localeCompare(a.receiptNo);

export function closingMonthEvidence(periods:string[],year:number){
 const own=periods.filter(p=>Number(p.slice(0,4))===year);
 const stableDecember=own.length===1&&own[0]===`${year}-12`&&periods.includes(`${year-1}-12`);
 const months=[...new Set((stableDecember?own:periods).map(p=>Number(p.slice(5))))];
 return {month:months.length===1?months[0]!:null,periodError:!months.length?'CLOSING_MONTH_UNAVAILABLE':months.length>1?'CLOSING_MONTH_CHANGED':undefined};
}
/** Reinterpret retained disclosure candidates only; missing candidates still require a fresh list. */
export function upgradeCachedPeriod(report:DartReport):DartReport {
 const s=report.selection;if(!s||s.periodError!=='CLOSING_MONTH_CHANGED'||report.periodType==='ANNUAL')return report;
 const {month,periodError}=closingMonthEvidence(s.annualPeriods,s.taskFiscalYear);if(periodError||month===null)return report;
 const q=({Q1:1,Q2:2,Q3:3,ANNUAL:4} as const)[report.periodType],m=(month+q*3-1)%12+1;
 const period=`${s.taskFiscalYear}-${String(m).padStart(2,'0')}`;
 const candidates=s.candidates.filter(d=>d.reportPeriod===period).sort(orderDisclosure);
 if(!candidates.length||candidates.some(d=>['WITHDRAWAL','UNKNOWN'].includes(d.correctionType)))return report;
 const latest=candidates[0]!,{periodError:old,...rest}=s;
 return {...report,receiptNo:latest.receiptNo,receiptDate:latest.receiptDate,reportName:latest.reportName,selection:{...rest,periodEndDate:new Date(Date.UTC(s.taskFiscalYear,m,0)).toISOString().slice(0,10),fiscalYearEndMonth:month,candidates}};
}

/** Request year is not the annual closing year for non-December interim reports.
 * Derive a company-specific timeline from public annual titles, never default to December.
 * Changed/absent closing-month evidence is deliberately review-only. API receipts are later
 * reverse-validated against the retained same-company, same-period disclosure candidates.
 */
export const mapPeriodicReports = (reports: RawReport[], fiscalYear: number): DartReport[] => {
  if(reports.some(raw=>/(사업|반기|분기)보고서/.test(raw.report_nm??'')&&!dateInReportName(raw.report_nm??'')))
    throw new DartApiError('DART_SOURCE_REVIEW','Disclosure period cannot be parsed.',false,false,{taskFiscalYear:fiscalYear,apiFiscalYear:fiscalYear,validationResult:'DISCLOSURE_PERIOD_UNPARSEABLE'});
  const disclosures: DartDisclosure[] = reports.flatMap(raw => {
    const date = dateInReportName(raw.report_nm ?? '');
    if (!date || !/^\d{14}$/.test(raw.rcept_no ?? '') || !/^\d{8}$/.test(raw.rcept_dt ?? '')) return [];
    return [{receiptNo: raw.rcept_no!, receiptDate: raw.rcept_dt!, reportName: raw.report_nm ?? '',
      corpCode: raw.corp_code ?? '', reportPeriod: `${date.year}-${String(date.month).padStart(2,'0')}`,
      correctionType: dartCorrectionType(raw.report_nm ?? '', raw.rm), remarks: raw.rm ?? ''}];
  });
  const annuals = disclosures.filter(d => d.reportName.includes('사업보고서') && d.correctionType !== 'WITHDRAWAL');
  const relevant = annuals.filter(d => Math.abs(Number(d.reportPeriod.slice(0,4)) - fiscalYear) <= 1);
  const annualPeriods = [...new Set(relevant.map(d=>d.reportPeriod))].sort();
  // A neighbouring transition must not invalidate a complete calendar year.
  // For non-December years the adjacent closing cycle still needs to agree:
  // a lone short transition closing is not proof of a full fiscal year.
  const {month,periodError}=closingMonthEvidence(annualPeriods,fiscalYear);
  const targets: Array<{code: DartReportCode; period: DartPeriodType; quarter: number; title: string}> = [
    {code:'11013',period:'Q1',quarter:1,title:'분기보고서'},
    {code:'11012',period:'Q2',quarter:2,title:'반기보고서'},
    {code:'11014',period:'Q3',quarter:3,title:'분기보고서'},
    {code:'11011',period:'ANNUAL',quarter:4,title:'사업보고서'},
  ];
  return targets.flatMap(target => {
    // Annual closing date comes directly from its own title, including transition years.
    const annualTargets = [...new Set(annuals.filter(d=>Number(d.reportPeriod.slice(0,4))===fiscalYear).map(d=>d.reportPeriod))];
    let expected = '';
    let error = target.period === 'ANNUAL' ? (annualTargets.length > 1 ? 'MULTIPLE_ANNUAL_PERIODS' : undefined) : periodError;
    if (target.period === 'ANNUAL') expected = annualTargets.length === 1 ? annualTargets[0]! : '';
    else if (month !== null) {
      // Each API report code uses its actual closing month within bsns_year.
      // Do not roll Q3 into the next year just because Q1/Q2 follow the annual closing month.
      const endMonth = (month + target.quarter * 3 - 1) % 12 + 1;
      expected = `${fiscalYear}-${String(endMonth).padStart(2,'0')}`;
    }
    let matches = disclosures.filter(d=>d.reportName.includes(target.title) && d.reportPeriod===expected).sort(orderDisclosure);
    if (error) matches = disclosures.filter(d=>d.reportName.includes(target.title) && Math.abs(Number(d.reportPeriod.slice(0,4))-fiscalYear)<=1).sort(orderDisclosure);
    if (!matches.length) return [];
    const latest = matches[0]!;
    if (matches.some(d=>d.correctionType==='WITHDRAWAL')) error ??= 'WITHDRAWN_PERIOD_REQUIRES_REVIEW';
    if (matches.some(d=>d.correctionType==='UNKNOWN')) error ??= 'UNKNOWN_CORRECTION';
    const [year, endMonth] = latest.reportPeriod.split('-').map(Number);
    const periodEndDate = new Date(Date.UTC(year!, endMonth!, 0)).toISOString().slice(0,10);
    return [{receiptNo:latest.receiptNo,receiptDate:latest.receiptDate,reportName:latest.reportName,
      reportCode:target.code,periodType:target.period,withdrawn:false,
      selection:{version:2,yearMapping:'CALENDAR_REPORT_YEAR',taskFiscalYear:fiscalYear,apiFiscalYear:fiscalYear,periodEndDate,
        fiscalYearEndMonth:month,annualPeriods,...(error?{periodError:error}:{}),candidates:matches}}];
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
      && (rule.accountIds.some(id=>row.accountId===id||row.accountId===id.replace('ifrs-full_','ifrs_')) || (!row.accountId && rule.accountNames.includes(row.accountName))));
    if (!source) continue;
    const value = numericText(source[rule.amount])
      ?? (rule.amount === 'currentYtdAmount' && source.reportCode === '11011' ? numericText(source.currentAmount) : null);
    if (value !== null) result[rule.key] = value;
    result.accountSources[rule.field] = {
      statementDivision: source.statementDivision, accountId: source.accountId, accountName: source.accountName,
      amount: numericText(source.currentAmount), ytdAmount: numericText(source.currentYtdAmount),
    };
  }
  for(const [field,statement,id] of [
    ['basicEps','IS','ifrs-full_BasicEarningsLossPerShare'],
    ['parentNetIncome','IS','ifrs-full_ProfitLossAttributableToOwnersOfParent'],
    ['parentEquity','BS','ifrs-full_EquityAttributableToOwnersOfParent'],
    ['investingCashFlow','CF','ifrs-full_CashFlowsFromUsedInInvestingActivities'],
    ['financingCashFlow','CF','ifrs-full_CashFlowsFromUsedInFinancingActivities'],
    ['cashEquivalents','BS','ifrs-full_CashAndCashEquivalents'],
  ] as const) {
    const row=rows.find(r=>(r.statementDivision===statement||(statement==='IS'&&r.statementDivision==='CIS'))&&(r.accountId===id||r.accountId===id.replace('ifrs-full_','ifrs_')));
    if(row)result.accountSources[field]={statementDivision:row.statementDivision,accountId:row.accountId,accountName:row.accountName,amount:numericText(row.currentAmount),ytdAmount:numericText(row.currentYtdAmount)};
  }
  const epsRows=rows.filter(r=>['IS','CIS'].includes(r.statementDivision)&&['ifrs-full_BasicEarningsLossPerShare','ifrs_BasicEarningsLossPerShare'].includes(r.accountId));
  if(result.accountSources.basicEps){
   const unique=new Set(epsRows.map(r=>JSON.stringify([numericText(r.currentAmount),numericText(r.currentYtdAmount)])));
   result.accountSources.basicEps.ordinaryEpsVerified=epsRows.length>0&&unique.size===1&&!epsRows.some(r=>/우선|preferred/i.test(r.accountName));
  }
  return result;
};

export class OpenDartProvider {
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (milliseconds: number) => Promise<void>;
  private lastResponseAt = 0;

  constructor(private readonly options: DartRequestOptions) {
    if (!options.apiKey) throw new DartApiError('API_KEY_MISSING', 'DART_API_KEY is not configured.');
    this.fetchFn = collectionFetch(options.fetchFn ?? fetch,'dart-financial-statements');
    this.sleepFn = options.sleepFn ?? sleepDefault;
  }

  private async request(url: URL): Promise<Response> {
    await checkCollection('dart-financial-statements');
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
      if (error instanceof CollectionExcluded || error instanceof DartApiError) throw error;
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
    if (!/^\d{3}$/.test(body.status??'')) throw new DartApiError('INVALID_JSON','Invalid DART status envelope.');
    if (body.status !== '000') await this.options.onApiStatus?.(body.status || 'UNKNOWN');
    if (body.status === '013') return body;
    if (body.status === '020') throw new DartApiError(body.status, 'Open DART daily request quota was exceeded.', false, true);
    if (body.status !== '000') throw new DartApiError(body.status || 'UNKNOWN', `Open DART request returned status ${body.status || 'unknown'}.`);
    return body;
  }

  async fetchPeriodDates(corpCode:string,year:number,reportCode:DartReportCode) {
    const body=await this.json<Record<string,string>>('fnlttSinglAcnt.json',{corp_code:corpCode,bsns_year:String(year),reprt_code:reportCode});
    if(body.status==='013')return [];
    if(!Array.isArray(body.list))throw new DartApiError('INVALID_JSON','Financial dates are not an array.');
    return body.list;
  }

  async fetchPeriodShares(corpCode:string,year:number,reportCode:DartReportCode,receiptNo:string) {
    await checkCollection('share-counts');
    const body=await this.json<{rcept_no:string;se:string;istc_totqy:string;tesstk_co:string;distb_stock_co:string;stlm_dt:string}>('stockTotqySttus.json',{corp_code:corpCode,bsns_year:String(year),reprt_code:reportCode});
    await checkCollection('share-counts');
    if(body.status==='013')return undefined;
    if(!Array.isArray(body.list)||!body.list.length)throw new DartApiError('SHARES_EMPTY','주식수 응답이 비어 있습니다.');
    const matched=body.list.filter(r=>r.rcept_no===receiptNo);
    if(!matched.length)throw new DartApiError('SHARES_RECEIPT_MISMATCH','주식수 접수번호가 저장 재무자료와 다릅니다.');
    const count=(v:string)=>{const raw=v?.trim().replaceAll(',','');if(!raw||raw==='-')return null;if(!/^\d+$/.test(raw))throw new DartApiError('SHARES_INVALID','주식수 응답의 정수 형식을 확인할 수 없습니다.');return BigInt(raw).toString();};
    const rows=matched.filter(r=>r.se?.replace(/\s/g,'')!=='비고').map(r=>{
      const stockKind=r.se?.trim(),kind=stockKind?.replace(/\s/g,'');
      const date=r.stlm_dt?.trim().replaceAll('.','-');
      if(!stockKind||stockKind.length>100||!/^\d{4}-\d{2}-\d{2}$/.test(date??'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new DartApiError('SHARES_INVALID','주식 종류·결산기준일을 확인할 수 없습니다.');
      const issuedShares=count(r.istc_totqy),treasuryShares=count(r.tesstk_co),outstandingShares=count(r.distb_stock_co);
      if(issuedShares!==null&&treasuryShares!==null&&outstandingShares!==null&&BigInt(issuedShares)-BigInt(treasuryShares)!==BigInt(outstandingShares))throw new DartApiError('SHARES_INCONSISTENT','발행·자기·유통주식수 관계가 일치하지 않습니다.');
      return {stockKind,shareClass:shareClassOf(stockKind),issuedShares,treasuryShares,outstandingShares,periodEndDate:date};
    });
    if(new Set(rows.map(r=>r.stockKind)).size!==rows.length)throw new DartApiError('SHARES_DUPLICATE_KIND','주식 종류별 응답이 중복됩니다.');
    const ordinary=rows.find(r=>r.shareClass==='COMMON');
    return {outstanding:ordinary?.outstandingShares??null,issuedShares:ordinary?.issuedShares??null,treasuryShares:ordinary?.treasuryShares??null,preferred:rows.some(r=>r.stockKind.includes('우선')&&BigInt(r.outstandingShares??'0')>0n),receiptNo,collectedAt:new Date().toISOString(),rows};
  }
  async fetchCorporations(): Promise<DartCorporation[]> {
    const response = await this.request(this.url('corpCode.xml', {}));
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await response.arrayBuffer()); }
    finally { this.lastResponseAt = Date.now(); }
    try { return parseDartCorpCodeXml(unzipDartCorpCodeXml(bytes)); }
    catch(error) {
      const safe=error instanceof DartApiError?error:new DartApiError('INVALID_CORP_CODE_ARCHIVE','Corporation archive could not be parsed.');
      await this.options.onApiStatus?.(safe.code);
      throw safe;
    }
  }

  /** News metadata only; uses the same request, quota reservation and spacing as financial collection. */
  async listNewsDisclosures(corpCode:string,from:string,to:string){
    const rows:RawReport[]=[];
    for(let page=1;page<=5;page++){
      const body=await this.json<RawReport>('list.json',{corp_code:corpCode,bgn_de:from,end_de:to,last_reprt_at:'N',sort:'date',sort_mth:'desc',page_no:String(page),page_count:'100'});
      if(body.status==='013')return rows;
      if(!Array.isArray(body.list)||body.list.some(r=>r.corp_code!==corpCode||!/^\d{14}$/.test(r.rcept_no??'')||!/^\d{8}$/.test(r.rcept_dt??'')||r.rcept_dt!<from||r.rcept_dt!>to||!r.report_nm?.trim()))throw new DartApiError('NEWS_DISCLOSURE_MISMATCH','News disclosure metadata identity failed validation.');
      rows.push(...body.list);
      const total=Number(body.total_page??1);if(!Number.isInteger(total)||total<1)throw new DartApiError('INVALID_JSON','Invalid news page count.');
      if(page>=total)return rows;
    }
    throw new DartApiError('NEWS_PAGE_BOUND','News disclosure page bound reached.');
  }

  async listPeriodicReports(corpCode: string, fiscalYear: number): Promise<DartReport[]> {
    const start = `${fiscalYear - 1}0101`;
    const end = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-', '');
    const all: RawReport[] = [];
    let page = 1;
    let total = 1;
    while (page <= total) {
      const body = await this.json<RawReport>('list.json', {
        corp_code: corpCode, bgn_de: start, end_de: end, last_reprt_at: 'N', pblntf_ty: 'A',
        sort: 'date', sort_mth: 'asc', page_no: String(page), page_count: '100',
      });
      if (body.status === '013') break;
      if (!Array.isArray(body.list)) throw new DartApiError('INVALID_JSON', 'Disclosure list is not an array.');
      all.push(...body.list);
      total = Math.max(1, Number(body.total_page ?? 1));
      page += 1;
    }
    if (all.some(row => row.corp_code !== corpCode)) throw new DartApiError('DISCLOSURE_COMPANY_MISMATCH', 'Disclosure company identity failed validation.', false, false, {corpCode, taskFiscalYear:fiscalYear, apiFiscalYear:fiscalYear});
    return mapPeriodicReports(all, fiscalYear);
  }

  async fetchPublicAnnual(report:DartReport,corpCode:string,year:number){
    const target=publicAnnualTarget(report,corpCode,year);if(!target)return;
    const read=async(url:string)=>{const response=await this.request(new URL(url));try{const reader=response.body?.getReader();if(!reader)throw new DartApiError('INVALID_JSON','Public document body unavailable.');const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw new DartApiError('DART_SOURCE_REVIEW','Public document size requires review.');}chunks.push(value);}}finally{reader.releaseLock();}return new TextDecoder('utf-8').decode(Buffer.concat(chunks));}finally{this.lastResponseAt=Date.now();}};
    const main=await read('https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+target.receiptNo),urls=publicSectionUrls(main,target.receiptNo);
    if(urls.length>3)throw new DartApiError('DART_SOURCE_REVIEW','Ambiguous public document navigation.');
    const sections=[];for(const section of urls)sections.push({...section,html:await read(section.url)});
    try{return parsePublicAnnual(target,corpCode,year,sections);}catch(error){if(error instanceof DartApiError)throw new DartApiError(error.code,error.message,error.noData,error.quotaExceeded,{...error.diagnostics,corpCode,taskFiscalYear:year,apiFiscalYear:year,reportCode:target.reportCode,selectedReceiptNo:target.receiptNo,reportPeriod:target.selection?.periodEndDate.slice(0,7)});throw error;}
  }

  async fetchFinancials(corpCode: string, fiscalYear: number, reportCode: DartReportCode, fsDiv: 'CFS' | 'OFS'): Promise<DartFinancialRow[]> {
    const body = await this.json<RawFinancial>('fnlttSinglAcntAll.json', {
      corp_code: corpCode, bsns_year: String(fiscalYear), reprt_code: reportCode, fs_div: fsDiv,
    });
    if (body.status === '013') return [];
    if (!Array.isArray(body.list)) throw new DartApiError('INVALID_JSON', 'Financial statement list is not an array.');
    return body.list.flatMap((row) => {
      const receiptNo = String(row.rcept_no ?? '');
      const year = Number(row.bsns_year);
      const code = String(row.reprt_code ?? '') as DartReportCode;
      const corp = String(row.corp_code ?? '');
      if (!/^\d{14}$/.test(receiptNo) || year !== fiscalYear || code !== reportCode || corp !== corpCode)
        throw new DartApiError('FINANCIAL_IDENTITY_MISMATCH', 'Financial response identity failed validation.', false, false,
          {corpCode,taskFiscalYear:fiscalYear,apiFiscalYear:fiscalYear,reportCode,fsDivision:fsDiv,returnedReceiptNo:receiptNo,validationResult:'FINANCIAL_IDENTITY_MISMATCH'});
      return [{
        receiptNo, fiscalYear: year, reportCode: code, corpCode: corp,
        statementDivision: String(row.sj_div ?? ''), statementName: String(row.sj_nm ?? ''),
        accountId: String(row.account_id ?? ''), accountName: String(row.account_nm ?? ''),
        currentAmount: numericText(row.thstrm_amount), currentYtdAmount: numericText(row.thstrm_add_amount),
        previousAmount:numericText(row.frmtrm_amount),
        previousPeriodSequential:reportCode==='11011'&&/^제\s*\d+\s*기$/.test(String(row.thstrm_nm??''))&&/^제\s*\d+\s*기$/.test(String(row.frmtrm_nm??''))&&Number(String(row.thstrm_nm).replace(/\D/g,''))===Number(String(row.frmtrm_nm).replace(/\D/g,''))+1,
        previousPeriodEnd:(String(row.frmtrm_dt??'').match(/^(\d{4})[.\/-](\d{2})[.\/-](\d{2})(?:\s*현재)?$/)?.slice(1).join('-'))??null,
        currency: String(row.currency ?? ''),
      }];
    });
  }
}
