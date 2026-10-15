import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapPeriodicReports,DartApiError,OpenDartProvider,type RawReport,type DartFinancialRow,type DartReport} from './dart-provider.js';
import {validateDartFiling,validateStoredDartRows} from './dart-filing-validation.js';
import {retryDecision} from '@roxstock/shared/collection/dart-policy';
import {safeDartContext,dartDiagnostic} from '@roxstock/shared/collection/dart-diagnostics';
const corpCode='00126380';
export const disclosure=(period:string,title='사업보고서',receiptNo='20250311001085',extra:Partial<RawReport>={}):RawReport=>({corp_code:corpCode,report_nm:`${title} (${period})`,rcept_no:receiptNo,rcept_dt:receiptNo.slice(0,8),...extra});
export const row=(report:DartReport,receiptNo=report.receiptNo,corp=corpCode):DartFinancialRow=>({receiptNo,corpCode:corp,fiscalYear:2024,reportCode:report.reportCode,statementDivision:'IS',statementName:'손익계산서',accountId:'ifrs-full_Revenue',accountName:'매출액',currentAmount:'100',currentYtdAmount:'200',currency:'KRW'});
const validate=(report:DartReport,rows=[row(report)],corp=corpCode)=>validateDartFiling({corpCode:corp,taskFiscalYear:2024,report,rows,fsDivision:'CFS'});
const rejects=(fn:()=>unknown,reason:string)=>assert.throws(fn,(e:unknown)=>e instanceof DartApiError&&e.diagnostics.validationResult===reason);

for(const month of [3,6,9,12])test(`company-specific annual/Q1/Q2/Q3 closing-month ${month}`,()=>{
 const annual=`2024.${String(month).padStart(2,'0')}`;
 const dates=[1,2,3].map(q=>{return `2024.${String((month+q*3-1)%12+1).padStart(2,'0')}`;});
 const reports=mapPeriodicReports([disclosure(annual),...dates.map((date,i)=>disclosure(date,i===1?'반기보고서':'분기보고서',`2025051100100${i}`))],2024);
 assert.equal(reports.length,4);
 for(const report of reports){const source=validate(report);assert.equal(source.periodEndDate.toISOString().slice(0,7),report.reportName.match(/\((\d{4})\.(\d{2})\)/)?.slice(1).join('-'));assert.equal(source.sourceValidation.apiFiscalYear,2024);}
});
test('GRT and CJ/Samsung recorded API receipts reverse-validate without relabeling',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../../../backend/tests/fixtures/dart-receipt-analysis.json',import.meta.url),'utf8')) as Array<{corpCode:string;path:string;fiscalYear:number;reportCode?:string;rows:Array<RawReport&{rcept_no:string}>}>;
 for(const corp of ['01170962','00113410','00126380']){
  const list=evidence.find(r=>r.path==='list.json'&&r.corpCode===corp)!;
  const reports=mapPeriodicReports(list.rows,2024);
  for(const response of evidence.filter(r=>r.path==='fnlttSinglAcntAll.json'&&r.corpCode===corp&&r.fiscalYear===2024)){
   const report=reports.find(r=>r.reportCode===response.reportCode)!;
   const result=validate(report,[row(report,response.rows[0]!.rcept_no,corp)],corp);
   assert.equal(result.receiptNo,response.rows[0]!.rcept_no);
   if(corp==='01170962'&&report.reportCode==='11012')assert.equal(result.periodEndDate.toISOString().slice(0,10),'2024-12-31');
   if(corp==='00113410'){assert.equal(result.sourceValidation.relationship,'SAME_PERIOD_ATTACHMENT_CHAIN');assert.equal(result.sourceValidation.selectedReceiptNo,'20250317001020');assert.equal(result.receiptNo,'20250317000953');assert.equal(result.sourceValidation.financialValuesAssumedEqual,false);}
  }
  if(corp==='01170962')assert.deepEqual(reports.map(r=>r.selection!.periodEndDate),['2024-09-30','2024-12-31','2024-03-31','2024-06-30']);
 }
});
test('closing-month transition and unavailable history require review; no December default',()=>{
 for(const [raw,reason] of [[ [disclosure('2023.06'),disclosure('2024.12'),disclosure('2024.06','반기보고서')],'CLOSING_MONTH_CHANGED'],[[disclosure('2024.06','반기보고서')],'CLOSING_MONTH_UNAVAILABLE']] as const){const r=mapPeriodicReports([...raw],2024).find(r=>r.reportCode==='11012')!;rejects(()=>validate(r),reason);}
});
test('wrong company/year/report/period and mixed receipts cannot be saved',()=>{
 const report=mapPeriodicReports([disclosure('2024.12')],2024)[0]!;
 for(const patch of [{corpCode:'99999999'},{fiscalYear:2023},{reportCode:'11012'}])rejects(()=>validate(report,[{...row(report),...patch} as DartFinancialRow]),'FINANCIAL_IDENTITY_MISMATCH');
 rejects(()=>validate(report,[row(report,'20240311001085')]),'RECEIPT_NOT_IN_EXPECTED_PERIOD');
 rejects(()=>validate(report,[row(report),row(report,'20250311001086')]),'MIXED_RECEIPTS');
 rejects(()=>validate(report,[{...row(report),currency:'CNY'}]),'NON_KRW_STORAGE_UNSUPPORTED');
 rejects(()=>validate({...report,selection:undefined}),'DISCLOSURE_CONTEXT_UNAVAILABLE');
 rejects(()=>validate({...report,selection:{...report.selection!,periodEndDate:'2023-12-31'}}),'REPORT_PERIOD_MISMATCH');
});
test('content correction must be actual API source; attachment chain and addition are not ignored',()=>{
 const base=disclosure('2024.12','사업보고서','20250311001085',{rm:'정연'});
 for(const name of ['[첨부정정]사업보고서','[첨부추가]사업보고서']){
  const latest=mapPeriodicReports([base,disclosure('2024.12',name,'20250311001086')],2024)[0]!;
  assert.equal(validate(latest,[row(latest,base.rcept_no)]).sourceValidation.relationship,'SAME_PERIOD_ATTACHMENT_CHAIN');
 }
 const content=mapPeriodicReports([base,disclosure('2024.12','[기재정정]사업보고서','20250311001086')],2024)[0]!;
 rejects(()=>validate(content,[row(content,base.rcept_no)]),'CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION');
 assert.equal(validate(content).receiptNo,content.receiptNo);
 const unknown=mapPeriodicReports([base,disclosure('2024.12','[변경등록]사업보고서','20250311001086')],2024)[0]!;rejects(()=>validate(unknown),'UNKNOWN_CORRECTION');
 const withdrawn=mapPeriodicReports([base,disclosure('2024.12','[철회]사업보고서','20250311001086')],2024)[0]!;rejects(()=>validate(withdrawn),'WITHDRAWN_PERIOD_REQUIRES_REVIEW');
 const ambiguous=mapPeriodicReports([base,disclosure('2024.12','사업보고서','20250311001084'),disclosure('2024.12','[첨부정정]사업보고서','20250311001086')],2024)[0]!;rejects(()=>validate(ambiguous,[row(ambiguous,base.rcept_no)]),'CORRECTION_RELATION_UNVERIFIED');
});
test('provider rejects contaminated raw rows rather than silently dropping them and falling back',async()=>{
 const report=mapPeriodicReports([disclosure('2024.12')],2024)[0]!;
 const provider=new OpenDartProvider({apiKey:'not-a-real-key',dailyCallLimit:10,minDelayMs:0,reserveCall:async()=>true,fetchFn:async()=>Response.json({status:'000',list:[{rcept_no:report.receiptNo,corp_code:corpCode,bsns_year:'2024',reprt_code:'11011'},{rcept_no:report.receiptNo,corp_code:'99999999',bsns_year:'2024',reprt_code:'11011'}]})});
 await assert.rejects(provider.fetchFinancials(corpCode,2024,'11011','CFS'),(e:unknown)=>e instanceof DartApiError&&e.code==='FINANCIAL_IDENTITY_MISMATCH');
});
test('stored-value supplement never treats a different source as existing source',()=>{
 const report=mapPeriodicReports([disclosure('2024.12')],2024)[0]!;
 const filing={receiptNo:report.receiptNo,fiscalYear:2024,reportCode:'11011',periodEndDate:new Date('2024-12-31')};
 validateStoredDartRows([row(report)],filing,corpCode,'CFS');
 rejects(()=>validateStoredDartRows([{...row(report),currency:'CNY'}],filing,corpCode,'CFS'),'NON_KRW_STORAGE_UNSUPPORTED');
 rejects(()=>validateStoredDartRows([row(report)],{...filing,reportName:'사업보고서 (2024.06)'},corpCode,'CFS'),'STORED_FILING_CONFLICT');
 rejects(()=>validateStoredDartRows([row(report,'20250311001086')],filing,corpCode,'CFS'),'STORED_SOURCE_IDENTITY_MISMATCH');
});
test('allowlisted diagnostic preserves original reason without secrets or arbitrary objects',()=>{
 const secret='key-in-url-header-cause';
 const safe=safeDartContext({corpCode,returnedReceiptNos:['20250311001085',secret],selectedReceiptNo:'20250311001086',validationResult:'MIXED_RECEIPTS',apiKey:secret,url:secret,headers:{secret},message:secret});
 assert.ok(!JSON.stringify(safe).includes(secret));assert.equal(safe.validationResult,'MIXED_RECEIPTS');
 assert.deepEqual(dartDiagnostic(new DartApiError('RECEIPT_MISMATCH',secret,false,false,safe),'VERIFY_SOURCE').context,safe);
});

test('uncertain timeline/explicit-source cases stay in review immediately without repeated financial calls',()=>{
 assert.throws(()=>mapPeriodicReports([{corp_code:corpCode,report_nm:'사업보고서',rcept_no:'20250311001085',rcept_dt:'20250311'}],2024),(e:unknown)=>e instanceof DartApiError&&e.code==='DART_SOURCE_REVIEW'&&e.diagnostics.validationResult==='DISCLOSURE_PERIOD_UNPARSEABLE');
 for(const code of ['DART_SOURCE_REVIEW','STORED_FILING_CONFLICT'])assert.deepEqual(retryDecision(code,1,new Date()),{status:'FAILED',code:'REVIEW_REQUIRED',nextAttemptAt:null,stop:false});
 assert.equal(retryDecision('RECEIPT_MISMATCH',1,new Date()).code,'RECEIPT_MISMATCH');
});
