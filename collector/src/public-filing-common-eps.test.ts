import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@roxstock/shared/prisma';
import {reviewPublicCommonEps,type CommonEpsLayout} from './public-filing-common-eps.js';
import {calculatePeriod} from '@roxstock/shared/domain/period-valuation';
import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
const f:any={securityId:1n,receiptNo:'20250321000001',fsDivision:'CFS',fiscalYear:2024,periodType:'ANNUAL',periodEndDate:new Date('2024-12-31'),receiptDate:new Date('2025-03-21'),accountSources:{parentNetIncome:{amount:'120000000'},basicEps:{amount:'99'}},netIncomeYtd:new Prisma.Decimal(120000000)};
const url=`https://dart.fss.or.kr/report/viewer.do?rcpNo=${f.receiptNo}`;
const label=(...labels:string[])=>({labels});
const layout:CommonEpsLayout={parent:label('지배주주순이익'),common:label('보통주순이익'),weighted:label('가중평균유통보통주식수'),eps:label('보통주기본주당이익'),money:'백만원',shares:'천주'};
const html=(eps='1000')=>`<p>기본주당이익 (단위: 백만원, 천주, 원)</p><table><tr><td>지배주주순이익</td><td>120</td><td>20</td></tr><tr><td>보통주순이익</td><td>100</td><td>10</td></tr><tr><td>가중평균유통보통주식수</td><td>100</td><td>100</td></tr><tr><td>보통주기본주당이익</td><td>${eps}</td><td>100</td></tr></table>`;
test('reconcile ordinary allocation with explicit money/share units and override ambiguous EPS only in projection',()=>{
 const r=reviewPublicCommonEps(f,{shares:{preferred:true}} as any,html(),url,layout)!;assert.ok(r);assert.equal(r.review.weightedShares,'100000');assert.equal(r.review.commonProfit,'100000000');
 const s={accounts:r.accounts,commonEpsReview:r.review};assert.equal(calculatePeriod(f,undefined,s).values.eps,'1000');
 const projected=supplementedFilings([f],[{securityId:1n,fiscalYear:2024,periodType:'ANNUAL',supplemental:s as any}]);assert.equal((projected[0]!.accountSources as any).basicEps.amount,'1000');assert.equal(f.accountSources.basicEps.amount,'99');
});
test('reject receipt, parent profit, unit and EPS arithmetic mismatches',()=>{
 assert.equal(reviewPublicCommonEps(f,{},html(),url+'0',layout),undefined);
 assert.equal(reviewPublicCommonEps({...f,accountSources:{parentNetIncome:{amount:'130000000'}}}, {},html(),url,layout),undefined);
 assert.equal(reviewPublicCommonEps(f,{},html().replace('백만원, 천주, 원','백만원, 주, 원'),url,layout),undefined);
 assert.equal(reviewPublicCommonEps(f,{},html('990'),url,layout),undefined);
 assert.equal(reviewPublicCommonEps(f,{shares:{preferred:true}} as any,html(),url,{...layout,common:layout.parent}),undefined);
});
test('derive total from unrounded common profit rather than adding rounded operation EPS',()=>{
 const r=reviewPublicCommonEps(f,{},html().replace('>100</td><td>10','>101</td><td>10'),url,{...layout,eps:undefined})!;
 assert.equal(r.review.calculated,true);assert.equal(r.review.eps,'1010');
});
test('one-won disclosed rounding exception requires explicit review and remains bounded',()=>{
 assert.equal(reviewPublicCommonEps(f,{},html('1000.7'),url,layout),undefined);
 const fixture=html('1001'),r=reviewPublicCommonEps(f,{},fixture,url,{...layout,allowOneWonRounding:true})!;assert.ok(r);assert.equal(r.review.arithmeticDifference,'1');
 assert.equal(reviewPublicCommonEps(f,{},html('1002'),url,{...layout,allowOneWonRounding:true}),undefined);
 assert.equal(reviewPublicCommonEps(f,{},html('1000.7'),url,{...layout,allowOneWonRounding:true}),undefined);
});
