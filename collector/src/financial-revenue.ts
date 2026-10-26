import {Prisma} from '@roxstock/shared/prisma';
import type {DartFinancialRow} from './dart-provider.js';

/** A disclosed subtotal is not a licence to add unrelated banking/insurance income. */
export function financialRevenueReview(rows:DartFinancialRow[]) {
 const income=rows.filter(row=>['IS','CIS'].includes(row.statementDivision));
 const exact=income.filter(row=>['ifrs-full_InsuranceRevenue','ifrs_InsuranceRevenue'].includes(row.accountId)&&row.accountName==='보험수익');
 const financial=income.some(row=>/Insurance|Interest|FeeAndCommission/.test(row.accountId));
 if(!exact.length)return {state:financial?'POLICY_REVIEW':'NOT_FINANCIAL',reason:financial?'FINANCIAL_REVENUE_NO_COMPARABLE_TOP_LINE':'NO_FINANCIAL_REVENUE_MAPPING'} as const;
 const identities=new Set(rows.map(row=>JSON.stringify([row.receiptNo,row.corpCode,row.fiscalYear,row.reportCode,row.currency])));
 if(identities.size!==1)return {state:'SOURCE_REVIEW',reason:'FINANCIAL_REVENUE_MIXED_SOURCE'} as const;
 const numeric=(value:string|null)=>value!==null&&/^-?\d+(\.\d+)?$/.test(value.replaceAll(',',''))?new Prisma.Decimal(value.replaceAll(',','')).toString():null;
 const values=new Set(exact.map(row=>JSON.stringify([numeric(row.currentAmount),numeric(row.currentYtdAmount)])));
 if(values.size!==1)return {state:'SOURCE_REVIEW',reason:'FINANCIAL_REVENUE_AMBIGUOUS_ACCOUNT'} as const;
 const row=exact[0]!,amount=numeric(row.currentAmount),ytdAmount=numeric(row.currentYtdAmount)??(row.reportCode==='11011'?amount:null);
 if(amount===null&&ytdAmount===null)return {state:'SOURCE_REVIEW',reason:'FINANCIAL_REVENUE_AMOUNT_MISSING'} as const;
 return {state:'MAPPED',reason:'DISCLOSED_INSURANCE_REVENUE_IFRS17',displayName:'보험수익',definition:'IFRS17_INSURANCE_SERVICE_REVENUE_EXCLUDING_INVESTMENT_COMPONENTS',amount,ytdAmount,
  source:{statementDivision:row.statementDivision,accountId:row.accountId,accountName:row.accountName,amount,ytdAmount,mappingPolicy:'DISCLOSED_INSURANCE_REVENUE_IFRS17',displayName:'보험수익'}} as const;
}
