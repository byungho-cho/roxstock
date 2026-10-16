import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,symlink,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {Readable,PassThrough} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {gunzipSync} from 'node:zlib';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {BackupService} from './backup-service.js';

function fakeDb(){let lock:{jobName:string;ownerToken:string;lockedUntil:Date}|null=null;return {collectorLock:{async updateMany({where,data}:any){if(!lock||where.ownerToken&&where.ownerToken!==lock.ownerToken||where.lockedUntil&&!(lock.lockedUntil<where.lockedUntil.lt))return {count:0};lock={...lock,...data};return {count:1};},async create({data}:any){if(lock)throw {code:'P2002'};lock=data;return lock;},async findUnique(){return lock;},async deleteMany({where}:any){if(lock?.ownerToken!==where.ownerToken)return {count:0};lock=null;return {count:1};}}} as unknown as PrismaClient;}
const sql='-- MariaDB dump\nCREATE TABLE proof (id INT);\nINSERT INTO proof VALUES (1);\n-- Dump completed on 2026-10-16\n';
async function temporary(work:(root:string)=>Promise<void>){const parent=tmpdir(),root=await mkdtemp(join(parent,'roxstock-backup-test-'));const previous=process.env.DATABASE_URL;process.env.DATABASE_URL='mysql://test:test@127.0.0.1:3306/isolated_test';try{await work(root);}finally{if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;if(dirname(root)!==parent)throw Error('Unexpected test cleanup root');await rm(root,{recursive:true,force:true});}}
async function settle(service:BackupService,id:string){await service.waitForIdle();return (await service.list()).items.find(r=>r.id===id);}
async function contents(stream:NodeJS.ReadableStream){const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);}

test('manual SQL and automatic gzip stream correctly; newest automatic requires exact confirmation',()=>temporary(async root=>{
 const service=new BackupService(fakeDb(),root,()=>Readable.from([sql]));
 const old=await service.start('AUTO','2026-09');assert.ok(old);assert.equal((await settle(service,old.id))?.status,'COMPLETE');
 const latest=await service.start('AUTO','2026-10');assert.ok(latest);assert.equal((await settle(service,latest.id))?.status,'COMPLETE');
 const manual=await service.start('MANUAL');assert.ok(manual);assert.equal((await settle(service,manual.id))?.status,'COMPLETE');
 assert.equal((await service.list()).items.find(r=>r.latestAutomatic)?.id,latest.id);
 const zipped=await service.download(latest.id);assert.equal(gunzipSync(await contents(zipped.stream)).toString(),sql);
 const plain=await service.download(manual.id);assert.equal((await contents(plain.stream)).toString(),sql);
 await assert.rejects(service.remove(latest.id),{code:'BACKUP_CONFIRM_LATEST'});
 await assert.rejects(service.remove(latest.id,'삭제 확인 '),{code:'BACKUP_CONFIRM_LATEST'});
 await service.remove(manual.id);await service.remove(latest.id,'삭제 확인');
 assert.equal((await service.list()).items.find(r=>r.latestAutomatic)?.id,old.id);
 assert.equal(await service.start('AUTO','2026-10'),null);
 const audit=await readFile(join(root,'audit.jsonl'),'utf8');assert.match(audit,/DOWNLOAD/);assert.doesNotMatch(audit,/INSERT INTO/);await service.close();
}));
test('cross-instance locking prevents duplicate create/delete and failed dumps are never exposed',()=>temporary(async root=>{
 const db=fakeDb(),source=new PassThrough(),a=new BackupService(db,root,()=>source),b=new BackupService(db,root,()=>Readable.from([sql]));
 const record=await a.start('MANUAL');assert.ok(record);await assert.rejects(b.start('MANUAL'),{code:'BACKUP_BUSY'});await assert.rejects(b.remove(record.id),{code:'BACKUP_BUSY'});await assert.rejects(a.download(record.id),{code:'BACKUP_NOT_COMPLETE'});
 source.end('invalid SQL');assert.equal((await settle(a,record.id))?.status,'FAILED');await assert.rejects(a.download(record.id),{code:'BACKUP_NOT_COMPLETE'});
 assert.ok(!(await readdir(root)).some(f=>f.endsWith('.sql')||f.endsWith('.partial')));await a.close();await b.close();
}));
test('only ID-owned regular files are exposed and pagination retains all records',()=>temporary(async root=>{
 const service=new BackupService(fakeDb(),root,()=>Readable.from([sql]));
 for(let i=0;i<14;i++){const r=await service.start('MANUAL');assert.ok(r);await settle(service,r.id);}
 const first=await service.list();assert.equal(first.items.length,12);assert.ok(first.nextCursor);const next=await service.list(first.nextCursor);assert.equal(next.items.length,2);assert.equal(new Set([...first.items,...next.items].map(r=>r.id)).size,14);
 await assert.rejects(service.download('../outside'),{code:'BACKUP_NOT_FOUND'});
 const selected=first.items[0]!;await rm(join(root,selected.filename));await writeFile(join(root,'outside.sql'),'private');
 try{await symlink(join(root,'outside.sql'),join(root,selected.filename));}catch(error){if(process.platform!=='win32'||(error as NodeJS.ErrnoException).code!=='EPERM')throw error;await writeFile(join(root,selected.filename),'invalid-size');}
 await assert.rejects(service.download(selected.id),{code:'BACKUP_FILE_MISSING'});
 assert.equal(await readFile(join(root,'outside.sql'),'utf8'),'private');await service.close();
}));
test('monthly KST boundary and restart catch-up create one current-month backup',()=>temporary(async root=>{
 const previous=process.env.BACKUP_AUTO_ENABLED;process.env.BACKUP_AUTO_ENABLED='true';
 const db=fakeDb(),service=new BackupService(db,root,()=>Readable.from([sql]));
 try{
  await service.scheduled(new Date('2026-10-31T19:29:00Z'));assert.equal((await service.list()).items.length,0);
  await service.scheduled(new Date('2026-10-31T19:30:00Z'));await service.waitForIdle();assert.equal((await service.list()).items.length,1);
  const restarted=new BackupService(db,root,()=>Readable.from([sql]));await restarted.scheduled(new Date('2026-11-05T00:00:00Z'));assert.equal((await restarted.list()).items.length,1);
  await restarted.scheduled(new Date('2026-12-05T00:00:00Z'));await restarted.waitForIdle();assert.equal((await restarted.list()).items.length,2);await restarted.close();
 }finally{await service.close();if(previous===undefined)delete process.env.BACKUP_AUTO_ENABLED;else process.env.BACKUP_AUTO_ENABLED=previous;}
}));
