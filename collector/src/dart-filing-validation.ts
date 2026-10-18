import {DartApiError, type DartFinancialRow, type DartReport} from './dart-provider.js';

const receiptResolvablePeriods=new Set(['CLOSING_MONTH_CHANGED','CLOSING_MONTH_UNAVAILABLE','MULTIPLE_ANNUAL_PERIODS']);
/** An ambiguous calendar is resolved only by the exact receipt returned for this API year/code. */
export function resolveDartReceiptPeriod(report:DartReport,rows:DartFinancialRow[],corpCode:string,year:number):DartReport {
 const c=report.selection;if(!c?.periodError||!receiptResolvablePeriods.has(c.periodError))return report;
 const receipts=[...new Set(rows.map(r=>r.receiptNo))];
 if(!rows.length||receipts.length!==1||rows.some(r=>r.corpCode!==corpCode||r.fiscalYear!==year||r.reportCode!==report.reportCode))return report;
 const sources=c.candidates.filter(d=>d.receiptNo===receipts[0]&&d.corpCode===corpCode);
 const periods=[...new Set(sources.map(d=>d.reportPeriod))];if(periods.length!==1||Number(periods[0]!.slice(0,4))!==year)return report;
 const candidates=c.candidates.filter(d=>d.reportPeriod===periods[0]&&d.corpCode===corpCode).sort((a,b)=>b.receiptDate.localeCompare(a.receiptDate)||b.receiptNo.localeCompare(a.receiptNo));
 if(!candidates.length||candidates.some(d=>['WITHDRAWAL','UNKNOWN'].includes(d.correctionType)))return report;
 const chosen=candidates[0]!,[y,m]=periods[0]!.split('-').map(Number),end=new Date(Date.UTC(y!,m!,0)).toISOString().slice(0,10);
 const {periodError,...selection}=c;
 return {...report,receiptNo:chosen.receiptNo,receiptDate:chosen.receiptDate,reportName:chosen.reportName,selection:{...selection,periodEndDate:end,candidates,periodResolution:{method:'API_RECEIPT_DISCLOSURE_MATCH',originalReason:periodError,returnedReceiptNo:receipts[0]!}}};
}
export interface DartSourceValidation {
  version: 2; corpCode: string; taskFiscalYear: number; apiFiscalYear: number;
  reportCode: string; fsDivision: 'CFS'|'OFS'; reportPeriod: string;
  selectedReceiptNo: string; returnedReceiptNo: string; selectedCorrectionType: string;
  sourceCorrectionType: string; relationship: 'EXACT'|'SAME_PERIOD_ATTACHMENT_CHAIN';
  annualPeriods: string[]; fiscalYearEndMonth: number|null; currency: string;
  periodResolution?:{method:string;originalReason:string;returnedReceiptNo:string};
  amountUnit: 'CURRENCY_UNITS'; financialValuesAssumedEqual: false;
}

/** No network/DB mutations. A financial response remains the source of its own receipt.
 * Attachment-only successors may differ, but a newer content correction, ambiguous base,
 * withdrawal, mixed response or missing corporate/period history always stays blocked.
 */
export function validateDartFiling(input: {corpCode:string; taskFiscalYear:number; report:DartReport;
  rows:DartFinancialRow[]; fsDivision:'CFS'|'OFS'}) {
  const {corpCode,taskFiscalYear,rows,fsDivision}=input,report=resolveDartReceiptPeriod(input.report,rows,corpCode,taskFiscalYear),context=report.selection;
  const receipts=[...new Set(rows.map(r=>r.receiptNo))];
  const diagnostic:Record<string,unknown>={corpCode,taskFiscalYear,apiFiscalYear:context?.apiFiscalYear??taskFiscalYear,
    reportCode:report.reportCode,fsDivision,reportPeriod:context?.periodEndDate?.slice(0,7),
    selectedReceiptNo:report.receiptNo,returnedReceiptNos:receipts};
  const fail=(reason:string):never=>{const review=/CLOSING_MONTH|ANNUAL_PERIODS|CONTEXT_UNAVAILABLE|CORRECTION|WITHDRAW|CURRENCY|NON_KRW|DATE_INVALID/.test(reason);throw new DartApiError(review?'DART_SOURCE_REVIEW':'RECEIPT_MISMATCH','Financial source requires disclosure/period review.',false,false,{...diagnostic,validationResult:reason});};
  if(!context||context.version!==2||context.yearMapping!=='CALENDAR_REPORT_YEAR')fail('DISCLOSURE_CONTEXT_UNAVAILABLE');
  const selection=context!;
  if(selection.taskFiscalYear!==taskFiscalYear||selection.apiFiscalYear!==taskFiscalYear)fail('REQUEST_YEAR_MISMATCH');
  if(selection.periodError)fail(selection.periodError);
  if(!rows.length)fail('FINANCIAL_ROWS_EMPTY');
  if(receipts.length!==1)fail('MIXED_RECEIPTS');
  if(rows.some(r=>r.corpCode!==corpCode||r.fiscalYear!==selection.apiFiscalYear||r.reportCode!==report.reportCode))fail('FINANCIAL_IDENTITY_MISMATCH');
  const selected=selection.candidates.find(d=>d.receiptNo===report.receiptNo);
  const source=selection.candidates.find(d=>d.receiptNo===receipts[0]);
  if(!selected||!source)fail('RECEIPT_NOT_IN_EXPECTED_PERIOD');
  const disclosure=source!,chosen=selected!;
  Object.assign(diagnostic,{selectedCorrectionType:chosen.correctionType,sourceCorrectionType:disclosure.correctionType});
  const group=selection.candidates;
  if(group.some(d=>d.corpCode!==corpCode||d.reportPeriod!==disclosure.reportPeriod))fail('DISCLOSURE_IDENTITY_MISMATCH');
  if(disclosure.reportPeriod!==selection.periodEndDate.slice(0,7))fail('REPORT_PERIOD_MISMATCH');
  if(group.some(d=>['WITHDRAWAL','UNKNOWN'].includes(d.correctionType)))fail('WITHDRAWAL_OR_UNKNOWN_CORRECTION');
  let relationship:DartSourceValidation['relationship']='EXACT';
  if(chosen.receiptNo!==disclosure.receiptNo){
    const ordered=[...group].sort((a,b)=>a.receiptDate.localeCompare(b.receiptDate)||a.receiptNo.localeCompare(b.receiptNo));
    const bases=ordered.filter(d=>d.correctionType==='ORIGINAL');
    if(bases.length!==1||!bases[0]!.remarks.includes('정'))fail('CORRECTION_RELATION_UNVERIFIED');
    const index=ordered.findIndex(d=>d.receiptNo===disclosure.receiptNo);
    if(index<0||!['ORIGINAL','CONTENT'].includes(disclosure.correctionType))fail('CORRECTION_SOURCE_UNVERIFIED');
    const later=ordered.slice(index+1);
    if(!later.length||later.some(d=>!['ATTACHMENT','ADDITION'].includes(d.correctionType))||later.at(-1)?.receiptNo!==chosen.receiptNo)fail('CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION');
    relationship='SAME_PERIOD_ATTACHMENT_CHAIN';
  }
  const currencies=[...new Set(rows.map(r=>r.currency))];
  if(currencies.length!==1||!currencies[0]||!/^[A-Z]{3}$/.test(currencies[0]))fail('CURRENCY_UNIT_UNVERIFIED');
  // Existing amount columns and valuation consumers are KRW-only. Never silently relabel CNY/USD as won.
  if(currencies[0]!=='KRW')fail('NON_KRW_STORAGE_UNSUPPORTED');
  const periodEndDate=new Date(`${selection.periodEndDate}T12:00:00Z`);
  if(!Number.isFinite(periodEndDate.getTime())||periodEndDate.toISOString().slice(0,10)!==selection.periodEndDate)fail('REPORT_DATE_INVALID');
  const sourceValidation:DartSourceValidation={version:2,corpCode,taskFiscalYear,apiFiscalYear:selection.apiFiscalYear,
    reportCode:report.reportCode,fsDivision,reportPeriod:disclosure.reportPeriod,
    selectedReceiptNo:chosen.receiptNo,returnedReceiptNo:disclosure.receiptNo,
    selectedCorrectionType:chosen.correctionType,sourceCorrectionType:disclosure.correctionType,
    relationship,annualPeriods:selection.annualPeriods,fiscalYearEndMonth:selection.fiscalYearEndMonth,
    ...(selection.periodResolution?{periodResolution:selection.periodResolution}:{}),currency:currencies[0]!,amountUnit:'CURRENCY_UNITS',financialValuesAssumedEqual:false};
  return {receiptNo:disclosure.receiptNo,reportName:disclosure.reportName,
    receiptDate:new Date(`${disclosure.receiptDate.slice(0,4)}-${disclosure.receiptDate.slice(4,6)}-${disclosure.receiptDate.slice(6,8)}T00:00:00Z`),
    periodEndDate,sourceValidation};
}

/** Supplements cannot relabel a new API version as the existing filing. */
export function validateStoredDartRows(rows:DartFinancialRow[], filing:{receiptNo:string;fiscalYear:number;reportCode:string;periodEndDate:Date;reportName?:string},corpCode:string,fsDivision:'CFS'|'OFS') {
  const receipts=[...new Set(rows.map(r=>r.receiptNo))];
  const context={corpCode,taskFiscalYear:filing.fiscalYear,apiFiscalYear:filing.fiscalYear,reportCode:filing.reportCode,fsDivision,reportPeriod:filing.periodEndDate.toISOString().slice(0,7),selectedReceiptNo:filing.receiptNo,returnedReceiptNos:receipts};
  if(rows.some(r=>r.currency!=='KRW'))throw new DartApiError('DART_SOURCE_REVIEW','Stored-source currency requires review.',false,false,{...context,validationResult:'NON_KRW_STORAGE_UNSUPPORTED'});
  if(filing.reportName){
    const period=/\((\d{4})\.(\d{2})\)/.exec(filing.reportName);
    const declared=period?new Date(Date.UTC(Number(period[1]),Number(period[2]),0)).toISOString().slice(0,10):null;
    if(declared!==filing.periodEndDate.toISOString().slice(0,10))throw new DartApiError('STORED_FILING_CONFLICT','Stored-source period requires review.',false,false,{...context,validationResult:'STORED_FILING_CONFLICT'});
  }
  if(!rows.length||receipts.length!==1||receipts[0]!==filing.receiptNo||rows.some(r=>r.corpCode!==corpCode||r.fiscalYear!==filing.fiscalYear||r.reportCode!==filing.reportCode))
    throw new DartApiError('RECEIPT_MISMATCH','Stored-source supplement identity failed.',false,false,{corpCode,taskFiscalYear:filing.fiscalYear,apiFiscalYear:filing.fiscalYear,reportCode:filing.reportCode,fsDivision,reportPeriod:filing.periodEndDate.toISOString().slice(0,7),selectedReceiptNo:filing.receiptNo,returnedReceiptNos:receipts,validationResult:'STORED_SOURCE_IDENTITY_MISMATCH'});
}

/** Reject uncertain timelines before spending a financial API call or marking NO_FILING. */
export function requireDartReportPeriod(report:DartReport,corpCode:string,taskFiscalYear:number):void {
 const selection=report.selection;
 if(!selection||selection.version!==2||selection.yearMapping!=='CALENDAR_REPORT_YEAR'||selection.periodError&&!receiptResolvablePeriods.has(selection.periodError))
  throw new DartApiError('DART_SOURCE_REVIEW','Disclosure period requires review.',false,false,
   {corpCode,taskFiscalYear,apiFiscalYear:selection?.apiFiscalYear??taskFiscalYear,reportCode:report.reportCode,
    selectedReceiptNo:report.receiptNo,reportPeriod:selection?.periodEndDate.slice(0,7),validationResult:selection?.periodError??'DISCLOSURE_CONTEXT_UNAVAILABLE'});
}
