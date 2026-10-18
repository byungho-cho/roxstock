import type {DartFinancialFiling} from '../generated/prisma/index.js';
import {fiscalDurationMatches,type Supplemental} from './period-valuation.js';
export function openingCapitalReviewMatches(f:DartFinancialFiling,s:Supplemental){
 const e=s.openingCapitalReview,accounts=s.accounts?.receiptNo===f.receiptNo&&s.accounts.fsDivision===f.fsDivision?s.accounts.sources:undefined;
 if(!e||!accounts||e.method!=='DART_PUBLIC_ADJACENT_CAPITAL_RECONCILED'||e.receiptNo!==f.receiptNo||e.fsDivision!==f.fsDivision||e.end!==f.periodEndDate.toISOString().slice(0,10)||!/^\d{4}-\d{2}-\d{2}$/.test(e.start)||!(/^[a-f0-9]{64}$/).test(e.contentSha256))return false;
 const start=Date.parse(e.start);if(!Number.isFinite(start)||e.openingDate!==new Date(start-86400000).toISOString().slice(0,10))return false;
 if(fiscalDurationMatches(f,s.fiscalDuration)?s.fiscalDuration.start!==e.start:f.periodType!=='ANNUAL'||e.start!==`${f.fiscalYear}-01-01`||e.end!==`${f.fiscalYear}-12-31`)return false;
 const original=f.accountSources as Record<string,{amount?:string|null}>|null,current=f.fsDivision==='CFS'?original?.parentEquity?.amount??accounts.parentEquity?.amount:f.totalEquity?.toString(),reviewed=f.fsDivision==='CFS'?e.closingParentEquity:e.closingTotalEquity;
 if(current==null||current!==reviewed)return false;
 for(const [key,value]of [['openingParentEquity',e.openingParentEquity],['openingTotalEquity',e.openingTotalEquity]] as const)if(value!=null&&(accounts[key]?.amount!==value||accounts[key]?.periodEnd!==e.openingDate))return false;
 try{const u=new URL(e.sourceUrl);return u.origin==='https://dart.fss.or.kr'&&u.pathname==='/report/viewer.do'&&u.searchParams.get('rcpNo')===f.receiptNo;}catch{return false;}
}
