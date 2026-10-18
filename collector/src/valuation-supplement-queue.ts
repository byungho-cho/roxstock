import {createHash} from 'node:crypto';
import {Prisma,type PrismaClient,type ValuationSupplementTask} from '@roxstock/shared/prisma';
import {getSeoulClock} from '@roxstock/shared/collection/time';

export const supplementLimits={page:100,pages:2,scanMs:20_000,batch:10,cycleMs:240_000,daily:200,retryMs:86_400_000,leaseMs:90_000,policy:'period-v3-historical-evidence'} as const;
type Candidate={duration_review?:number;id:bigint;security_id:bigint;fiscal_year:number;period_type:string;receipt_no:string;collected_at:Date;normalization_version:number;symbol:string;collection_revision:number;code_revision:number;prior_id:bigint|null;prior_at:Date|null;prior_equity?:string|null;prior_basis?:string;basis_version?:string;valuation_at:Date|null;retry_at:Date|null;corp_code:string|null;needed:number;unsupported:number;priority:number};
export const supplementSourceVersion=(row:Candidate)=>createHash('sha256').update([supplementLimits.policy,row.id,row.receipt_no,row.collected_at.toISOString(),row.normalization_version,row.symbol,row.collection_revision,row.code_revision,row.prior_id,row.prior_at?.toISOString(),row.prior_equity,row.prior_basis,row.basis_version,Boolean(row.unsupported),row.corp_code].join(':')+(row.duration_review?':fiscal-duration-v1':'')).digest('hex');
/** Only computed flags and keys leave SQL. Financial JSON never crosses the candidate boundary. */
export async function candidateRows(db:PrismaClient,ids:bigint[],year:number){
 if(!ids.length)return [];
 const missingAccounts=Prisma.join([['revenue_ytd','revenue'],['net_income_ytd','netIncome'],['total_equity','totalEquity'],['total_assets','totalAssets'],['total_liabilities','totalLiabilities']].map(([column,key])=>Prisma.sql`(${Prisma.raw('f.'+column)} IS NULL AND COALESCE(JSON_EXTRACT(v.supplemental,${'$.accounts.sources.'+key+'.amount'}),'null')='null' AND COALESCE(JSON_EXTRACT(v.supplemental,${'$.accounts.sources.'+key+'.ytdAmount'}),'null')='null')`),' OR ');
 return db.$queryRaw<Candidate[]>`SELECT f.id,f.security_id,(JSON_EXTRACT(f.source_validation,'$.periodResolution') IS NOT NULL) AS duration_review,f.fiscal_year,f.period_type,f.receipt_no,f.collected_at,f.normalization_version,
 s.symbol,s.collection_revision,s.code_revision,v.updated_at AS valuation_at,v.next_attempt_at AS retry_at,m.corp_code,
 p.id AS prior_id,p.collected_at AS prior_at,CAST(p.total_equity AS CHAR) AS prior_equity,
 MD5(CONCAT_WS('|',p.fs_division,p.normalization_version,p.receipt_no,JSON_EXTRACT(p.account_sources,'$.parentEquity.amount'),JSON_EXTRACT(pv.supplemental,'$.accounts.receiptNo'),JSON_EXTRACT(pv.supplemental,'$.accounts.fsDivision'),JSON_EXTRACT(pv.supplemental,'$.accounts.sources.totalEquity.amount'),JSON_EXTRACT(pv.supplemental,'$.accounts.sources.totalEquity.ytdAmount'),JSON_EXTRACT(pv.supplemental,'$.accounts.sources.parentEquity.amount'))) AS prior_basis,
 MD5(CONCAT_WS('|',f.fs_division,f.period_end_date,f.receipt_date,COALESCE(CAST(f.revenue_ytd AS CHAR),'NULL'),COALESCE(CAST(f.net_income_ytd AS CHAR),'NULL'),COALESCE(CAST(f.total_equity AS CHAR),'NULL'),COALESCE(CAST(f.total_assets AS CHAR),'NULL'),COALESCE(CAST(f.total_liabilities AS CHAR),'NULL'))) AS basis_version,
 (v.security_id IS NULL OR
   (JSON_EXTRACT(f.source_validation,'$.periodResolution') IS NOT NULL AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.supplemental,'$.fiscalDuration.receiptNo')),'')<>f.receipt_no) OR
   (COALESCE(JSON_EXTRACT(v.values,'$.eps'),'null')='null') OR
   (COALESCE(JSON_EXTRACT(v.values,'$.bps'),'null')='null') OR
   (COALESCE(JSON_EXTRACT(v.values,'$.roe'),'null')='null') OR
   (COALESCE(JSON_EXTRACT(v.values,'$.per'),'null')='null' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(v.values,'$.eps')) AS DECIMAL(30,10))>0) OR
   (COALESCE(JSON_EXTRACT(v.values,'$.pbr'),'null')='null' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(v.values,'$.bps')) AS DECIMAL(30,10))>0) OR
   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.supplemental,'$.shares.receiptNo')),'')<>f.receipt_no OR
   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.supplemental,'$.accounts.receiptNo')),'')<>f.receipt_no OR
   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(v.supplemental,'$.accounts.fsDivision')),'')<>f.fs_division OR
   (${missingAccounts}) OR
   NOT EXISTS(SELECT 1 FROM JSON_TABLE(COALESCE(JSON_EXTRACT(v.supplemental,'$.shares.rows'),'[]'),'$[*]' COLUMNS (share_class VARCHAR(16) PATH '$.shareClass',issued VARCHAR(40) PATH '$.issuedShares',treasury VARCHAR(40) PATH '$.treasuryShares',outstanding VARCHAR(40) PATH '$.outstandingShares')) j WHERE j.share_class='COMMON' AND j.issued IS NOT NULL AND j.treasury IS NOT NULL AND j.outstanding IS NOT NULL)) AS needed,
 (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(f.source_validation,'$.currency')),'KRW') NOT IN ('KRW','원') OR f.fs_division NOT IN ('CFS','OFS')) AS unsupported,
 IF(EXISTS(SELECT 1 FROM account_watchlist_items w JOIN accounts a ON a.id=w.account_id AND a.is_active=1 WHERE w.security_id=s.id AND w.list_type IN ('HOLDING','WATCHLIST')),0,1) AS priority
 FROM dart_financial_filings f JOIN securities s ON s.id=f.security_id
 LEFT JOIN period_valuations v ON v.security_id=f.security_id AND v.fiscal_year=f.fiscal_year AND v.period_type=f.period_type AND (s.code_revision=0 AND v.collection_symbol IS NULL OR v.collection_symbol=s.symbol)
 LEFT JOIN dart_corp_mappings m ON m.security_id=s.id
 LEFT JOIN dart_financial_filings p ON p.id=(SELECT p1.id FROM dart_financial_filings p1 WHERE p1.security_id=f.security_id AND p1.fiscal_year=f.fiscal_year-1 AND p1.period_type='ANNUAL' AND p1.is_withdrawn=0 AND (s.code_revision=0 AND p1.collection_symbol IS NULL OR p1.collection_symbol=s.symbol) ORDER BY p1.receipt_date DESC,p1.collected_at DESC,p1.receipt_no DESC LIMIT 1)
 LEFT JOIN period_valuations pv ON pv.security_id=f.security_id AND pv.fiscal_year=f.fiscal_year-1 AND pv.period_type='ANNUAL' AND (s.code_revision=0 AND pv.collection_symbol IS NULL OR pv.collection_symbol=s.symbol)
 WHERE f.id IN (${Prisma.join(ids)}) AND f.is_withdrawn=0 AND f.fiscal_year BETWEEN 2015 AND ${year} AND f.period_type IN ('ANNUAL','Q1','Q2','Q3') AND (f.period_type='ANNUAL' OR f.fiscal_year>=2020)
 AND s.is_active=1 AND s.security_type='STOCK' AND s.collection_excluded=0 AND s.symbol NOT LIKE 'Z99%'
 AND (s.excluded_features IS NULL OR JSON_CONTAINS(s.excluded_features,JSON_QUOTE('valuation'))=0)
 AND (s.code_revision=0 AND f.collection_symbol IS NULL OR f.collection_symbol=s.symbol)
 AND f.id=(SELECT f1.id FROM dart_financial_filings f1 WHERE f1.security_id=f.security_id AND f1.fiscal_year=f.fiscal_year AND f1.period_type=f.period_type AND f1.is_withdrawn=0 AND (s.code_revision=0 AND f1.collection_symbol IS NULL OR f1.collection_symbol=s.symbol) ORDER BY f1.receipt_date DESC,f1.collected_at DESC,f1.receipt_no DESC LIMIT 1)`;
}
const sameTime=(a:Date|null,b:Date|null)=>a?.getTime()===b?.getTime();
export async function registerCandidate(db:PrismaClient,row:Candidate,now:Date){
 const sourceVersion=supplementSourceVersion(row),where={securityId_fiscalYear_periodType_kind:{securityId:row.security_id,fiscalYear:row.fiscal_year,periodType:row.period_type,kind:'PERIOD'}};
 const prior=await db.valuationSupplementTask.findUnique({where,select:{id:true,status:true,lastError:true,sourceVersion:true,valuationAt:true,updatedAt:true}});
 const reenabled=prior?.status==='UNAVAILABLE'&&['INPUT_CHANGED_OR_EXCLUDED','COLLECTION_EXCLUDED'].includes(prior.lastError??'');
 if(prior?.status==='PROCESSING'||!reenabled&&prior?.sourceVersion===sourceVersion&&sameTime(prior.valuationAt,row.valuation_at))return;
 const due=prior&&prior.sourceVersion!==sourceVersion?now:row.retry_at&&row.retry_at>now?row.retry_at:now;
 const data={filingId:row.id,sourceVersion,valuationAt:row.valuation_at,status:row.unsupported?'UNAVAILABLE':row.needed?'PENDING':'COMPLETE',ready:Boolean(row.needed&&!row.unsupported),priority:row.priority,attempts:0,nextAttemptAt:due,ownerToken:null,leaseUntil:null,heartbeatAt:null,startedAt:null,finishedAt:row.unsupported||!row.needed?now:null,lastError:row.unsupported?'UNSUPPORTED_SOURCE':null,diagnostics:Prisma.DbNull};
 if(prior)await db.valuationSupplementTask.updateMany({where:{id:prior.id,status:{not:'PROCESSING'},updatedAt:prior.updatedAt},data});
 else await db.$executeRaw`INSERT IGNORE INTO valuation_supplement_tasks (security_id,fiscal_year,period_type,kind,filing_id,source_version,valuation_at,status,ready,priority,attempts,next_attempt_at,finished_at,last_error,created_at,updated_at)
 VALUES (${row.security_id},${row.fiscal_year},${row.period_type},'PERIOD',${row.id},${sourceVersion},${row.valuation_at},${data.status},${data.ready},${row.priority},0,${due},${data.finishedAt},${data.lastError},${now},${now})`;
}
export async function scanSupplementCandidates(db:PrismaClient,owner:string,now:Date,clock=()=>new Date()){
 await db.valuationSupplementScan.upsert({where:{id:1},create:{id:1},update:{}});
 const acquired=await db.valuationSupplementScan.updateMany({where:{id:1,OR:[{leaseUntil:null},{leaseUntil:{lte:now}}]},data:{ownerToken:owner,leaseUntil:new Date(now.getTime()+60_000),heartbeatAt:now,phase:'SCANNING',scanned:0}});
 if(!acquired.count)return 0;
 let scanned=0;const deadline=clock().getTime()+supplementLimits.scanMs;
 try{
  const state=await db.valuationSupplementScan.findUniqueOrThrow({where:{id:1},select:{cursor:true,upperId:true}});
  let cursor=state.cursor,upperId=state.upperId;
  if(!upperId){upperId=BigInt(String((await db.$queryRaw<Array<{upper_id:bigint}>>`SELECT COALESCE(MAX(id),0) AS upper_id FROM dart_financial_filings`)[0]!.upper_id));await db.valuationSupplementScan.updateMany({where:{id:1,ownerToken:owner},data:{upperId}});}
  for(let page=0;page<supplementLimits.pages&&clock().getTime()<deadline;page++){
   const keys=await db.$queryRaw<Array<{id:bigint}>>`SELECT id FROM dart_financial_filings WHERE id>${cursor} AND id<=${upperId} ORDER BY id ASC LIMIT ${supplementLimits.page}`;
   if(!keys.length){cursor=0n;await db.valuationSupplementScan.updateMany({where:{id:1,ownerToken:owner},data:{cursor,upperId:0n}});break;}
   for(const row of await candidateRows(db,keys.map(k=>k.id),Number(getSeoulClock(now).dateKey.slice(0,4)))){if(clock().getTime()>=deadline)return scanned;await registerCandidate(db,row,now);}
   scanned+=keys.length;cursor=keys[keys.length-1]!.id;
   const changed=await db.valuationSupplementScan.updateMany({where:{id:1,ownerToken:owner,leaseUntil:{gt:clock()}},data:{cursor,scanned,heartbeatAt:clock(),leaseUntil:new Date(clock().getTime()+60_000)}});
   if(!changed.count)break;
  }
  return scanned;
 }finally{await db.valuationSupplementScan.updateMany({where:{id:1,ownerToken:owner},data:{phase:'IDLE',ownerToken:null,leaseUntil:null,heartbeatAt:clock(),scanned}});}
}
export const budgetDay=(now:Date)=>new Date(getSeoulClock(now).dateKey+'T00:00:00Z');
export async function recoverSupplementTasks(db:PrismaClient,now:Date){
 // Never removes a common execution lock. Expired work is independently fenced on both leases.
 const expired=await db.valuationSupplementTask.findMany({where:{status:'PROCESSING',leaseUntil:{lte:now}},orderBy:[{leaseUntil:'asc'},{id:'asc'}],take:10,select:{id:true,ownerToken:true,leaseUntil:true}});
 for(const row of expired)await db.valuationSupplementTask.updateMany({where:{id:row.id,status:'PROCESSING',ownerToken:row.ownerToken,leaseUntil:row.leaseUntil},data:{status:'RETRY',ready:true,ownerToken:null,leaseUntil:null,nextAttemptAt:now,finishedAt:now,lastError:'WORKER_LEASE_EXPIRED'}});
 return expired.length;
}
export async function dueSupplementIds(db:PrismaClient,now:Date,limit:number){
 return db.valuationSupplementTask.findMany({where:{ready:true,nextAttemptAt:{lte:now},OR:[{periodType:'ANNUAL'},{fiscalYear:{gte:2020}}]},orderBy:[{nextAttemptAt:'asc'},{priority:'asc'},{id:'asc'}],take:Math.min(10,limit),select:{id:true}});
}
/** Reserving the daily slot and claiming one period share a short transaction; no provider I/O. */
export async function claimSupplement(db:PrismaClient,id:bigint,owner:string,now:Date):Promise<ValuationSupplementTask|null>{
 return db.$transaction(async tx=>{
  const day=budgetDay(now);
  // Native locking insert is the first statement: Prisma emulated upsert can establish a
  // stale repeatable-read snapshot and MariaDB then rejects FOR UPDATE with error 1020.
  await tx.$executeRaw`INSERT INTO valuation_supplement_budget (day,reserved) VALUES (${day},0) ON DUPLICATE KEY UPDATE reserved=reserved`;
  const budgets=await tx.$queryRaw<Array<{reserved:number}>>`SELECT reserved FROM valuation_supplement_budget WHERE day=${day} FOR UPDATE`;
  if((budgets[0]?.reserved??supplementLimits.daily)>=supplementLimits.daily)return null;
  const claimed=await tx.valuationSupplementTask.updateMany({where:{id,ready:true,status:{in:['PENDING','RETRY']},nextAttemptAt:{lte:now}},data:{status:'PROCESSING',ready:false,ownerToken:owner,leaseUntil:new Date(now.getTime()+supplementLimits.leaseMs),heartbeatAt:now,startedAt:now,finishedAt:null,attempts:{increment:1}}});
  if(!claimed.count)return null;
  await tx.valuationSupplementBudget.update({where:{day},data:{reserved:{increment:1}}});
  return tx.valuationSupplementTask.findUnique({where:{id}});
 });
}
export async function finishSupplement(db:PrismaClient,task:ValuationSupplementTask,owner:string,data:{status:string;lastError?:string|null;diagnostics?:Prisma.InputJsonValue;valuationAt?:Date|null;nextAttemptAt?:Date},now:Date){
 return db.$transaction(tx=>tx.valuationSupplementTask.updateMany({where:{id:task.id,status:'PROCESSING',ownerToken:owner,leaseUntil:{gt:now}},data:{...data,ready:data.status==='RETRY'||data.status==='PENDING',finishedAt:now,ownerToken:null,leaseUntil:null,nextAttemptAt:data.nextAttemptAt??now}}));
}
