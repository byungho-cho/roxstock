import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import type {Supplemental} from './period-valuation.js';
/** Exact common-class EPS takes precedence over ambiguous aggregate/provider EPS. */
export function commonEpsReviewMatches(f:DartFinancialFiling,s:Supplemental){
 const e=s.commonEpsReview,a=s.accounts;
 if(!e||!a||e.method!=='DART_PUBLIC_COMMON_EPS_RECONCILED'||f.periodType!=='ANNUAL'||e.fiscalYear!==f.fiscalYear||e.receiptNo!==f.receiptNo||e.fsDivision!==f.fsDivision||e.periodEnd!==f.periodEndDate.toISOString().slice(0,10)||e.periodEnd!==`${f.fiscalYear}-12-31`||a.receiptNo!==f.receiptNo||a.fsDivision!==f.fsDivision||!(/^[a-f0-9]{64}$/).test(e.contentSha256))return false;
 const resolution=(f.sourceValidation as {periodResolution?:unknown}|null)?.periodResolution,d=s.fiscalDuration;
 if(resolution&&(!d||d.receiptNo!==f.receiptNo||d.fsDivision!==f.fsDivision||d.start!==`${f.fiscalYear}-01-01`||d.end!==e.periodEnd||d.months!==12))return false;
 if(![e.parentProfit,e.reportedParentProfit,e.commonProfit,e.eps,e.parentTolerance].every(v=>/^-?\d+(\.\d+)?$/.test(v))||!/^\d+$/.test(e.weightedShares)||BigInt(e.weightedShares)<=0n)return false;
 const original=f.accountSources as Record<string,{amount?:string|null}>|null,profit=f.fsDivision==='CFS'?original?.parentNetIncome?.amount??a.sources.parentNetIncome?.amount:f.netIncomeYtd?.toString();
 if(profit==null||!new Prisma.Decimal(profit).eq(e.parentProfit)||a.sources.basicEps?.amount!==e.eps||a.sources.basicEps?.ordinaryEpsVerified!==true)return false;
 const tolerance=new Prisma.Decimal(e.parentTolerance);if(tolerance.lt(0)||tolerance.gt(1000000)||new Prisma.Decimal(e.parentProfit).minus(e.reportedParentProfit).abs().gt(tolerance))return false;
 try{const u=new URL(e.sourceUrl);if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==f.receiptNo)return false;}catch{return false;}
 const ratio=new Prisma.Decimal(e.commonProfit).div(e.weightedShares);
 if(e.calculated)return ratio.toDecimalPlaces(4).eq(e.eps);
 if(e.disclosedRoundingTolerance==='1')return new Prisma.Decimal(e.eps).isInteger()&&ratio.minus(e.eps).abs().lte(1)&&e.arithmeticDifference===ratio.minus(e.eps).abs().toString();
 return ratio.minus(e.eps).abs().lte(new Prisma.Decimal('0.5').div(new Prisma.Decimal(10).pow(e.eps.split('.')[1]?.length??0)));
}
export function commonEpsPeriodEndMatches(f:DartFinancialFiling,s:Supplemental){
 if(!commonEpsReviewMatches(f,s)||s.shares?.receiptNo!==f.receiptNo)return false;
 const rows=s.shares.rows?.filter(r=>r.shareClass==='COMMON'&&r.periodEndDate===f.periodEndDate.toISOString().slice(0,10));
 return rows?.length===1&&rows[0]!.outstandingShares===s.commonEpsReview!.weightedShares;
}
