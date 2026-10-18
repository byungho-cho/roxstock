import type {DartShareSnapshot} from '../generated/prisma/index.js';
export type ShareRow={stockKind:string;shareClass:string;issuedShares:string|null;treasuryShares:string|null;outstandingShares:string|null;periodEndDate:string};
export type PeriodShares={outstanding:string|null;preferred:boolean;receiptNo:string;collectedAt?:string;issuedShares?:string|null;treasuryShares?:string|null;rows?:ShareRow[];notesEvidence?:{method:'DART_PUBLIC_NOTES_OUTSTANDING_RECONCILED'|'DART_PUBLIC_SHARE_TABLE_RECONCILED';sourceUrl:string;contentSha256:string;periodEnd:string}};
export function reviewedSharesMatch(shares:PeriodShares|undefined,f:{receiptNo:string;periodEndDate:Date}){
 const evidence=shares?.notesEvidence,end=f.periodEndDate.toISOString().slice(0,10);
 if(!evidence||shares?.receiptNo!==f.receiptNo||evidence.periodEnd!==end||!['DART_PUBLIC_NOTES_OUTSTANDING_RECONCILED','DART_PUBLIC_SHARE_TABLE_RECONCILED'].includes(evidence.method)||!(/^[a-f0-9]{64}$/).test(evidence.contentSha256)||!shares.rows?.length||shares.rows.some(r=>r.periodEndDate!==end))return false;
 try{const url=new URL(evidence.sourceUrl);return url.origin==='https://dart.fss.or.kr'&&url.pathname==='/report/viewer.do'&&url.searchParams.get('rcpNo')===f.receiptNo&&bookValueShares(shares,f.receiptNo)!==null;}catch{return false;}
}
export function shareClassOf(stockKind:string){const kind=stockKind.replace(/\s/g,'');if(kind==='합계')return 'TOTAL';if(kind.includes('보통주')&&!kind.includes('우선'))return 'COMMON';if(kind.includes('우선')&&!kind.includes('보통'))return 'PREFERRED';return 'OTHER';}
/** A valid source's explicit null is not a missing extraction field in the legacy cache. */
export function completeShares(shares:PeriodShares|undefined,receiptNo:string){return shares?.receiptNo===receiptNo&&!!shares.rows?.some(r=>r.shareClass==='COMMON'&&r.issuedShares!==null&&r.treasuryShares!==null&&r.outstandingShares!==null)&&shares.rows.every(r=>['issuedShares','treasuryShares','outstandingShares'].every(key=>Object.prototype.hasOwnProperty.call(r,key)));}
/** A reviewed notes denominator is sufficient for valuation, even when issued shares are unknown. */
export function sufficientPeriodShares(shares:PeriodShares|undefined,f:{receiptNo:string;periodEndDate:Date}){return completeShares(shares,f.receiptNo)||reviewedSharesMatch(shares,f);}
/** Period-end BPS uses period-end quantities, independently of later EPS restatements. */
export function periodEndBookShares(shares:PeriodShares|undefined,f:{receiptNo:string;periodEndDate:Date}){
 const book=bookValueShares(shares,f.receiptNo),rows=shares?.rows,end=f.periodEndDate.toISOString().slice(0,10);
 if(!book||!rows?.length||rows.some(r=>r.periodEndDate!==end))return null;
 if(book.referenceOnly)return book;
 const common=rows.filter(r=>r.shareClass==='COMMON'),total=rows.filter(r=>r.shareClass==='TOTAL');
 if(common.length!==1||common[0]!.outstandingShares!==book.count||total.length>1||total.some(r=>r.outstandingShares!==book.count))return null;
 if(rows.some(r=>!['COMMON','TOTAL'].includes(r.shareClass)&&(r.outstandingShares!=null&&r.outstandingShares!=='0'||r.outstandingShares==null&&r.issuedShares!=null&&r.issuedShares!=='0')))return null;
 return book;
}
/** Pick one exact filing basis; never fill individual fields from another receipt or current fundamentals. */
export function displayShares(rows:DartShareSnapshot[],filings:{receiptNo:string;fiscalYear:number;periodEndDate:Date;isWithdrawn?:boolean;receiptDate:Date}[],year:number,shareClass='COMMON',quarter?:number|null){
 const matches=filings.filter(f=>f.fiscalYear===year&&!f.isWithdrawn&&(!quarter||f.periodEndDate.getUTCMonth()===quarter*3-1)).sort((a,b)=>b.periodEndDate.getTime()-a.periodEndDate.getTime()||b.receiptDate.getTime()-a.receiptDate.getTime()||b.receiptNo.localeCompare(a.receiptNo));
 const filing=matches[0],candidates=filing?rows.filter(r=>r.receiptNo===filing.receiptNo&&r.shareClass===shareClass):[];const row=candidates.length===1?candidates[0]:undefined;
 const issuedShares=row?.issuedShares?.toString()??null,outstandingShares=row?.outstandingShares?.toString()??null;
 let treasuryShares=row?.treasuryShares?.toString()??null;
 const treasuryCalculated=row?.shareClass==='COMMON'&&treasuryShares===null&&issuedShares!==null&&outstandingShares!==null&&BigInt(issuedShares)>=BigInt(outstandingShares);
 if(treasuryCalculated)treasuryShares=(BigInt(issuedShares!)-BigInt(outstandingShares!)).toString();
 return {issuedShares,treasuryShares,outstandingShares,shareBasis:row?{receiptNo:row.receiptNo,stockKind:row.stockKind,shareClass:row.shareClass,fiscalYear:row.fiscalYear,reportCode:row.reportCode,periodEndDate:row.periodEndDate.toISOString().slice(0,10),collectedAt:row.collectedAt.toISOString(),treasuryCalculated}:null};
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
/** A combined-class book value is a reference ratio, never an ordinary-share RIM denominator. */
export function bookValueShares(shares:PeriodShares|undefined,receiptNo:string){
 if(shares?.receiptNo!==receiptNo)return null;
 const positive=(v:string|null|undefined)=>typeof v==='string'&&/^\d+$/.test(v)&&BigInt(v)>0n;
 const disclosed=shares.rows??[],totals=disclosed.filter(r=>r.shareClass==='TOTAL'),voting=disclosed.filter(r=>r.shareClass!=='TOTAL');
 // Voting rights do not establish an ordinary-share class. A reconciled disclosed
 // grand total can still support an explicitly combined-class reference ratio.
 if(totals.length===1&&positive(totals[0]!.outstandingShares)&&voting.length>0&&voting.every(r=>/^의결권(?:있는|없는)주식$/.test(r.stockKind.replace(/\s/g,'')))){
  const complete=voting.every(r=>r.outstandingShares!=null&&/^\d+$/.test(r.outstandingShares)||r.outstandingShares==null&&(r.issuedShares==null||r.issuedShares==='0')&&(r.treasuryShares==null||r.treasuryShares==='0'));
  const sum=complete?voting.reduce((n,r)=>n+BigInt(r.outstandingShares??'0'),0n):0n;
  if(complete&&sum>0n&&sum.toString()===totals[0]!.outstandingShares)return {count:sum.toString(),referenceOnly:true};
 }
 if(!shares.preferred)return positive(shares.outstanding)?{count:shares.outstanding!,referenceOnly:false}:null;
 const rows=shares.rows??[],common=rows.filter(r=>r.shareClass==='COMMON'),total=rows.filter(r=>r.shareClass==='TOTAL');
 if(!positive(shares.outstanding))return null;
 if(common.length!==1||total.length!==1||common[0]!.outstandingShares!==shares.outstanding||!rows.some(r=>r.shareClass==='PREFERRED'))return null;
 const classes=rows.filter(r=>r.shareClass!=='TOTAL');
 if(classes.some(r=>!['COMMON','PREFERRED'].includes(r.shareClass)||r.outstandingShares==null||!/^\d+$/.test(r.outstandingShares)))return null;
 const sum=classes.reduce((n,r)=>n+BigInt(r.outstandingShares!),0n);
 if(sum<=0n||sum.toString()!==total[0]!.outstandingShares)return null;
 return {count:sum.toString(),referenceOnly:true};
}
