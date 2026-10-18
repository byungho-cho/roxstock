import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {fiscalDurationMatches,type Supplemental,type FiscalEpsReview} from './period-valuation.js';
import {periodEndBookShares} from './share-counts.js';

/** An actual-period EPS numerator is independent of period-end share quantities. */
export function fiscalEpsReviewMatches(f:DartFinancialFiling,s:Supplemental,e:FiscalEpsReview|undefined=s.fiscalEpsReview){
 if(!e||e.method!=='DART_PUBLIC_FISCAL_EPS_RECONCILED'||e.receiptNo!==f.receiptNo||e.fsDivision!==f.fsDivision||s.shares?.preferred||!fiscalDurationMatches(f,s.fiscalDuration)||e.start!==s.fiscalDuration.start||e.end!==s.fiscalDuration.end)return false;
 if(!/^\d+$/.test(e.weightedShares)||BigInt(e.weightedShares)<=0n||!(/^-?\d+$/).test(e.profit)||!(/^-?\d+(\.\d+)?$/).test(e.eps)||!(/^[a-f0-9]{64}$/).test(e.contentSha256))return false;
 const accounts=s.accounts?.receiptNo===f.receiptNo&&s.accounts.fsDivision===f.fsDivision?s.accounts.sources:undefined,sources=f.accountSources as Record<string,{amount?:string|null;ytdAmount?:string|null}>|null;
 const annual=f.periodType==='ANNUAL';
 const eps=annual?sources?.basicEps?.amount??accounts?.basicEps?.amount:sources?.basicEps?.ytdAmount??accounts?.basicEps?.ytdAmount;
 const profit=f.fsDivision==='CFS'?(annual?sources?.parentNetIncome?.amount??accounts?.parentNetIncome?.amount:sources?.parentNetIncome?.ytdAmount??accounts?.parentNetIncome?.ytdAmount):f.netIncomeYtd?.toString();
 if(eps==null||profit==null||!new Prisma.Decimal(eps).eq(e.eps)||!new Prisma.Decimal(profit).eq(e.profit))return false;
 try{const u=new URL(e.sourceUrl);if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==f.receiptNo)return false;}catch{return false;}
 const ratio=new Prisma.Decimal(e.profit).div(e.weightedShares);
 if(e.calculated)return ratio.toDecimalPlaces(4).eq(e.eps);
 const precision=e.eps.split('.')[1]?.length??0;
 return ratio.minus(e.eps).abs().lte(new Prisma.Decimal('0.5').div(new Prisma.Decimal(10).pow(precision)));
}
/** Permit the independent original-close PER path only when the reviewed EPS
 * denominator also agrees with an exact ordinary period-end share disclosure. */
export function fiscalOrdinaryEpsBasis(f:DartFinancialFiling,s:Supplemental){
 const e=s.fiscalEpsReview,book=periodEndBookShares(s.shares,f);
 if(!e||!fiscalEpsReviewMatches(f,s)||!book||book.referenceOnly||book.count!==e.weightedShares)return;
 return {method:'DART_FISCAL_YTD_WEIGHTED_SHARES_EQUAL_PERIOD_END' as const,fiscalStart:e.start,receiptNo:f.receiptNo,fsDivision:f.fsDivision,periodEnd:e.end,weightedShares:e.weightedShares,disclosedEps:e.eps,profit:e.profit,sourceUrl:e.sourceUrl,contentSha256:e.contentSha256};
}
