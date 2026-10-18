import test from 'node:test';import assert from 'node:assert/strict';
import {Prisma,type DartFinancialFiling} from '@roxstock/shared/prisma';
import {reviewPublicFilingPeriod} from './public-filing-period.js';
import {calculatePeriod} from '@roxstock/shared/domain/period-valuation';
const f={receiptNo:'20211111000322',fsDivision:'CFS',fiscalYear:2021,periodType:'ANNUAL',periodEndDate:new Date('2021-08-31'),receiptDate:new Date('2021-11-11'),accountSources:{},totalEquity:new Prisma.Decimal(100),revenueYtd:new Prisma.Decimal(50),operatingProfitYtd:new Prisma.Decimal(20),netIncomeYtd:new Prisma.Decimal(15)} as DartFinancialFiling;
const url='https://dart.fss.or.kr/report/viewer.do?rcpNo=20211111000322&dcmNo=8270340';
const html='<p>연결 재무상태표 제 4 기 2021.08.31 현재 제 3 기 2021.02.28 현재 (단위 : 원) 지배기업 소유주지분 100 80 자본총계 100 80 연결 포괄손익계산서 제 4 기 2021.03.01 부터 2021.08.31 까지 (단위 : 원) 영업수익 50 20 영업이익 20 10 당기순이익 15 5 지배기업 소유주지분 15 5 기본주당이익(손실) (단위 : 원) 3 2 연결 자본변동표</p>';
test('official receipt section proves exact flow span, figures and adjacent parent opening capital',()=>{
 const r=reviewPublicFilingPeriod(f,html,url);assert.equal(r?.fiscalDuration?.months,6);assert.equal(r?.fiscalDuration?.openingParentEquity,'80');assert.equal(r?.fiscalDuration?.contentSha256?.length,64);const value=calculatePeriod(f,undefined,r);assert.equal(value.values.eps,'6');assert.equal(value.values.roe,'33.3333');assert.equal(value.provenance.roeBasis,'OWNERS_OF_PARENT');
});
test('a different receipt, mismatched amounts or foreign units never create reviewed evidence',()=>{
 assert.equal(reviewPublicFilingPeriod(f,html,url.replace('20211111000322','20211111000000')),undefined);assert.equal(reviewPublicFilingPeriod(f,html.replace('자본총계 100','자본총계 101'),url),undefined);assert.equal(reviewPublicFilingPeriod(f,html.replaceAll('단위 : 원','단위 : USD'),url),undefined);
});
test('missing annual flow accounts can be recovered only with all three reconciled balance anchors',()=>{
 const missing={...f,revenueYtd:null,operatingProfitYtd:null,netIncomeYtd:null,totalAssets:new Prisma.Decimal(120),totalLiabilities:new Prisma.Decimal(20)};
 const document=html.replace('자본총계 100 80','자산총계 120 110 부채총계 20 30 자본총계 100 80');
 const r=reviewPublicFilingPeriod(missing,document,url);assert.equal(r?.accounts?.sources.revenue?.amount,'50');assert.equal(r?.accounts?.sources.netIncome?.amount,'15');assert.equal(reviewPublicFilingPeriod(missing,document.replace('자산총계 120','자산총계 121'),url),undefined);assert.equal(reviewPublicFilingPeriod({...missing,periodType:'Q2'},document,url),undefined);
});
test('Q1 verifies identical current three-month/YTD columns and actual adjacent fiscal opening',()=>{
 const q={...f,periodType:'Q1' as const},document=html.replace('기 2021.08.31 현재','기 1분기말 2021.08.31 현재').replace('기 2021.02.28 현재','기말 2021.05.31 현재').replace('기 2021.03.01 부터','기 1분기 2021.06.01 부터').replace('영업수익 50 20 영업이익 20 10 당기순이익 15 5','3개월 누적 3개월 누적 영업수익 50 50 10 10 영업이익 20 20 5 5 당기순이익 15 15 1 1');
 const r=reviewPublicFilingPeriod(q,document,url)!;assert.ok(r);assert.equal(r.fiscalDuration?.months,3);assert.equal(r.fiscalDuration?.openingDate,'2021-05-31');
 assert.equal(reviewPublicFilingPeriod(q,document.replace('영업수익 50 50','영업수익 50 60'),url),undefined);assert.equal(reviewPublicFilingPeriod(q,document.replace('2021.06.01','2021.03.01'),url),undefined);
});
