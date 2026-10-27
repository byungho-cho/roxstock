import {PrismaClient} from '../shared/dist/generated/prisma/index.js';
import {PrismaDartRepository} from '../collector/dist/dart-repository.js';
import {withFinancialLease,assertFinancialLease} from '../shared/dist/collection/financial-lease.js';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const option=k=>process.argv.find(a=>a.startsWith(k+'='))?.slice(k.length+1);
const from=option('--from'),directory=option('--directory'),apply=process.argv.includes('--apply');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
if(!from||!/^\d{8}$/.test(from)||from>today||new Date(from.slice(0,4)+'-'+from.slice(4,6)+'-'+from.slice(6,8)+'T00:00:00Z').toISOString().slice(0,10).replaceAll('-','')!==from)throw Error('VALID_START_DATE_REQUIRED');
if(apply&&!directory)throw Error('PRIVATE_BACKUP_DIRECTORY_REQUIRED');
const db=new PrismaClient(),owner=randomUUID(),repo=new PrismaDartRepository(db),json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
let locked=false;
try{
 const plan=async tx=>({cursor:await tx.securityDataCursor.findUnique({where:{id:1}}),receipts:await tx.securityDataReceipt.findMany({where:{status:{in:['PENDING','RETRY','PROCESSING']},disclosedDate:{lt:from}},orderBy:{receiptNo:'asc'}})});
 const summary=p=>({from,apply,excluded:p.receipts.length,byStatus:p.receipts.reduce((a,r)=>({...a,[r.status]:(a[r.status]??0)+1}),{}),previousFrom:p.cursor?.fromDate??null});
 if(!apply){console.log(json(summary(await plan(db))));}
 else{
  locked=await repo.acquireLock(owner,300);if(!locked)throw Error('FINANCIAL_LEASE_BUSY');
  await mkdir(directory,{recursive:true,mode:0o700});
  await withFinancialLease(owner,()=>db.$transaction(async tx=>{
   await assertFinancialLease(tx);
   await tx.$queryRawUnsafe('SELECT id FROM security_data_cursor WHERE id=1 FOR UPDATE');
   const p=await plan(tx),at=new Date();
   await writeFile(resolve(directory,'before.json'),json(p),{mode:0o600,flag:'wx'});
   for(const r of p.receipts)await tx.securityDataReceipt.update({where:{receiptNo:r.receiptNo},data:{status:'SKIPPED',result:{outcome:'SKIPPED',reason:'수집 시작일 이전 공시 · 과거 자료 수집 제외',coverageFrom:from,excludedAt:at.toISOString(),previousStatus:r.status,previousResult:r.result}}});
   const data={coverageFrom:from,fromDate:from,throughDate:today,page:1,failures:0,nextCheckAt:at,lastCompletedAt:null};
   await tx.securityDataCursor.upsert({where:{id:1},create:{id:1,...data},update:data});
   await writeFile(resolve(directory,'transaction-plan.json'),json(summary(p)),{mode:0o600,flag:'wx'});
  },{timeout:120000}));
  const result={done:true,from,apply,remainingHistoricalPending:(await plan(db)).receipts.length,cursor:await db.securityDataCursor.findUnique({where:{id:1}})};
  await writeFile(resolve(directory,'result.json'),json(result),{mode:0o600,flag:'wx'});console.log(json(result));
 }
}finally{if(locked)await repo.releaseLock(owner);await db.$disconnect();}
