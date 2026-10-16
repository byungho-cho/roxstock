import {constants,createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,unlink,lstat,realpath,statfs,open,readdir,appendFile} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createGzip,createGunzip} from 'node:zlib';
import {Transform,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';

export type BackupRecord={id:string;kind:'AUTO'|'MANUAL';status:'RUNNING'|'COMPLETE'|'FAILED'|'DELETED';filename:string;createdAt:string;completedAt:string|null;bytes:number|null;sha256:string|null;reason:string|null;month:string|null;deletedAt?:string};
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const err=(status:number,code:string,message:string)=>new ApiError(status,code,message);
const job='managed-db-backup';
export class BackupService{
 private owner=randomUUID();private active:Promise<void>|null=null;private stopped=false;private child:ReturnType<typeof spawn>|null=null;
 constructor(private db:PrismaClient,private directory:string,private dumpTest?:()=>NodeJS.ReadableStream){}
 private async root(){
  const root=resolve(this.directory);await mkdir(root,{recursive:true,mode:0o700});
  if((await lstat(root)).isSymbolicLink()||await realpath(root)!==root)throw err(500,'BACKUP_DIRECTORY','백업 저장 위치를 확인해 주세요.');
  return root;
 }
 private async metadata(id:string){if(!validId(id))throw err(404,'BACKUP_NOT_FOUND','백업을 찾을 수 없습니다.');return join(await this.root(),id+'.json');}
 private async save(record:BackupRecord){const file=await this.metadata(record.id),temp=file+'.'+this.owner+'.partial';await writeFile(temp,JSON.stringify(record),{mode:0o600,flag:'wx'});await rename(temp,file);}
 private async record(id:string){try{const file=await this.metadata(id);if((await lstat(file)).isSymbolicLink())throw Error();const record=JSON.parse(await readFile(file,'utf8')) as BackupRecord;
  if(record.id!==id||!['AUTO','MANUAL'].includes(record.kind)||!['RUNNING','COMPLETE','FAILED','DELETED'].includes(record.status)||!new RegExp(`^${record.kind.toLowerCase()}-[0-9TZ]+-${id}\\.sql${record.kind==='AUTO'?'\\.gz':''}$`).test(record.filename))throw Error();return record;
 }catch{throw err(404,'BACKUP_NOT_FOUND','백업을 찾을 수 없습니다.');}}
 private async records(){const root=await this.root(),records:BackupRecord[]=[];for(const file of await readdir(root)){if(!file.endsWith('.json')||!validId(file.slice(0,-5)))continue;try{records.push(await this.record(file.slice(0,-5)));}catch{/* Unmanaged files are never exposed or deleted. */}}return records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));}
 private async acquire(){
  const now=new Date(),until=new Date(now.getTime()+300000);
  const changed=await this.db.collectorLock.updateMany({where:{jobName:job,lockedUntil:{lt:now}},data:{ownerToken:this.owner,lockedUntil:until}});
  if(!changed.count)try{await this.db.collectorLock.create({data:{jobName:job,ownerToken:this.owner,lockedUntil:until}});}catch{throw err(409,'BACKUP_BUSY','다른 백업 처리가 진행 중입니다.');}
 }
 private async owns(){const lock=await this.db.collectorLock.findUnique({where:{jobName:job}});if(lock?.ownerToken!==this.owner||lock.lockedUntil<new Date())throw err(409,'BACKUP_LOCK_LOST','백업 잠금 소유권을 확인할 수 없습니다.');}
 private async release(){await this.db.collectorLock.deleteMany({where:{jobName:job,ownerToken:this.owner}});}
 private async audit(action:string,id:string,result:string){await appendFile(join(await this.root(),'audit.jsonl'),JSON.stringify({at:new Date().toISOString(),actor:'backup-admin',action,id,result})+'\n',{mode:0o600});}
 async list(cursor?:string){
  if(cursor&&!validId(cursor))throw err(400,'BACKUP_CURSOR','목록을 다시 조회해 주세요.');
  let rows=(await this.records()).filter(r=>r.status!=='DELETED');
  const latest=rows.find(r=>r.kind==='AUTO'&&r.status==='COMPLETE');
  if(cursor){const anchor=await this.record(cursor);rows=rows.filter(r=>r.createdAt<anchor.createdAt||(r.createdAt===anchor.createdAt&&r.id<anchor.id));}
  return {items:rows.slice(0,12).map(r=>({...r,latestAutomatic:r.id===latest?.id})),nextCursor:rows.length>12?rows[11]!.id:null,automatic:{enabled:process.env.BACKUP_AUTO_ENABLED==='true',schedule:'매월 1일 04:30 KST',catchUp:'복구 후 현재 월 1회 보충',retention:'자동 삭제 없음'}};
 }
 async start(kind:'AUTO'|'MANUAL',month:string|null=null){
  if(this.stopped||this.active)throw err(409,'BACKUP_BUSY','백업이 진행 중입니다.');await this.acquire();
  let record:BackupRecord;
  try{
   for(const previous of await this.records())if(previous.status==='RUNNING')await this.save({...previous,status:'FAILED',completedAt:new Date().toISOString(),reason:'WORKER_INTERRUPTED: 이전 백업 잠금 만료'});
   if(kind==='AUTO'&&(await this.records()).some(r=>r.kind==='AUTO'&&r.month===month&&(r.status==='COMPLETE'||r.status==='DELETED'))) {await this.release();return null;}
   const createdAt=new Date().toISOString(),id=randomUUID(),stamp=createdAt.replace(/[-:.]/g,'').replace(/\d{3}Z$/,'Z');
   record={id,kind,status:'RUNNING',createdAt,filename:`${kind.toLowerCase()}-${stamp}-${id}.sql${kind==='AUTO'?'.gz':''}`,completedAt:null,bytes:null,sha256:null,reason:null,month};
   await this.save(record);await this.audit('CREATE',id,'STARTED');
  }catch(error){await this.release();throw error;}
  this.active=this.create(record).catch(async()=>{await this.save({...record,status:'FAILED',completedAt:new Date().toISOString(),reason:'BACKUP_STORAGE_FAILED'}).catch(()=>{});}).finally(()=>{this.active=null;});return record;
 }
 private async create(record:BackupRecord){
  let lost=false;const timer=setInterval(()=>{void this.db.collectorLock.updateMany({where:{jobName:job,ownerToken:this.owner},data:{lockedUntil:new Date(Date.now()+300000)}}).then(r=>{if(!r.count)lost=true;}).catch(()=>{lost=true;});},30000);
  let file:string|undefined,partial:string|undefined;
  try{
   const root=await this.root();file=join(root,record.filename);partial=file+'.partial';
   const space=await statfs(root,{bigint:true});const latest=(await this.records()).find(r=>r.status==='COMPLETE');
   const estimated=BigInt(Math.ceil((latest?.bytes??0)*(latest?.kind==='AUTO'?15:2)));
   if(space.bavail*space.bsize<(estimated>536870912n?estimated:536870912n))throw err(507,'BACKUP_DISK_FULL','백업 저장 공간이 부족합니다.');
   const url=new URL(process.env.DATABASE_URL!);const database=url.pathname.slice(1);
   if(!/^[a-zA-Z0-9_]+$/.test(database))throw err(500,'BACKUP_DB_CONFIG','백업 DB 설정을 확인해 주세요.');
   let input:NodeJS.ReadableStream,done:Promise<void>;
   if(this.dumpTest){input=this.dumpTest();done=Promise.resolve();}else{
    this.child=spawn(process.env.MARIADB_DUMP_BIN??'mariadb-dump',['--protocol=tcp','--host='+url.hostname,'--port='+(url.port||3306),'--user='+decodeURIComponent(url.username),'--single-transaction','--quick','--routines','--events','--triggers','--hex-blob','--databases',database],{env:{...process.env,MYSQL_PWD:decodeURIComponent(url.password)},stdio:['ignore','pipe','pipe'],timeout:1800000});
    this.child.stderr?.resume();input=this.child.stdout!;
    done=new Promise((resolve,reject)=>{this.child!.once('error',()=>reject(err(500,'BACKUP_DUMP_FAILED','DB 덤프 실행에 실패했습니다.')));this.child!.once('close',code=>code===0?resolve():reject(err(500,'BACKUP_DUMP_FAILED','DB 덤프 실행에 실패했습니다.')));});
   }
   let bytes=0,head='',tail='';const verify=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(head.length<512)head+=chunk.toString().slice(0,512-head.length);tail=(tail+chunk.toString()).slice(-2048);callback(null,chunk);}});
   const output=createWriteStream(partial,{flags:'wx',mode:0o600});
   try{await Promise.all([record.kind==='AUTO'?pipeline(input as never,verify,createGzip(),output):pipeline(input as never,verify,output),done]);}catch(error){this.child?.kill();throw error;}
   if(!bytes||!/MariaDB dump|MySQL dump/.test(head)||!tail.includes('Dump completed'))throw err(500,'BACKUP_INVALID_DUMP','백업 파일 검증에 실패했습니다.');
   if(record.kind==='AUTO')await pipeline(createReadStream(partial),createGunzip(),new Writable({write(_chunk,_encoding,callback){callback();}}));
   const hash=createHash('sha256');await pipeline(createReadStream(partial),new Writable({write(chunk,_encoding,callback){hash.update(chunk);callback();}}));
   if(lost)throw err(409,'BACKUP_LOCK_LOST','백업 잠금이 만료됐습니다.');await this.owns();
   const handle=await open(partial,'r+');await handle.sync();const stat=await handle.stat();await handle.close();await this.owns();await rename(partial,file);
   await this.save({...record,status:'COMPLETE',completedAt:new Date().toISOString(),bytes:stat.size,sha256:hash.digest('hex')});await this.audit('CREATE',record.id,'COMPLETE');
  }catch(error){
   if(partial)await unlink(partial).catch(()=>{});
   // Failed files must never become downloadable even if final metadata failed.
   if(file)await unlink(file).catch(()=>{});
   const code=error instanceof ApiError?error.code:'BACKUP_FAILED';
   await this.save({...record,status:'FAILED',completedAt:new Date().toISOString(),reason:code}).catch(()=>{});
   await this.audit('CREATE',record.id,code).catch(()=>{});
  }finally{clearInterval(timer);this.child=null;await this.release().catch(()=>{});}
 }
 async download(id:string){
  const record=await this.record(id);if(record.status!=='COMPLETE')throw err(409,'BACKUP_NOT_COMPLETE','완료된 백업만 다운로드할 수 있습니다.');
  const root=await this.root(),file=join(root,record.filename);
  try{
   if(basename(file)!==record.filename||(await lstat(file)).isSymbolicLink()||await realpath(file)!==file)throw Error();
   const handle=await open(file,constants.O_RDONLY|(process.platform==='win32'?0:constants.O_NOFOLLOW));const stat=await handle.stat();
   if(!stat.isFile()||stat.size!==record.bytes){await handle.close();throw Error();}
   await this.audit('DOWNLOAD',id,'STARTED');return {record,stream:handle.createReadStream(),bytes:stat.size};
  }catch{await this.save({...record,status:'FAILED',reason:'BACKUP_FILE_MISSING_OR_INVALID'}).catch(()=>{});await this.audit('DOWNLOAD',id,'FILE_MISSING_OR_INVALID').catch(()=>{});throw err(404,'BACKUP_FILE_MISSING','백업 파일을 찾을 수 없습니다. 목록을 새로고침해 주세요.');}
 }
 async downloadResult(id:string,result:string){await this.audit('DOWNLOAD',id,result).catch(()=>{});}
 async remove(id:string,confirmation?:string){
  await this.acquire();try{
   const record=await this.record(id);if(record.status==='RUNNING')throw err(409,'BACKUP_BUSY','생성 중인 백업은 삭제할 수 없습니다.');
   const latest=(await this.records()).find(r=>r.kind==='AUTO'&&r.status==='COMPLETE');
   if(record.id===latest?.id&&confirmation!=='삭제 확인')throw err(409,'BACKUP_CONFIRM_LATEST','최신 자동 백업입니다. 삭제 확인을 정확히 입력해 주세요.');
   const file=join(await this.root(),record.filename),tombstone=file+'.deleting';let moved=false;
   await this.audit('DELETE',id,'STARTED');
   try{
    if(record.status==='COMPLETE'){
     if((await lstat(file)).isSymbolicLink()||await realpath(file)!==file)throw err(403,'BACKUP_PATH','허용되지 않은 백업 파일입니다.');
     await rename(file,tombstone);moved=true;
    }
    await this.save({...record,status:'DELETED',deletedAt:new Date().toISOString()});await this.audit('DELETE',id,'COMPLETE');
   }catch(error){if(moved)await rename(tombstone,file);await this.save(record);throw error;}
   if(moved)await unlink(tombstone).catch(()=>{});
  }finally{await this.release();}
 }
 async scheduled(now=new Date()){
  if(process.env.BACKUP_AUTO_ENABLED!=='true'||this.active)return;
  const key=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(now),month=key.slice(0,7),day=Number(key.slice(8,10)),time=key.slice(11,16);
  if(day===1&&time<'04:30')return;
  const records=await this.records();if(records.some(r=>r.kind==='AUTO'&&r.month===month&&(r.status==='COMPLETE'||r.status==='DELETED'||r.status==='RUNNING')))return;
  const last=records.find(r=>r.kind==='AUTO'&&r.month===month);if(last&&Date.now()-Date.parse(last.createdAt)<3600000)return;
  await this.start('AUTO',month);
 }
 async recover(){
  try{await this.acquire();}catch{return;}
  try{for(const record of await this.records())if(record.status==='RUNNING')await this.save({...record,status:'FAILED',completedAt:new Date().toISOString(),reason:'WORKER_INTERRUPTED: 이전 백업 잠금 만료'});}finally{await this.release();}
 }
 async close(){this.stopped=true;this.child?.kill();await this.active;}
 async waitForIdle(){await this.active;}
}
