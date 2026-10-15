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
  selection?: DartReportSelection;
}
export type DartCorrectionType = 'ORIGINAL' | 'CONTENT' | 'ATTACHMENT' | 'ADDITION' | 'WITHDRAWAL' | 'UNKNOWN';
export interface DartDisclosure {
  receiptNo: string; receiptDate: string; reportName: string; corpCode: string;
  reportPeriod: string; correctionType: DartCorrectionType; remarks: string;
}
export interface DartReportSelection {
  version: 2; yearMapping: 'CALENDAR_REPORT_YEAR'; taskFiscalYear: number; apiFiscalYear: number; periodEndDate: string;
  fiscalYearEndMonth: number | null; annualPeriods: string[]; periodError?: string;
  candidates: DartDisclosure[];
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
  constructor(readonly code: string, message: string, readonly noData = false, readonly quotaExceeded = false, readonly diagnostics: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DartApiError';
  }
}

