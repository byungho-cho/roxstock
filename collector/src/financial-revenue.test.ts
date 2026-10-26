import test from 'node:test';
import assert from 'node:assert/strict';
import {financialRevenueReview} from './financial-revenue.js';
import {normalizeDartFinancialRows,type DartFinancialRow} from './dart-provider.js';
const row=(id:string,name:string,value='100'):DartFinancialRow=>({receiptNo:'20260319001047',corpCode:'00103176',fiscalYear:2025,reportCode:'11011',statementDivision:'IS',statementName:'손익계산서',accountId:id,accountName:name,currentAmount:value,currentYtdAmount:null,currency:'KRW'});
test('insurance service revenue is a separately named disclosed line, never a sum of insurance and investment totals',()=>{
 const rows=[row('ifrs-full_InvestmentIncome','투자영업수익','700'),row('dart_OperatingIncomeInsurance','보험영업수익','110'),row('ifrs-full_InsuranceRevenue','보험수익')];
 const result=normalizeDartFinancialRows(rows);
 assert.equal(result.revenueYtd,'100');assert.equal(result.accountSources.revenue?.accountName,'보험수익');
 assert.deepEqual(normalizeDartFinancialRows([...rows].reverse()),result);
 assert.equal(financialRevenueReview(rows).state,'MAPPED');
});
test('bank/securities interest and fee subtotals stay under policy review without inventing sales',()=>{
 const rows=[row('ifrs-full_RevenueFromInterest','이자수익'),row('ifrs-full_InterestRevenueExpense','순이자손익','50'),row('ifrs-full_FeeAndCommissionIncome','수수료수익','20')];
 assert.equal(normalizeDartFinancialRows(rows).revenueYtd,null);
 assert.equal(financialRevenueReview(rows).state,'POLICY_REVIEW');
});
test('duplicate equal insurance lines are not added; mixed periods/currencies and unequal duplicates stay blocked',()=>{
 const r=row('ifrs-full_InsuranceRevenue','보험수익');
 assert.equal(normalizeDartFinancialRows([r,{...r,statementDivision:'CIS'}]).revenueYtd,'100');
 for(const changed of [{currentAmount:'101'},{currency:'USD'},{receiptNo:'20260319001048'},{fiscalYear:2024}])assert.equal(financialRevenueReview([r,{...r,...changed}]).state,'SOURCE_REVIEW');
 assert.equal(financialRevenueReview([{...r,statementDivision:'BS'}]).state,'NOT_FINANCIAL');
});
test('ordinary company revenue and explicitly different quarterly/cumulative amounts keep existing behavior',()=>{
 const ordinary=row('ifrs-full_Revenue','매출액','500');
 assert.equal(normalizeDartFinancialRows([ordinary,row('ifrs-full_InsuranceRevenue','보험수익')]).revenueYtd,'500');
 const q={...row('ifrs-full_InsuranceRevenue','보험수익'),reportCode:'11014' as const,currentYtdAmount:'270'};
 const result=normalizeDartFinancialRows([q]);assert.equal(result.revenueQuarter,'100');assert.equal(result.revenueYtd,'270');
});
