import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAttachmentChain} from './dart-attachment-chain.js';
import {validateDartFiling} from './dart-filing-validation.js';
import {OpenDartProvider,type DartReport,type DartFinancialRow} from './dart-provider.js';
const corp='00361169',source='20260326000238',selected='20260327001600';
const disclosure=(receiptNo:string,correctionType:'CONTENT'|'ATTACHMENT'|'ADDITION')=>({receiptNo,receiptDate:receiptNo.slice(0,8),reportName:'사업보고서 (2025.12)',corpCode:corp,reportPeriod:'2025-12',correctionType,remarks:'정연'});
const report=():DartReport=>({receiptNo:selected,receiptDate:'20260327',reportName:'[첨부정정]사업보고서 (2025.12)',reportCode:'11011',periodType:'ANNUAL',withdrawn:false,selection:{version:2,yearMapping:'CALENDAR_REPORT_YEAR',taskFiscalYear:2025,apiFiscalYear:2025,periodEndDate:'2025-12-31',fiscalYearEndMonth:12,annualPeriods:['2024-12','2025-12'],candidates:[disclosure(source,'CONTENT'),disclosure(selected,'ATTACHMENT')]}});
const html=()=>`<a onclick="openCorpInfoNew('${corp}', 'info')">회사</a><select id="family"><option value="rcpNo=${source}">[정정]사업보고서</option></select><select id="att"><option value="rcpNo=${selected}&amp;dcmNo=11191065">첨부</option></select>`;
const url='https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+selected;
const row=():DartFinancialRow=>({receiptNo:source,corpCode:corp,fiscalYear:2025,reportCode:'11011',statementDivision:'IS',statementName:'손익계산서',accountId:'ifrs-full_Revenue',accountName:'매출액',currentAmount:'100',currentYtdAmount:null,currency:'KRW'});
test('missing original remains blocked unless official same-issuer family proves the financial-bearing report',()=>{
 const r=report(),input={report:r,corpCode:corp,taskFiscalYear:2025,rows:[row()],fsDivision:'CFS' as const};
 assert.throws(()=>validateDartFiling(input),/source requires/);
 const proof=publicAttachmentChain(r,corp,source,url,html());assert.ok(proof);
 const result=validateDartFiling({...input,report:{...r,selection:{...r.selection!,attachmentChain:proof}}});
 assert.equal(result.receiptNo,source);assert.equal(result.sourceValidation.selectedReceiptNo,selected);
 assert.equal(result.sourceValidation.relationship,'SAME_PERIOD_ATTACHMENT_CHAIN');assert.equal(result.sourceValidation.financialValuesAssumedEqual,false);
});
test('wrong issuer, fake host, attachment instead of report, and later content corrections cannot prove a chain',()=>{
 assert.equal(publicAttachmentChain(report(),corp,source,url,html().replace(corp,'99999999')),undefined);
 assert.equal(publicAttachmentChain(report(),corp,source,url.replace('dart.fss.or.kr','example.invalid'),html()),undefined);
 assert.equal(publicAttachmentChain(report(),corp,source,url,html().replace('[정정]사업보고서','감사보고서')),undefined);
 const r=report();r.selection!.candidates.push(disclosure('20260326500239','CONTENT'));
 assert.equal(publicAttachmentChain(r,corp,source,url,html()),undefined);
});
test('a provider proof request uses the existing quota; exhausted budget makes zero external calls',async()=>{
 let calls=0;const provider=new OpenDartProvider({apiKey:'fixture',dailyCallLimit:1,minDelayMs:0,reserveCall:async()=>false,fetchFn:async()=>{calls++;return new Response(html());}});
 await assert.rejects(provider.validateFinancialSource(report(),corp,2025,[row()],'CFS'));
 assert.equal(calls,0);
});
