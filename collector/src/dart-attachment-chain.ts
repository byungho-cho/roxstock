import {createHash} from 'node:crypto';
import type {DartReport,DartReportSelection} from '@roxstock/shared/collection/dart-types';

/** Official report-family navigation links a financial-bearing report to a later attachment.
 * Neither a newer receipt nor an attachment's title proves the relationship by itself. */
export function publicAttachmentChain(report:DartReport,corpCode:string,returnedReceiptNo:string,sourceUrl:string,html:string):DartReportSelection['attachmentChain']|undefined {
 const context=report.selection;if(!context||context.periodError||html.length>2_000_000)return;
 let url:URL;try{url=new URL(sourceUrl);}catch{return;}
 if(url.origin!=='https://dart.fss.or.kr'||url.pathname!=='/dsaf001/main.do'||url.searchParams.get('rcpNo')!==report.receiptNo)return;
 const issuer=/openCorpInfo(?:New)?\s*\(\s*['"](\d{8})['"]/.exec(html)?.[1];
 if(issuer!==corpCode)return;
 const family=[...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)].filter(m=>/\bid=["']family["']/.test(m[1]!));
 if(family.length!==1)return;
 const options=[...family[0]![2]!.matchAll(/<option\b[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi)];
 const linked=options.some(m=>{
  const params=new URLSearchParams(m[1]!.replaceAll('&amp;','&'));
  return params.get('rcpNo')===returnedReceiptNo&&!params.has('dcmNo')&&/사업보고서|반기보고서|분기보고서/.test(m[2]!.replace(/<[^>]*>/g,''));
 });
 if(!linked||!html.includes('rcpNo='+report.receiptNo))return;
 const group=[...context.candidates].sort((a,b)=>a.receiptDate.localeCompare(b.receiptDate)||a.receiptNo.localeCompare(b.receiptNo));
 const source=group.find(d=>d.receiptNo===returnedReceiptNo),chosen=group.find(d=>d.receiptNo===report.receiptNo);
 if(!source||!chosen||!['ORIGINAL','CONTENT','ADDITION'].includes(source.correctionType)||chosen.correctionType!=='ATTACHMENT')return;
 if(group.some(d=>d.corpCode!==corpCode||d.reportPeriod!==source.reportPeriod||['UNKNOWN','WITHDRAWAL'].includes(d.correctionType)))return;
 const later=group.slice(group.indexOf(source)+1);
 if(!later.length||later.at(-1)?.receiptNo!==report.receiptNo||later.some(d=>!['ATTACHMENT','ADDITION'].includes(d.correctionType)))return;
 return {method:'DART_PUBLIC_REPORT_FAMILY',sourceUrl,contentSha256:createHash('sha256').update(html).digest('hex'),corpCode,reportPeriod:source.reportPeriod,selectedReceiptNo:report.receiptNo,returnedReceiptNo,sourceIsReport:true};
}

export function attachmentChainMatches(report:DartReport,corpCode:string,returnedReceiptNo:string) {
 const p=report.selection?.attachmentChain;if(!p||p.method!=='DART_PUBLIC_REPORT_FAMILY'||p.corpCode!==corpCode||p.selectedReceiptNo!==report.receiptNo||p.returnedReceiptNo!==returnedReceiptNo||p.reportPeriod!==report.selection?.periodEndDate.slice(0,7)||!p.sourceIsReport||!/^[a-f0-9]{64}$/.test(p.contentSha256))return false;
 try{const u=new URL(p.sourceUrl);return u.origin==='https://dart.fss.or.kr'&&u.pathname==='/dsaf001/main.do'&&u.searchParams.get('rcpNo')===report.receiptNo;}catch{return false;}
}
