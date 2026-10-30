import {Prisma,type PeriodValuation,type DartFinancialFiling} from '../generated/prisma/index.js';
import type {StoredValuation} from './value-analysis.js';
import {closingParentRoe} from './closing-parent-roe.js';
import {fiscalDurationMatches} from './period-valuation.js';
import {financialCurrency} from './financial-currency.js';
const D=Prisma.Decimal.clone({precision:60}),obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as any:{},num=(v:unknown)=>typeof v==='string'&&/^\d+$/.test(v)?new D(v):null;
export const reconciledSharePolicy='EXACT_DART_CLASS_TOTALS_AND_PARENT_INPUTS_V1';

/** Reconcile the original dated share table, never infer ordinary shares from an unknown class. */
export function reconciledShareReference(metric:StoredValuation|null,row:PeriodValuation|undefined,filings:DartFinancialFiling[]){
 if(!metric||!row||row.periodType!=='ANNUAL')return null;
 const p=obj(row.provenance),sup=obj(row.supplemental),bps=obj(obj(p.perMetric).bps??p),roeEvidence=obj(obj(p.perMetric).roe??p),shares=obj(sup.shares);
 if(!(bps.bpsReferenceOnly===true||p.bpsReferenceOnly===true||p.wShareReview?.policy===reconciledSharePolicy)||!['OPEN_DART','NAVER_FNGUIDE_ANNUAL','USER_CURRENT_SHARES_REFERENCE'].includes(bps.source)||obj(sup.manualFields).bps||/MANUAL/i.test(String(roeEvidence.source??'')))return null;
 const review=obj(p.wShareReview),identity=review.policy===reconciledSharePolicy&&review.receiptNo&&review.fsDivision&&review.periodEnd?review:bps;
 const f=filings.find(f=>!f.isWithdrawn&&f.securityId===row.securityId&&f.fiscalYear===row.fiscalYear&&f.periodType==='ANNUAL'&&f.receiptNo===identity.receiptNo&&f.fsDivision===identity.fsDivision);
 if(!f||row.collectionSymbol&&f.collectionSymbol&&row.collectionSymbol!==f.collectionSymbol||financialCurrency(f)!=='KRW'||p.currency&&p.currency!=='KRW'||bps.currency&&bps.currency!=='KRW'||metric.currency&&metric.currency!=='KRW')return null;
 const end=f.periodEndDate.toISOString().slice(0,10),duration=bps.fiscalDuration??sup.fiscalDuration??p.fiscalDuration??p.batchPeriodVerification;
 if(identity.periodEnd!==end||shares.receiptNo!==f.receiptNo||!fiscalDurationMatches(f,duration)||duration.months!==12)return null;
 const shareDerivations:any[]=[];
 const rows=(Array.isArray(shares.rows)?shares.rows:[]).map((raw:any)=>{
  const r={...raw},keys=['issuedShares','treasuryShares','outstandingShares'],missing=keys.filter(k=>r[k]==null);
  if(missing.length===1&&keys.filter(k=>k!==missing[0]).every(k=>num(r[k])!==null)){
   const k=missing[0]!,v=k==='issuedShares'?new D(r.treasuryShares).plus(r.outstandingShares):k==='treasuryShares'?new D(r.issuedShares).minus(r.outstandingShares):new D(r.issuedShares).minus(r.treasuryShares);
   if(v.gte(0)){r[k]=v.toString();shareDerivations.push({stockKind:r.stockKind,field:k,value:r[k],method:'ISSUED_MINUS_TREASURY_EQUALS_OUTSTANDING'});}
  }
  return r;
 }),totals=rows.filter((r:any)=>r.shareClass==='TOTAL'),classes=rows.filter((r:any)=>r.shareClass!=='TOTAL');
 if(totals.length!==1||rows.some((r:any)=>r.periodEndDate!==end)||classes.some((r:any)=>!['COMMON','PREFERRED','OTHER'].includes(r.shareClass)))return null;
 if(classes.some((r:any)=>typeof r.stockKind!=='string'||!r.stockKind.trim())||new Set(classes.map((r:any)=>r.stockKind.replace(/\s/g,''))).size!==classes.length)return null;
 const empty=classes.filter((r:any)=>r.issuedShares==null&&r.treasuryShares==null&&r.outstandingShares==null),active=classes.filter((r:any)=>!empty.includes(r));
 for(const key of ['issuedShares','treasuryShares','outstandingShares']){const sum=active.reduce((sum:Prisma.Decimal|null,r:any)=>sum&&num(r[key])?sum.plus(r[key]):null,new D(0));if(classes.length&&(!sum||!num(totals[0][key])?.eq(sum)))return null;}
 if([...active,...totals].some(r=>!num(r.issuedShares)||!num(r.treasuryShares)||!num(r.outstandingShares)||!num(r.issuedShares)!.minus(r.treasuryShares).eq(r.outstandingShares)))return null;
 if(active.some((r:any)=>r.shareClass==='PREFERRED'&&num(r.outstandingShares)!.gt(0))&&shares.preferred!==true)return null;
 const common=active.filter((r:any)=>r.shareClass==='COMMON'),unknown=active.filter((r:any)=>r.shareClass==='OTHER'&&num(r.outstandingShares)!.gt(0));
 if(common.length>1||unknown.some((r:any)=>typeof r.stockKind!=='string'||!r.stockKind.trim()||r.stockKind.length>100))return null;
 const count=num(totals[0].outstandingShares)!;if(!count.gt(0)||common.length&&shares.outstanding!=null&&!num(common[0].outstandingShares)!.eq(String(shares.outstanding)))return null;
 const mixed=!common.length||active.some((r:any)=>r.shareClass!=='COMMON'&&num(r.outstandingShares)!.gt(0));
 if(!mixed&&common.length!==1)return null;
 let equity:Prisma.Decimal|null=null,roe:string|null=null,source='OPEN_DART';
 if(f.fsDivision==='CFS'){const c=closingParentRoe(f,sup);if(c){equity=new D(c.equity);roe=c.value;if(c.inputEvidence?.source==='MATCHED_NAVER_ANNUAL_AND_DART_TOTALS')source='DART_NAVER_RECONCILED';}}
 else if(f.fsDivision==='OFS'&&f.totalEquity?.gt(0)&&f.netIncomeYtd!=null){equity=new D(f.totalEquity.toString());roe=new D(f.netIncomeYtd.toString()).div(equity).mul(100).toDecimalPlaces(4).toString();}
 if(!equity?.gt(0)||roe===null||metric.bps==null||!/^\d+(?:\.\d+)?$/.test(metric.bps))return null;
 const book=new D(metric.bps);if(!book.gt(0))return null;
 const exact=equity.div(count),provider=bps.source==='NAVER_FNGUIDE_ANNUAL';
 if(provider&&source!=='OPEN_DART'){
  let url:URL;try{url=new URL(bps.sourceUrl);}catch{return null;}
  const symbol=row.collectionSymbol??f.collectionSymbol;
  if(!symbol||f.collectionSymbol&&symbol!==f.collectionSymbol||url.origin!=='https://wcomp.fnguide.com'||url.pathname!=='/CompanyInfo/Snapshot'||url.searchParams.get('cmp_cd')!==symbol||bps.kind!=='FINAL_ANNUAL'||bps.fiscalYear!==row.fiscalYear||bps.periodType!=='ANNUAL'||bps.validation!=='STORED_FINANCIAL_ANCHORS_RECONCILED'||bps.financialAnchorsMatched<6||!/^[a-f0-9]{64}$/.test(bps.sourceHash??'')||bps.sharePolicy!=='PROVIDER_ADJUSTED_ORDINARY_AND_PREFERRED_DENOMINATOR')return null;
  if(book.decimalPlaces()>4)return null;
  // Verified parent inputs and dated DART shares independently determine W.
  // Stored BPS keeps its original source and is not an operand in this calculation.
 }
 if(obj(sup.manualFields).roe&&(roeEvidence.roeDenominator!==(f.fsDivision==='CFS'?'CLOSING_PARENT_EQUITY':'CLOSING_EQUITY')||metric.roe!==roe))return null;
 const warning=mixed?'투자 주의 · 우선주·종류주식 합산 참고 W: 공시된 전체 유통주식수에 동일 배분한 참고 계산이며 주식 종류별 권리 차이는 반영하지 않습니다.':'투자 주의 · 주식수 기준: 저장 BPS는 참고값으로 보존하고, W는 동일 공시의 연말 자본·보통주 유통주식수로 별도 계산했습니다.';
 return {policy:reconciledSharePolicy,shareDerivations,basis:source==='OPEN_DART'?'DIRECT_DART_CAPITAL_ROE_AND_DATED_SHARES':'RECONCILED_EXTERNAL_PARENT_AND_DATED_SHARES',storedBpsDifference:book.minus(exact).toString(),warning,roeNote:`참고 W용 ROE ${new D(roe).toFixed(2)}% · 동일 연간 순손익 / 연말 ${f.fsDivision==='CFS'?'지배주주':'별도'} 자본 기준.`,roe,source,rimBps:exact.toString(),equity:equity.toString(),shares:count.toString(),commonShares:common[0]?.outstandingShares??'0',preferredShares:count.minus(common[0]?.outstandingShares??'0').toString(),receiptNo:f.receiptNo,periodEnd:end,division:f.fsDivision,year:f.fiscalYear,isReference:mixed,shareClass:mixed?'ALL_REFERENCE':'COMMON'};
}
