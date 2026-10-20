import type {FastifyInstance} from 'fastify';
import {resolve} from 'node:path';
import {prisma} from '../auth/scoped-db.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {installBackupAuth} from '../domain/backup-auth.js';
import {BackupService} from '../domain/backup-service.js';

export async function backupRoutes(app:FastifyInstance){
 const requireAdmin=installBackupAuth(app);
 let service:BackupService|undefined;
 function manager(){
  if(!process.env.BACKUP_DIRECTORY)throw new ApiError(503,'BACKUP_DIRECTORY_MISSING','백업 저장 위치 설정이 필요합니다.');
  return service??=new BackupService(prisma,resolve(process.env.BACKUP_DIRECTORY));
 }
 app.addHook('onSend',async(request,reply,payload)=>{if(request.url.startsWith('/api/backups'))reply.header('Cache-Control','no-store');return payload;});
 app.get<{Querystring:{cursor?:string}}>('/api/backups',async request=>{requireAdmin(request);await manager().recover();return {data:await manager().list(request.query.cursor)};});
 app.post('/api/backups',async(request,reply)=>{requireAdmin(request,true);const result=await manager().start('MANUAL');reply.code(202);return {data:result};});
 app.get<{Params:{id:string}}>('/api/backups/:id/check',async request=>{requireAdmin(request);const result=await manager().download(request.params.id);result.stream.destroy();return {data:{available:true}};});
 app.get<{Params:{id:string}}>('/api/backups/:id/download',async(request,reply)=>{
  requireAdmin(request);const result=await manager().download(request.params.id);
  reply.header('Content-Type',result.record.kind==='AUTO'?'application/gzip':'application/sql');
  reply.header('Content-Disposition',`attachment; filename="${result.record.filename}"`);
  reply.header('Content-Length',result.bytes);reply.header('X-Content-Type-Options','nosniff');
  let recorded=false;
  const audit=(status:string)=>{if(!recorded){recorded=true;void manager().downloadResult(result.record.id,status);}};
  reply.raw.once('finish',()=>audit('COMPLETE'));
  reply.raw.once('error',()=>audit('FAILED'));
  reply.raw.once('close',()=>{if(!reply.raw.writableFinished)audit('INTERRUPTED');});
  return reply.send(result.stream);
 });
 app.delete<{Params:{id:string};Body:{confirmation?:string}}>('/api/backups/:id',async request=>{requireAdmin(request,true);await manager().remove(request.params.id,request.body?.confirmation);return {data:{deleted:true}};});
 let timer:ReturnType<typeof setInterval>|undefined;
 app.addHook('onReady',async()=>{
  if(process.env.BACKUP_ENABLED!=='true'||!process.env.BACKUP_DIRECTORY)return;
  await manager().recover();
  const tick=()=>void manager().scheduled().catch(()=>app.log.error({code:'BACKUP_SCHEDULE_FAILED'},'백업 스케줄 실행 실패'));
  timer=setInterval(tick,60000);timer.unref();tick();
 });
 app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await service?.close();});
}
