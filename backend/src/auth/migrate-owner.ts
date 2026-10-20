import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {prisma} from '@roxstock/shared/lib/prisma';
const personalTables=['accounts','buy_trades','sell_trades','cash_transactions','dividends','daily_account_snapshots','daily_position_snapshots','account_watchlist_items','watchlist_items','trade_requests','compound_growth_plans','compound_growth_goals','account_profit_revisions','investment_year_aggregates'];
async function audit(){
 const rows:Record<string,{count:number;sha256:string}>={};
 for(const table of personalTables){
  const columns=await prisma.$queryRawUnsafe<{COLUMN_NAME:string}[]>('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',table);
  const fields=columns.map(c=>c.COLUMN_NAME).filter(c=>c!=='user_id');
  if(!fields.length)throw Error('AUDIT_TABLE_MISSING');
  const data=await prisma.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT ${fields.map(f=>'`'+f+'`').join(',')} FROM \`${table}\` ORDER BY ${fields.includes('id')?'id':fields.includes('account_id')?'account_id':fields.map(f=>'`'+f+'`').join(',')}`);
  const sha256=createHash('sha256').update(JSON.stringify(data,(_key,v)=>typeof v==='bigint'?v.toString():v)).digest('hex');
  rows[table]={count:data.length,sha256};
 }
 return rows;
}
/** Run during a write-maintenance boundary, after a verified fresh backup. Never sends mail. */
export async function migrateOwner(outputDirectory:string){
 const target=new URL(process.env.DATABASE_URL!);
 if(!['127.0.0.1','localhost'].includes(target.hostname)&&process.env.AUTH_MIGRATION_MAINTENANCE!=='confirmed')throw Error('MAINTENANCE_REQUIRED');
 if(!process.env.AUTH_MIGRATION_BACKUP_ID)throw Error('VERIFIED_BACKUP_ID_REQUIRED');
 await mkdir(outputDirectory,{recursive:true,mode:0o700});
 const before=await audit();await writeFile(resolve(outputDirectory,'owner-before.json'),JSON.stringify(before,null,2),{mode:0o600,flag:'wx'});
 const address=process.env.AUTH_LEGACY_OWNER_EMAIL?.trim().toLowerCase();
 if(!address||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('PRIVATE_LEGACY_OWNER_EMAIL_REQUIRED');
 await prisma.$transaction(async tx=>{
  const user=await tx.authUser.upsert({where:{email:address},create:{email:address,role:'ADMIN',verifiedAt:new Date(),legacyKey:'legacy'},update:{legacyKey:'legacy'}});
  // Ownership metadata must not change financial data or original account timestamps.
  await tx.$executeRaw`UPDATE accounts SET user_id=${user.id} WHERE user_id IS NULL`;
  await tx.$executeRaw`UPDATE watchlist_items SET user_id=${user.id} WHERE user_id IS NULL`;
  if(await tx.account.count({where:{userId:null}}))throw Error('UNASSIGNED_ACCOUNTS');
 },{isolationLevel:'Serializable'});
 const after=await audit();
 await writeFile(resolve(outputDirectory,'owner-after.json'),JSON.stringify(after,null,2),{mode:0o600,flag:'wx'});
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('PERSONAL_DATA_CHANGED');
 return {tablesVerified:personalTables.length,unchanged:true,unassignedAccounts:0,backupId:process.env.AUTH_MIGRATION_BACKUP_ID};
}
if(process.argv.includes('--apply')){
 const directory=process.env.AUTH_MIGRATION_AUDIT_DIRECTORY;if(!directory)throw Error('PRIVATE_AUDIT_DIRECTORY_REQUIRED');
 migrateOwner(directory).then(result=>console.log(JSON.stringify(result))).finally(()=>prisma.$disconnect());
}
