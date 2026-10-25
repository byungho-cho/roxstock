import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDartFinancialRows,type DartFinancialRow} from './dart-provider.js';
test('IFRS operating profit standard identifier keeps current and cumulative values separate',()=>{
 const row={receiptNo:'20260810000423',corpCode:'00136721',fiscalYear:2026,reportCode:'11013',statementDivision:'CIS',statementName:'포괄손익계산서',accountId:'ifrs-full_ProfitLossFromOperatingActivities',accountName:'영업이익',currentAmount:'12',currentYtdAmount:'34',currency:'KRW'} as DartFinancialRow;
 const v=normalizeDartFinancialRows([row]);assert.equal(v.operatingProfitQuarter,'12');assert.equal(v.operatingProfitYtd,'34');assert.equal(v.accountSources.operatingProfit?.accountId,row.accountId);
 const previous=normalizeDartFinancialRows([{...row,accountId:'ifrs_ProfitLossFromOperatingActivities'}]);assert.equal(previous.operatingProfitYtd,'34');
 const wrong=normalizeDartFinancialRows([{...row,accountId:'dart_NonOperatingIncome',accountName:'영업외수익'}]);assert.equal(wrong.operatingProfitYtd,null);
});
