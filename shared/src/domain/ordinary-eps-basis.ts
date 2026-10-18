import {Prisma,type DartFinancialFiling} from '../generated/prisma/index.js';
import {fiscalDurationMatches,type Supplemental,type OrdinaryEpsBasis} from './period-valuation.js';
import {periodEndBookShares} from './share-counts.js';

export function ordinaryEpsBasisMatches(f:DartFinancialFiling,s:Supplemental,e:OrdinaryEpsBasis|undefined=s.ordinaryEpsBasis){
 if(!e||!['DART_WEIGHTED_ORDINARY_SHARES_EQUAL_PERIOD_END','DART_FISCAL_YTD_WEIGHTED_SHARES_EQUAL_PERIOD_END'].includes(e.method)||e.method==='DART_WEIGHTED_ORDINARY_SHARES_EQUAL_PERIOD_END'&&f.periodType!=='ANNUAL'||e.receiptNo!==f.receiptNo||e.fsDivision!==f.fsDivision||e.periodEnd!==f.periodEndDate.toISOString().slice(0,10)||s.shares?.preferred||!fiscalDurationMatches(f,s.fiscalDuration))return false;
 if(e.method==='DART_FISCAL_YTD_WEIGHTED_SHARES_EQUAL_PERIOD_END'&&e.fiscalStart!==s.fiscalDuration.start)return false;
 const book=periodEndBookShares(s.shares,f);if(!book||book.referenceOnly||book.count!==e.weightedShares||!/^\d+$/.test(e.weightedShares)||BigInt(e.weightedShares)<=0n||!(/^[a-f0-9]{64}$/).test(e.contentSha256))return false;
 const accounts=s.accounts?.receiptNo===f.receiptNo&&s.accounts.fsDivision===f.fsDivision?s.accounts.sources:undefined;
 const sources=f.accountSources as Record<string,{amount?:string|null;ytdAmount?:string|null}>|null;
 const annual=f.periodType==='ANNUAL';
 const eps=annual?sources?.basicEps?.amount??accounts?.basicEps?.amount:sources?.basicEps?.ytdAmount??accounts?.basicEps?.ytdAmount;
 const profit=f.fsDivision==='CFS'?(annual?sources?.parentNetIncome?.amount??accounts?.parentNetIncome?.amount:sources?.parentNetIncome?.ytdAmount??accounts?.parentNetIncome?.ytdAmount):f.netIncomeYtd?.toString();
 if(eps==null||profit==null||!(/^-?\d+(\.\d+)?$/).test(e.disclosedEps)||!(/^-?\d+$/).test(e.profit)||!new Prisma.Decimal(eps).eq(e.disclosedEps)||!new Prisma.Decimal(profit).eq(e.profit))return false;
 try{const u=new URL(e.sourceUrl);if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==f.receiptNo)return false;}catch{return false;}
 const precision=e.disclosedEps.split('.')[1]?.length??0,tolerance=new Prisma.Decimal('0.5').div(new Prisma.Decimal(10).pow(precision));
 return new Prisma.Decimal(e.profit).div(e.weightedShares).minus(e.disclosedEps).abs().lte(tolerance);
}
