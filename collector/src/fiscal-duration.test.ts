import test from 'node:test';import assert from 'node:assert/strict';
import {Prisma,type DartFinancialFiling} from '@roxstock/shared/prisma';
import {verifyFiscalDuration} from './fiscal-duration.js';
const f={receiptNo:'20260311004347',fiscalYear:2025,reportCode:'11011',fsDivision:'CFS',periodEndDate:new Date('2025-12-31'),totalEquity:new Prisma.Decimal(220),netIncomeYtd:new Prisma.Decimal(20)} as DartFinancialFiling;
const base={rcept_no:f.receiptNo,bsns_year:'2025',reprt_code:'11011',fs_div:'CFS',stock_code:'395400',currency:'KRW'};
const rows=[{...base,sj_div:'BS',account_nm:'자본총계',thstrm_amount:'220',thstrm_dt:'2025.12.31 현재',frmtrm_dt:'2025.09.30 현재',frmtrm_amount:'180'},{...base,sj_div:'IS',account_nm:'당기순이익(손실)',thstrm_amount:'20',thstrm_dt:'2025.10.01 ~ 2025.12.31'}];
test('major accounts prove a three-month annual filing and adjacent opening balance',()=>{const r=verifyFiscalDuration(f,rows,'395400');assert.equal(r?.months,3);assert.equal(r?.openingEquity,'180');assert.equal(r?.start,'2025-10-01');});
test('wrong receipt, currency, symbol, amount and incompatible YTD do not prove duration',()=>{for(const change of [{rcept_no:'other'},{currency:'USD'},{stock_code:'000000'},{thstrm_amount:'21'}])assert.equal(verifyFiscalDuration(f,rows.map(r=>({...r,...change})),'395400'),undefined);assert.equal(verifyFiscalDuration({...f,netIncomeYtd:new Prisma.Decimal(60)},rows,'395400'),undefined);});
test('unrelated opening date cannot become fiscal opening equity',()=>{const r=verifyFiscalDuration(f,[{...rows[0]!,frmtrm_dt:'2024.12.31 현재'},rows[1]!],'395400');assert.equal(r?.months,3);assert.equal(r?.openingEquity,undefined);});
test('interim cumulative income is matched instead of the standalone current quarter',()=>{
 const interim={...f,periodType:'Q2',reportCode:'11012',periodEndDate:new Date('2025-06-30')};
 const r=verifyFiscalDuration(interim,rows.map(r=>({...r,reprt_code:'11012',thstrm_dt:r.sj_div==='BS'?'2025.06.30 현재':'2025.01.01 ~ 2025.06.30',thstrm_amount:r.sj_div==='BS'?'220':'7',thstrm_add_amount:'20',frmtrm_dt:'2024.12.31 현재'})),'395400');assert.equal(r?.months,6);assert.equal(r?.openingEquity,'180');
});
test('missing net income can use two independently reconciled revenue and operating income accounts',()=>{
 const f2={...f,netIncomeYtd:null,revenueYtd:new Prisma.Decimal(100),operatingProfitYtd:new Prisma.Decimal(30)};
 const alt=[rows[0]!,{...rows[1]!,account_nm:'매출액',thstrm_amount:'100'},{...rows[1]!,account_nm:'영업이익',thstrm_amount:'30'}];
 assert.equal(verifyFiscalDuration(f2,alt,'395400')?.months,3);assert.equal(verifyFiscalDuration(f2,alt.slice(0,2),'395400'),undefined);
});
test('formation periods retain exact days with an explicit ACT/365 basis',()=>{
 const r=verifyFiscalDuration(f,rows.map(r=>r.sj_div==='IS'?{...r,thstrm_dt:'2025.10.21 ~ 2025.12.31'}:r),'395400');assert.equal(r?.annualization,'ACT_365');assert.equal(r?.days,72);assert.equal(r?.openingEquity,undefined);
});

test('missing equity row can use separately matched dated assets and liabilities without inventing opening equity',()=>{
 const filing={...f,totalAssets:new Prisma.Decimal(500),totalLiabilities:new Prisma.Decimal(280)},assets={...rows[0]!,account_nm:'자 산 총 계',thstrm_amount:'500'},liabilities={...rows[0]!,account_nm:'부채총계',thstrm_amount:'280'},input=[assets,liabilities,rows[1]!];
 const d=verifyFiscalDuration(filing,input,'395400');assert.equal(d?.months,3);assert.equal(d?.openingEquity,undefined);assert.deepEqual(d?.balanceDerivation,{method:'EXACT_MATCHED_ASSETS_MINUS_LIABILITIES',assets:'500',liabilities:'280',equity:'220',currency:'KRW'});
 assert.equal(verifyFiscalDuration(filing,[assets,{...liabilities,thstrm_amount:'279'},rows[1]!],'395400'),undefined);assert.equal(verifyFiscalDuration(filing,[...input,{...rows[0]!,thstrm_amount:'219'}],'395400'),undefined);assert.equal(verifyFiscalDuration(filing,[...input,{...assets}],'395400'),undefined);
});

test('native USD annual duration reconciles only matching native currency without converting amounts',()=>{const usd={...f,sourceValidation:{currency:'USD'}},native=rows.map(r=>({...r,currency:'USD'}));assert.equal(verifyFiscalDuration(usd,native,'395400')?.months,3);assert.equal(verifyFiscalDuration(usd,rows,'395400'),undefined);assert.equal(verifyFiscalDuration(usd,[native[0]!,{...native[1]!,currency:'CNY'}],'395400'),undefined);});

test('blank reported income can use two exact independent flow anchors; numeric conflicts still block',()=>{const f2={...f,revenueYtd:new Prisma.Decimal(100),operatingProfitYtd:new Prisma.Decimal(30)};const alt=[rows[0]!,{...rows[1]!,thstrm_amount:''},{...rows[1]!,account_nm:'매출액',thstrm_amount:'100'},{...rows[1]!,account_nm:'영업이익',thstrm_amount:'30'}];assert.equal(verifyFiscalDuration(f2,alt,'395400')?.months,3);assert.equal(verifyFiscalDuration(f2,alt.map((r,i)=>i===1?{...r,thstrm_amount:'21'}:r),'395400'),undefined);assert.equal(verifyFiscalDuration(f2,alt.slice(0,3),'395400'),undefined);});
