import{Prisma,type PeriodValuation,type FinancialStatement}from'../generated/prisma/index.js';
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{},D=Prisma.Decimal.clone({precision:60}),dec=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new D(v):null;
export const providerAnnualReviewPolicy='AUDIT_MATCHED_PROVIDER_ANNUAL_V1';
/** Original provider payload stays immutable; a year header alone never fabricates a DART filing. */
export function providerAnnualSource(row:PeriodValuation|undefined){
 if(!row||row.periodType!=='ANNUAL')return null;const sup=obj(row.supplemental),s=obj(sup.manualSource),review=obj(sup.annualSourceReview);
 if(review.policy!==providerAnnualReviewPolicy||s.source!=='NAVER_FNGUIDE_ANNUAL'||s.kind!=='FINAL_ANNUAL'||s.fiscalYear!==row.fiscalYear||s.fiscalMonth!==12||!['CFS','OFS'].includes(s.division)||!Number.isFinite(Date.parse(s.collectedAt)))return null;
 try{const u=new URL(s.sourceUrl);if(u.origin!=='https://navercomp.wisereport.co.kr'||u.pathname!=='/v3/company/c1010001.aspx'||!row.collectionSymbol||u.searchParams.get('cmp_cd')!==row.collectionSymbol)return null;}catch{return null;}
 const a=obj(s.financials),assets=dec(a.totalAssets),liabilities=dec(a.totalLiabilities),equity=dec(a.totalEquity);if(!assets||!liabilities||!equity||assets.lt(0)||liabilities.lt(0)||assets.minus(liabilities).minus(equity).abs().gt('1500000'))return null;
 return s;
}
export function providerAnnualClosingRoe(row:PeriodValuation|undefined,references:FinancialStatement[]){
 const s=providerAnnualSource(row);if(!s||!row)return null;const sup=obj(row.supplemental),p=obj(row.provenance),manual=obj(sup.manualFields);if(manual.roe||manual.bps||/^9[05]/.test(row.collectionSymbol??''))return null;
 const ref=references.find(f=>f.securityId===row.securityId&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'&&f.source==='DART_PUBLIC_REFERENCE'),m=obj(ref?.sourceMetadata),end=`${row.fiscalYear}-12-31`;
 if(!ref||ref.periodEndDate.toISOString().slice(0,10)!==end||m.periodStart!==`${row.fiscalYear}-01-01`||m.periodEnd!==end||m.fsDivision!==s.division||m.accountingStandard!=='KIFRS'||!/^[a-f0-9]{64}$/.test(m.contentSha256??''))return null;
 try{const u=new URL(m.sourceUrl);if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==m.sourceReceiptNo)return null;}catch{return null;}
 for(const key of['revenue','operatingProfit','netIncome','totalAssets','totalLiabilities','totalEquity']as const){const a=dec(s.financials[key]),b=ref[key];if(!a||b==null||a.minus(b.toString()).abs().gt('500000'))return null;}
 const equity=dec(s.financials[s.division==='CFS'?'parentEquity':'totalEquity']),profit=dec(s.financials[s.division==='CFS'?'parentNetIncome':'netIncome']);if(!equity?.gt(0)||!profit||p.fsDivision!==s.division||p.currency!=='KRW'||p.periodEnd!==end)return null;
 return {value:profit.div(equity).mul(100).toDecimalPlaces(4).toString(),equity:equity.toString(),profit:profit.toString(),sourceReceiptNo:m.sourceReceiptNo,warning:'투자 주의 · 주식수 기준: 제공처의 수정 주식수 BPS를 사용한 참고 W입니다. 감사보고서와 연간 합계를 대조했으며 ROE는 같은 제공처의 기말 자본·연간 순손익으로 계산했습니다. 실제 종류별 주식수 대조는 별도입니다.'};
}
