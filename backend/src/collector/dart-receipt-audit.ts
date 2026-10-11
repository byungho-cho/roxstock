import {safeDartContext} from './dart-diagnostics.js';
import type {PrismaClient} from '../generated/prisma/index.js';
/** SELECT only; no cache refresh, API call, task reset or filing update. */
export async function auditDartReceipts(db:PrismaClient) {
 const [tasks,filings,states,usage,runs]=await Promise.all([
  db.dartBackfillTask.findMany({where:{status:'FAILED'},include:{security:{select:{symbol:true,dartCorpMapping:{select:{corpCode:true}}}}},orderBy:[{securityId:'asc'},{fiscalYear:'asc'}]}),
  db.dartFinancialFiling.findMany({select:{receiptNo:true,fiscalYear:true,reportCode:true,periodType:true,periodEndDate:true,reportName:true,sourceValidation:true,security:{select:{symbol:true}}}}),
  db.dartBackfillTask.groupBy({by:['status'],_count:{_all:true}}),
  db.dartApiDailyUsage.findFirst({orderBy:{usageDate:'desc'}}),
  db.collectorRun.findMany({where:{jobType:'dart-financial-statements',NOT:{metadata:{path:'$.phase',equals:'MANUAL'}}},orderBy:{startedAt:'desc'},take:3,select:{id:true,status:true,startedAt:true,finishedAt:true,successCount:true,failureCount:true,skippedCount:true,metadata:true}}),
 ]);
 const failed=tasks.map(t=>({taskId:String(t.id),symbol:t.security.symbol,corpCode:t.security.dartCorpMapping?.corpCode??null,
  taskFiscalYear:t.fiscalYear,reportCode:t.reportCode,period:t.periodType,errorCode:t.errorCode,
  originalCode:t.errorCode==='REVIEW_REQUIRED'?(/^([A-Z0-9_]+):/.exec(t.errorMessage??'')?.[1]??'UNKNOWN'):t.errorCode,
  attempt:t.attempts,selectedReceiptNo:t.selectedReceiptNo,
  validation:safeDartContext(t.diagnostics),classification:(t.diagnostics as {validationResult?:string}|null)?.validationResult??'LEGACY_EVIDENCE_INCOMPLETE',
  disposition:['900290','000120'].includes(t.security.symbol)&&t.fiscalYear===2024&&((t.security.symbol==='900290'&&t.reportCode==='11012')||(t.security.symbol==='000120'&&t.reportCode==='11011'))?'LIMITED_REPRESENTATIVE_CANDIDATE':'REVIEW_BEFORE_RESUMING'}));
 const periodInventory=filings.flatMap(f=>{
  const period=/\((\d{4})\.(\d{2})\)/.exec(f.reportName);
  if(!period)return [];
  const declared=new Date(Date.UTC(Number(period[1]),Number(period[2]),0)).toISOString().slice(0,10),stored=f.periodEndDate.toISOString().slice(0,10);
  return declared===stored?[]:[{symbol:f.security.symbol,receiptNo:f.receiptNo,taskFiscalYear:f.fiscalYear,reportCode:f.reportCode,period:f.periodType,storedPeriodEndDate:stored,declaredPeriodEndDate:declared,action:'NO_CHANGE_RESTORE_PLAN_REQUIRED'}];
 });
 const receipts=filings.map(f=>f.receiptNo);
 return {version:'DART_SOURCE_V2',observedAt:new Date().toISOString(),readOnly:true,apiCalls:0,
  taskStates:states.map(s=>({status:s.status,count:s._count._all})),failed,
  periodInventory,filingCount:filings.length,duplicateReceipts:receipts.length-new Set(receipts).size,
  dailyUsage:usage?{date:usage.usageDate.toISOString().slice(0,10),calls:usage.apiCallCount,errors:usage.errorCount,noData:usage.noDataCount}:null,
  recentRuns:runs.map(r=>({runId:String(r.id),status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt,success:r.successCount,failed:r.failureCount,skipped:r.skippedCount,phase:(r.metadata as {phase?:string}|null)?.phase})),
 };
}
