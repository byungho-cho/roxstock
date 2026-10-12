import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {PrismaClient} from '../src/generated/prisma/index.js';
test('phase23 actual migration preserves legacy zero/code/data and restores a verified old-schema backup',async()=>{
 assert.match(process.env.DATABASE_URL??'',/@(?:127\.0\.0\.1|localhost):/,'Isolated CI only');
 const container=process.env.PHASE23_DB_CONTAINER;assert.ok(container,'CI MariaDB service container required');
 const name='roxstock_phase23_restore_test',url=`mysql://root:root@127.0.0.1:3306/${name}`,db=new PrismaClient({datasourceUrl:url});
 const admin=new PrismaClient({datasourceUrl:'mysql://root:root@127.0.0.1:3306/mysql'}),temporary=mkdtempSync(join(tmpdir(),'roxstock-phase23-migration-')),migration='20261012120000_phase23_security_management';
 const schema=resolve('database/prisma/schema.prisma'),source=resolve('database/prisma/migrations'),target=join(temporary,'migrations');
 const deploy=(path:string)=>execFileSync('npx',['prisma','migrate','deploy','--schema',path],{env:{...process.env,DATABASE_URL:url},encoding:'utf8',stdio:'pipe'});
 const values=async()=>{const s=await db.$queryRaw<any[]>`SELECT id,symbol FROM securities WHERE id=23`;const p=await db.$queryRaw<any[]>`SELECT current_price,previous_close_price FROM market_prices WHERE security_id=23`;const f=await db.$queryRaw<any[]>`SELECT net_income,total_equity FROM financial_statements WHERE security_id=23`;return {id:String(s[0].id),symbol:s[0].symbol,price:String(p[0].current_price),previous:String(p[0].previous_close_price),income:String(f[0].net_income),equity:String(f[0].total_equity)};};
 try{
  await admin.$executeRawUnsafe(`CREATE DATABASE ${name}`);cpSync(source,target,{recursive:true});rmSync(join(target,migration),{recursive:true});writeFileSync(join(temporary,'schema.prisma'),readFileSync(schema));deploy(join(temporary,'schema.prisma'));
  await db.$executeRaw`INSERT INTO securities (id,symbol,name,market_type,security_type,is_active,created_at,updated_at) VALUES (23,'000023','Phase23 legacy preservation','KOSPI','STOCK',TRUE,NOW(3),NOW(3))`;
  await db.$executeRaw`INSERT INTO market_prices (security_id,current_price,previous_close_price,price_updated_at,created_at,updated_at) VALUES(23,1234,1200,NOW(3),NOW(3),NOW(3))`;
  await db.$executeRaw`INSERT INTO financial_statements (security_id,fiscal_year,period_type,period_end_date,net_income,total_equity,created_at,updated_at) VALUES(23,2025,'ANNUAL','2025-12-31',0,1000000,NOW(3),NOW(3))`;
  const original=await values();
  // Fixture root password belongs only to this isolated CI service, never production.
  const backup=gzipSync(execFileSync('docker',['exec','-e','MYSQL_PWD=root',container,'mariadb-dump','-uroot','--single-transaction','--quick','--databases',name],{stdio:['pipe','pipe','pipe']}));
  const checksum=createHash('sha256').update(backup).digest('hex');assert.equal(checksum.length,64);const sql=gunzipSync(backup);assert.ok(sql.includes(Buffer.from('000023')));
  deploy(schema);assert.deepEqual(await values(),original);
  const security=(await db.security.findUnique({where:{id:23n}}))!;assert.equal(security.registrationSource,'UNKNOWN');assert.equal(security.collectionExcluded,false);assert.equal((await db.marketPrice.findUnique({where:{securityId:23n}}))!.collectionSymbol,'000023');
  await assert.rejects(db.security.create({data:{symbol:'000023',name:'Duplicate different market',marketType:'OTHER'}}),{code:'P2002'});
  deploy(schema);assert.deepEqual(await values(),original);
  await db.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE ${name}`);
  execFileSync('docker',['exec','-i','-e','MYSQL_PWD=root',container,'mariadb','-uroot'],{input:sql,stdio:['pipe','pipe','pipe']});
  assert.deepEqual(await values(),original);
  const columns=await db.$queryRaw<any[]>`SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=${name} AND table_name='securities' AND column_name='registration_source'`;assert.equal(Number(columns[0].total),0);
  deploy(schema);assert.deepEqual(await values(),original);
  console.log(JSON.stringify({phase:23,actualDB:true,legacyValues:original,backupBytes:backup.length,backupSHA256:checksum,restoreOldSchema:true,reapplyIdempotent:true,originInference:false,duplicateBlocked:true}));
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name}`);await admin.$disconnect();rmSync(temporary,{recursive:true,force:true});}
});
