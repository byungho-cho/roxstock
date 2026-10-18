import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPeriodicReports,DartApiError,type DartFinancialRow} from './dart-provider.js';
import {validateDartFiling,validateStoredDartRows} from './dart-filing-validation.js';
import {normalizeManualDartAccounts} from './manual-dart-accounts.js';
const corpCode='00100001',report=mapPeriodicReports([{corp_code:corpCode,rcept_no:'20250301000001',rcept_dt:'20250301',report_nm:'사업보고서 (2024.12)'}],2024)[0]!;
const row=(currency:string)=>({receiptNo:report.receiptNo,fiscalYear:2024,reportCode:'11011',corpCode,statementDivision:'BS',statementName:'재무상태표',accountId:'ifrs-full_Equity',accountName:'자본총계',currentAmount:'999999999999999999999999999999.1234567890123456789',currentYtdAmount:null,previousAmount:'10.125',previousPeriodEnd:'2023-12-31',currency}) as DartFinancialRow;
const validate=(rows:DartFinancialRow[])=>validateDartFiling({report,rows,corpCode,taskFiscalYear:2024,fsDivision:'OFS'});
for(const currency of ['USD','CNY','JPY'])test(`${currency} validated original amount and supplemental opening amounts preserved`,()=>{
 const r=row(currency),proof=validate([r]);assert.equal(proof.sourceValidation.currency,currency);assert.equal(proof.sourceValidation.amountMultiplier,'1');
 const normalized=normalizeManualDartAccounts([r],proof.periodEndDate);
 assert.equal(normalized.totalEquity,r.currentAmount);assert.equal(normalized.accountSources.openingTotalEquity?.amount,'10.125');
 assert.doesNotThrow(()=>validateStoredDartRows([r],{...proof,fiscalYear:2024,reportCode:'11011'},corpCode,'OFS'));
});
for(const [name,rows,reason]of [
 ['missing currency',[row('')],'CURRENCY_MISSING'],
 ['mixed currencies',[row('USD'),row('CNY')],'CURRENCY_MIXED'],
 ['too many decimals',[{...row('USD'),currentAmount:'1.'+'1'.repeat(31)}],'AMOUNT_PRECISION_UNSUPPORTED'],
 ['overflow',[{...row('USD'),currentAmount:'1'.repeat(36)}],'AMOUNT_PRECISION_UNSUPPORTED'],
] as const)test(name+' stays in source review',()=>assert.throws(()=>validate([...rows]),(e:unknown)=>e instanceof DartApiError&&e.diagnostics.validationResult===reason));
test('supplements cannot change the stored currency',()=>assert.throws(()=>validateStoredDartRows([row('JPY')],{...validate([row('USD')]),fiscalYear:2024,reportCode:'11011'},corpCode,'OFS'),(e:unknown)=>e instanceof DartApiError&&e.diagnostics.validationResult==='STORED_CURRENCY_CONFLICT'));
