import type {DartShareSnapshot} from '../generated/prisma/index.js';
export type ShareRow={stockKind:string;shareClass:string;issuedShares:string|null;treasuryShares:string|null;outstandingShares:string|null;periodEndDate:string};
export type PeriodShares={outstanding:string|null;preferred:boolean;receiptNo:string;collectedAt?:string;issuedShares?:string|null;treasuryShares?:string|null;rows?:ShareRow[]};
export function shareClassOf(stockKind:string){const kind=stockKind.replace(/\s/g,'');if(kind==='합계')return 'TOTAL';if(kind.includes('보통주')&&!kind.includes('우선'))return 'COMMON';if(kind.includes('우선')&&!kind.includes('보통'))return 'PREFERRED';return 'OTHER';}
/** A valid source's explicit null is not a missing extraction field in the legacy cache. */
export function completeShares(shares:PeriodShares|undefined,receiptNo:string){return shares?.receiptNo===receiptNo&&!!shares.rows?.some(r=>r.shareClass==='COMMON'&&r.issuedShares!==null&&r.treasuryShares!==null&&r.outstandingShares!==null)&&shares.rows.every(r=>['issuedShares','treasuryShares','outstandingShares'].every(key=>Object.prototype.hasOwnProperty.call(r,key)));}
/** Pick one exact filing basis; never fill individual fields from another receipt or current fundamentals. */
export function displayShares(rows:DartShareSnapshot[],filings:{receiptNo:string;fiscalYear:number;periodEndDate:Date;isWithdrawn?:boolean;receiptDate:Date}[],year:number,shareClass='COMMON',quarter?:number|null){
 const matches=filings.filter(f=>f.fiscalYear===year&&!f.isWithdrawn&&(!quarter||f.periodEndDate.getUTCMonth()===quarter*3-1)).sort((a,b)=>b.periodEndDate.getTime()-a.periodEndDate.getTime()||b.receiptDate.getTime()-a.receiptDate.getTime()||b.receiptNo.localeCompare(a.receiptNo));
 const filing=matches[0],candidates=filing?rows.filter(r=>r.receiptNo===filing.receiptNo&&r.shareClass===shareClass):[];const row=candidates.length===1?candidates[0]:undefined;
 return {issuedShares:row?.issuedShares?.toString()??null,treasuryShares:row?.treasuryShares?.toString()??null,outstandingShares:row?.outstandingShares?.toString()??null,shareBasis:row?{receiptNo:row.receiptNo,stockKind:row.stockKind,shareClass:row.shareClass,fiscalYear:row.fiscalYear,reportCode:row.reportCode,periodEndDate:row.periodEndDate.toISOString().slice(0,10),collectedAt:row.collectedAt.toISOString()}:null};
}
/** Display-only: one filing/class; estimates may explicitly fall back to the previous final annual filing. */
export function latestDisplayShares(rows:DartShareSnapshot[],filings:(Parameters<typeof displayShares>[1][number]&{periodType?:string})[],year:number,shareClass='COMMON',allowPreviousAnnual=false){
 const candidates=filings.filter(f=>f.fiscalYear===year&&!f.isWithdrawn).sort((a,b)=>b.periodEndDate.getTime()-a.periodEndDate.getTime()||b.receiptDate.getTime()-a.receiptDate.getTime()||b.receiptNo.localeCompare(a.receiptNo));
 const filing=candidates.find(f=>{
  const matching=rows.filter(r=>r.receiptNo===f.receiptNo&&r.shareClass===shareClass&&r.fiscalYear===year&&r.periodEndDate.getTime()===f.periodEndDate.getTime());
  return matching.length===1&&[matching[0]!.issuedShares,matching[0]!.treasuryShares,matching[0]!.outstandingShares].some(v=>v!==null);
 });
 if(!filing&&allowPreviousAnnual)return latestDisplayShares(rows,filings.filter(f=>f.periodType==='ANNUAL'),year-1,shareClass);
 return displayShares(rows,filing?[filing]:[],year,shareClass);
}
/** A share snapshot is itself a stored DART source. Display it independently of the metric year. */
export function latestStoredDisplayShares(rows:DartShareSnapshot[],filings:Parameters<typeof displayShares>[1],year:number,shareClass='COMMON'){
 const eligible=rows.filter(r=>r.shareClass===shareClass&&r.fiscalYear<=year&&r.periodEndDate.toISOString().slice(0,10)<=`${year}-12-31`&&[r.issuedShares,r.treasuryShares,r.outstandingShares].some(v=>v!==null)&&!filings.some(f=>f.receiptNo===r.receiptNo&&f.isWithdrawn))
  .sort((a,b)=>b.periodEndDate.getTime()-a.periodEndDate.getTime()||b.receiptNo.localeCompare(a.receiptNo));
 const latest=eligible[0];
 if(!latest)return displayShares([],[],year,shareClass);
 const known=filings.find(f=>f.receiptNo===latest.receiptNo);
 return displayShares(eligible,[{receiptNo:latest.receiptNo,fiscalYear:latest.fiscalYear,periodEndDate:latest.periodEndDate,receiptDate:known?.receiptDate??latest.collectedAt}],latest.fiscalYear,shareClass);
}
