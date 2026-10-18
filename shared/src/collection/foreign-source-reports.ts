import type {PrismaClient} from '../generated/prisma/index.js';
import {financialCurrency} from '../domain/financial-currency.js';
export const foreignHoldCode='DART_REVIEW_NON_KRW_STORAGE_UNSUPPORTED';
/** Resolve only exact historical currency holds with a currently stored verified filing.
 * Never resolve other disclosure reviews, metric warnings or generic source warnings.
 */
export async function reconcileForeignSourceReports(db:PrismaClient,after?:string){
 const rows=await db.collectionBugOccurrence.findMany({where:{resolvedAt:null,report:{feature:'dart-financial-statements',code:foreignHoldCode},...(after?{eventKey:{gt:after}}:{})},orderBy:{eventKey:'asc'},take:25});
 let resolved=0;
 for(const e of rows){
  if(e.securityId==null||e.fiscalYear==null||!['ANNUAL','Q1','Q2','Q3'].includes(e.periodType??''))continue;
  resolved+=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM collection_bug_reports WHERE id=${e.reportId!} FOR UPDATE`;
   const security=await tx.security.findUnique({where:{id:e.securityId!},select:{symbol:true,codeRevision:true}});
   const task=await tx.dartBackfillTask.findFirst({where:{securityId:e.securityId!,fiscalYear:e.fiscalYear!,periodType:e.periodType as 'ANNUAL',status:'SUCCESS'}});
   const f=await tx.dartFinancialFiling.findFirst({where:{securityId:e.securityId!,fiscalYear:e.fiscalYear!,periodType:e.periodType as 'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]});
   const proof=f?.sourceValidation as Record<string,unknown>|null;
   if(!security||!task||!f||f.collectedAt<e.observedAt||proof?.version!==2||proof.returnedReceiptNo!==f.receiptNo||proof.fsDivision!==f.fsDivision||proof.currency!==financialCurrency(f)||proof.reportPeriod!==f.periodEndDate.toISOString().slice(0,7)||task.selectedReceiptNo!==proof.selectedReceiptNo||!(f.collectionSymbol===security.symbol||security.codeRevision===0&&f.collectionSymbol==null))return 0;
   // Require stored core amounts, not only a task flag or a newly accepted request.
   if(![f.revenueYtd,f.netIncomeYtd,f.totalEquity].some(v=>v!=null))return 0;
   const changed=await tx.collectionBugOccurrence.updateMany({where:{eventKey:e.eventKey,resolvedAt:null},data:{resolvedAt:new Date(),resolution:'NATIVE_CURRENCY_SOURCE_STORED'}});
   if(!await tx.collectionBugOccurrence.count({where:{reportId:e.reportId,resolvedAt:null}}))await tx.collectionBugReport.updateMany({where:{id:e.reportId!,code:foreignHoldCode},data:{state:'RESOLVED',resolvedAt:new Date()}});
   return changed.count;
  });
 }
 return {scanned:rows.length,resolved,cursor:rows.at(-1)?.eventKey,hasNext:rows.length===25};
}
