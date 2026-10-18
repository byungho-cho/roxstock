import test from 'node:test';import assert from 'node:assert/strict';
import {Prisma} from '@roxstock/shared/prisma';
import {reviewPublicOwnerProfit} from './public-filing-owner-profit.js';
const f:any={receiptNo:'20231114000001',fsDivision:'CFS',periodEndDate:new Date('2023-09-30'),totalAssets:new Prisma.Decimal(1000),totalLiabilities:new Prisma.Decimal(600),totalEquity:new Prisma.Decimal(400),netIncomeYtd:new Prisma.Decimal(-100)};
const s:any={fiscalDuration:{method:'DART_MAJOR_ACCOUNTS_MATCH',receiptNo:f.receiptNo,fsDivision:'CFS',start:'2023-07-01',end:'2023-09-30',months:3,verifiedAt:'2026-10-18'}};
const url='https://dart.fss.or.kr/report/viewer.do?rcpNo='+f.receiptNo;
const html='<p>연결 재무상태표 2023.09.30 현재 (단위 : 원) 자산총계 1,000 부채총계 600 자본총계 400 연결 포괄손익계산서 2023.07.01 부터 2023.09.30 까지 (단위 : 원) 중단영업이익(손실) 0 0 당기순이익(손실) (100) (100) 지배기업의 소유주에게 귀속되는 당기순이익(손실) 계속영업이익(손실) (110) (110) 중단영업이익(손실) 0 0 비지배지분에 귀속되는 당기순이익(손실) 계속영업이익(손실) 10 10 총 포괄손익의 귀속 연결 자본변동표</p>';
test('reconcile owner components and NCI against stored balances and YTD profit',()=>{const r=reviewPublicOwnerProfit(f,s,html,url)!;assert.equal(r.ytdAmount,'-110');assert.equal(r.review.nonControllingProfit,'10');assert.equal(r.review.nonControllingDiscontinuedDerivedZero,true);});

test('calendar annual owner and NCI labels require exact statement dates, units and balance anchors',()=>{
 const annual={...f,fiscalYear:2023,periodType:'ANNUAL',periodEndDate:new Date('2023-12-31')},source='<p>연결 재무상태표 2023.12.31 현재 (단위 : 원) 자산총계 1,000 부채총계 600 자본총계 400 연결 포괄손익계산서 2023.01.01 부터 2023.12.31 까지 (단위 : 원) 당기순이익(손실) (100) (99) 지배기업의 소유주에게 귀속될 계속영업손익 (110) 비지배지분에 귀속될 계속영업손익 10 연결 자본변동표</p>';
 assert.equal(reviewPublicOwnerProfit(annual,{},source,url)?.amount,'-110');assert.equal(reviewPublicOwnerProfit(annual,{},source.replace('계속영업손익 10','계속영업손익 11'),url),undefined);assert.equal(reviewPublicOwnerProfit(annual,{},source.replace('2023.01.01','2023.04.01'),url),undefined);
});
test('missing NCI components are never assumed zero without explicit zero total and owner discontinued profit',()=>{assert.equal(reviewPublicOwnerProfit(f,s,html.replace('중단영업이익(손실) 0 0','중단영업이익(손실) 1 1'),url),undefined);assert.equal(reviewPublicOwnerProfit(f,s,html.replace('계속영업이익(손실) 10 10','계속영업이익(손실) 11 11'),url),undefined);assert.equal(reviewPublicOwnerProfit(f,s,html,url+'0'),undefined);assert.equal(reviewPublicOwnerProfit({...f,totalEquity:new Prisma.Decimal(401)},s,html,url),undefined);assert.equal(reviewPublicOwnerProfit(f,s,html.replace('2023.09.30 현재','2022.09.30 현재'),url),undefined);});
