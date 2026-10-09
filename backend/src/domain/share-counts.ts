import type {DartShareSnapshot} from '../generated/prisma/index.js';
export type ShareRow={stockKind:string;shareClass:string;issuedShares:string|null;treasuryShares:string|null;outstandingShares:string|null;periodEndDate:string};
export type PeriodShares={outstanding:string|null;preferred:boolean;receiptNo:string;collectedAt?:string;issuedShares?:string|null;treasuryShares?:string|null;rows?:ShareRow[]};
/** A valid source's explicit null is not a missing extraction field in the legacy cache. */
export function completeShares(shares:PeriodShares|undefined,receiptNo:string){return shares?.receiptNo===receiptNo&&!!shares.rows?.some(r=>r.shareClass==='COMMON'&&r.issuedShares!==null&&r.treasuryShares!==null&&r.outstandingShares!==null)&&shares.rows.every(r=>['issuedShares','treasuryShares','outstandingShares'].every(key=>Object.prototype.hasOwnProperty.call(r,key)));}
/** Pick one exact filing basis; never fill individual fields from another receipt or current fundamentals. */
export function displayShares(rows:DartShareSnapshot[],filings:{receiptNo:string;fiscalYear:number;periodEndDate:Date;isWithdrawn?:boolean;receiptDate:Date}[],year:number,shareClass='COMMON',quarter?:number|null){
 const matches=filings.filter(f=>f.fiscalYear===year&&!f.isWithdrawn&&(!quarter||f.periodEndDate.getUTCMonth()===quarter*3-1)).sort((a,b)=>b.periodEndDate.getTime()-a.periodEndDate.getTime()||b.receiptDate.getTime()-a.receiptDate.getTime()||b.receiptNo.localeCompare(a.receiptNo));
 const filing=matches[0];const row=filing?rows.find(r=>r.receiptNo===filing.receiptNo&&r.shareClass===shareClass):undefined;
 return {issuedShares:row?.issuedShares?.toString()??null,treasuryShares:row?.treasuryShares?.toString()??null,outstandingShares:row?.outstandingShares?.toString()??null,shareBasis:row?{receiptNo:row.receiptNo,stockKind:row.stockKind,shareClass:row.shareClass,fiscalYear:row.fiscalYear,reportCode:row.reportCode,periodEndDate:row.periodEndDate.toISOString().slice(0,10),collectedAt:row.collectedAt.toISOString()}:null};
}
