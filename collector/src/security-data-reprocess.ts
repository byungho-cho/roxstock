import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prisma} from '@roxstock/shared/lib/prisma';
import {loadCollectorConfig} from '@roxstock/shared/collection/config';
import {runSecurityDataCollection} from './security-data-collector.js';

const stringify=(v:unknown)=>JSON.stringify(v,(_k,v)=>typeof v==='bigint'?String(v):v);
const digest=(v:unknown)=>createHash('sha256').update(stringify(v)).digest('hex');
/** Explicit receipt-only repair. Default is a read-only plan; no discovery or cursor reset. */
export async function reprocessSecurityData(args:string[]){
 const get=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
 const receipts=(get('--receipts')??'').split(',');
 if(!receipts.length||receipts.length>20||receipts.some(r=>!/^\d{14}$/.test(r))||new Set(receipts).size!==receipts.length)throw Error('EXPLICIT_RECEIPTS_REQUIRED');
 const apply=args.includes('--apply'),backupDir=get('--backup-dir');
 if(apply&&!backupDir)throw Error('PRIVATE_BACKUP_DIRECTORY_REQUIRED');
 const cursor=await prisma.securityDataCursor.findUniqueOrThrow({where:{id:1}});
 const rows=await prisma.securityDataReceipt.findMany({where:{receiptNo:{in:receipts}},orderBy:{receiptNo:'asc'}});
 if(rows.length!==receipts.length||!cursor.coverageFrom||rows.some(r=>r.disclosedDate<cursor.coverageFrom!))throw Error('RECEIPT_OUTSIDE_CURRENT_COVERAGE');
 if(rows.some(r=>r.status==='PROCESSING'))throw Error('RECEIPT_ALREADY_PROCESSING');
 const plan=rows.map(r=>({receiptNo:r.receiptNo,disclosedDate:r.disclosedDate,status:r.status,attempts:r.attempts,eligible:['FAILED','UNRESOLVED','PENDING','RETRY'].includes(r.status)}));
 if(!apply)return {mode:'PLAN',coverageFrom:cursor.coverageFrom,receipts:plan};
 if(!plan.some(r=>r.eligible))return {mode:'APPLY',status:'ALREADY_COMPLETED',receipts:plan};
 const mappings=await prisma.dartCorpMapping.findMany({where:{corpCode:{in:rows.map(r=>r.corpCode)}},select:{securityId:true}}),ids=mappings.map(r=>r.securityId);
 const capture=async()=>({receipts:await prisma.securityDataReceipt.findMany({where:{receiptNo:{in:receipts}},orderBy:{receiptNo:'asc'}}),cursor:await prisma.securityDataCursor.findUniqueOrThrow({where:{id:1}}),periods:await prisma.periodValuation.findMany({where:{securityId:{in:ids}}}),filings:await prisma.dartFinancialFiling.findMany({where:{securityId:{in:ids}}}),othersHash:digest(await prisma.securityDataReceipt.findMany({where:{receiptNo:{notIn:receipts}},orderBy:{receiptNo:'asc'}}))});
 const dir=resolve(backupDir!);await mkdir(dir,{recursive:true,mode:0o700});
 const prefix=join(dir,'receipt-reprocess-'+Date.now()),before=await capture();
 await writeFile(prefix+'-before.json',stringify(before),{mode:0o600,flag:'wx'});
 const config=loadCollectorConfig();
 const result=await runSecurityDataCollection(prisma,{apiKey:process.env.DART_API_KEY?.trim()??'',dailyCallLimit:config.dartDailyCallLimit,minDelayMs:config.dartMinDelayMs,corpRefreshHours:config.dartCorpRefreshHours},new Date(),{receiptAllowlist:receipts});
 const after=await capture();await writeFile(prefix+'-after.json',stringify(after),{mode:0o600,flag:'wx'});
 const cursorUnchanged=digest(before.cursor)===digest(after.cursor),otherReceiptsUnchanged=before.othersHash===after.othersHash;
 if(!cursorUnchanged||!otherReceiptsUnchanged)throw Error('REPROCESS_SCOPE_CHANGED_REVIEW_BACKUP');
 return {mode:'APPLY',result,cursorUnchanged,otherReceiptsUnchanged,receipts:after.receipts.map(r=>({receiptNo:r.receiptNo,status:r.status,attempts:r.attempts,result:r.result})),backupPrefix:prefix};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(stringify(await reprocessSecurityData(process.argv.slice(2))));}catch(error){console.error(error instanceof Error?error.message:'REPROCESS_FAILED');process.exitCode=1;}finally{await prisma.$disconnect();}
}
