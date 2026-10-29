import {Prisma,type PeriodValuation,type DartFinancialFiling} from '../generated/prisma/index.js';
import {closingParentRoe} from './closing-parent-roe.js';
import {financialCurrency} from './financial-currency.js';
import {fiscalDurationMatches} from './period-valuation.js';
import type {StoredValuation} from './value-analysis.js';
const D=Prisma.Decimal.clone({precision:60}),obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{},n=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?new D(v):null;
export const preferredReferencePolicy='ALL_OUTSTANDING_EQUAL_ALLOCATION_REFERENCE_V1';
export const preferredReferenceWarning='투자 주의 · 우선주 포함 참고 W: 보통주·우선주 합산 유통주식수로 동일하게 배분한 참고 계산입니다. 주식 종류별 권리 차이를 반영하지 않으며, 보수적인 값을 보장하지 않습니다.';
/** Explicitly opted-in equal allocation; never invent a denominator or relax period/currency/source checks. */
export function preferredShareReference(metric:StoredValuation|null,row:PeriodValuation|undefined,filings:DartFinancialFiling[]){
 if(!metric||!row||row.periodType!=='ANNUAL')return null;
 const p=obj(row.provenance),sup=obj(row.supplemental),bps=obj(obj(p.perMetric).bps??p),shares=obj(sup.shares);
 if(!(bps.bpsReferenceOnly===true||p.bpsReferenceOnly===true)||bps.source!=='OPEN_DART'||shares.preferred!==true)return null;
 const f=filings.find(f=>!f.isWithdrawn&&f.securityId===row.securityId&&f.periodType==='ANNUAL'&&f.fiscalYear===row.fiscalYear&&f.receiptNo===bps.receiptNo&&f.fsDivision===bps.fsDivision);
 if(!f||financialCurrency(f)!=='KRW'||(p.currency??'KRW')!=='KRW'||(bps.currency??'KRW')!=='KRW'||metric.currency&&metric.currency!=='KRW')return null;
 const end=f.periodEndDate.toISOString().slice(0,10),duration=bps.fiscalDuration??sup.fiscalDuration??p.fiscalDuration;
 if(bps.periodEnd!==end||shares.receiptNo!==f.receiptNo||bps.sharesReceiptNo!==f.receiptNo)return null;
 if(duration?(!fiscalDurationMatches(f,duration)||duration.months!==12):end!==`${row.fiscalYear}-12-31`||!!obj(f.sourceValidation).periodResolution)return null;
 const rows=Array.isArray(shares.rows)?shares.rows:[],common=rows.filter((r:any)=>r.shareClass==='COMMON'),preferred=rows.filter((r:any)=>r.shareClass==='PREFERRED'),total=rows.filter((r:any)=>r.shareClass==='TOTAL');
 if(common.length!==1||!preferred.length||total.length!==1||[...common,...preferred,...total].some(r=>r.periodEndDate!==end||!n(r.outstandingShares)?.gte(0)))return null;
 const commonCount=n(common[0].outstandingShares)!,preferredCount=preferred.reduce((sum:Prisma.Decimal,r:any)=>sum.plus(r.outstandingShares),new D(0)),count=n(total[0].outstandingShares)!;
 if(!commonCount.gt(0)||!preferredCount.gt(0)||!commonCount.plus(preferredCount).eq(count)||shares.outstanding!=null&&!commonCount.eq(String(shares.outstanding))||bps.bookShares!=null&&!count.eq(String(bps.bookShares)))return null;
 let equity:Prisma.Decimal|null=null,roe:string|null=null,source='OPEN_DART';
 if(f.fsDivision==='CFS'){const candidate=closingParentRoe(f,sup);if(candidate){equity=new D(candidate.equity);roe=candidate.value;if(candidate.inputEvidence?.source==='MATCHED_NAVER_ANNUAL_AND_DART_TOTALS')source='DART_NAVER_RECONCILED';}}
 else if(f.fsDivision==='OFS'&&f.totalEquity?.gt(0)&&f.netIncomeYtd!=null){equity=new D(f.totalEquity.toString());roe=new D(f.netIncomeYtd.toString()).div(equity).mul(100).toDecimalPlaces(4).toString();}
 const book=n(metric.bps);if(!equity?.gt(0)||roe===null||!book?.gt(0)||!equity.div(count).toDecimalPlaces(4).eq(book.toDecimalPlaces(4)))return null;
 const roeEvidence=obj(obj(p.perMetric).roe??p);
 if(obj(sup.manualFields).roe||/MANUAL/i.test(String(roeEvidence.source??''))){if(roeEvidence.roeDenominator!==(f.fsDivision==='CFS'?'CLOSING_PARENT_EQUITY':'CLOSING_EQUITY')||!n(metric.roe)?.eq(roe))return null;}
 const roeNote=`참고 W용 ROE ${new D(roe).toFixed(2)}% · 동일 연간 순손익 / 연말 ${f.fsDivision==='CFS'?'지배주주':'별도'} 자본 기준. 저장된 제공처 ROE와 다를 수 있습니다.`;
 return {policy:preferredReferencePolicy,warning:preferredReferenceWarning,roeNote,roe,source,equity:equity.toString(),shares:count.toString(),commonShares:commonCount.toString(),preferredShares:preferredCount.toString(),receiptNo:f.receiptNo,periodEnd:end,division:f.fsDivision,year:f.fiscalYear};
}
