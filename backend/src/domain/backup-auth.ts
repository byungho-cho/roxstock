import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {ApiError} from '@roxstock/shared/lib/api-error';

export function backupPasswordHash(password:string){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(password,salt,32).toString('hex')}`;}
export function passwordMatches(password:string,encoded:string){
 const [algorithm,salt,key]=encoded.split(':');if(algorithm!=='scrypt'||!salt||!key||!/^([a-f0-9]{2}){32}$/.test(key)||!/^[a-f0-9]{32}$/.test(salt))return false;
 return timingSafeEqual(scryptSync(password,salt,32),Buffer.from(key,'hex'));
}
export function installBackupAuth(app:FastifyInstance){
 const sessions=new Map<string,{csrf:string;expires:number}>(),attempts=new Map<string,{count:number;until:number}>();
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
 const cookieName='roxstock_backup_session';
 function session(request:FastifyRequest){const token=request.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token)return;const key=hash(token),s=sessions.get(key);if(s&&s.expires>Date.now())return s;sessions.delete(key);}
 function verifyOrigin(request:FastifyRequest){
  const expected=process.env.BACKUP_PUBLIC_ORIGIN??`${request.protocol}://${request.headers.host}`;
  if(request.headers.origin!==expected)throw new ApiError(403,'BACKUP_ORIGIN','백업 관리 화면에서 다시 시도해 주세요.');
 }
 function requireAdmin(request:FastifyRequest,mutation=false){
  if(process.env.BACKUP_ENABLED!=='true')throw new ApiError(503,'BACKUP_DISABLED','DB 백업이 아직 설정되지 않았습니다.');
  const s=session(request);if(!s)throw new ApiError(401,'BACKUP_LOGIN_REQUIRED','백업 관리자 로그인이 필요합니다.');
  if(mutation){verifyOrigin(request);if(request.headers['x-backup-csrf']!==s.csrf)throw new ApiError(403,'BACKUP_CSRF','관리자 세션을 다시 확인해 주세요.');}
  return s;
 }
 app.get('/api/backups/session',async request=>{const s=session(request);return {data:{authenticated:!!s,configured:process.env.BACKUP_ENABLED==='true'&&!!process.env.BACKUP_ADMIN_PASSWORD_HASH,csrf:s?.csrf??null}};});
 app.post<{Body:{password?:unknown}}>('/api/backups/login',{bodyLimit:2048},async(request,reply)=>{
  verifyOrigin(request);
  const encoded=process.env.BACKUP_ADMIN_PASSWORD_HASH;
  if(process.env.BACKUP_ENABLED!=='true'||!encoded)throw new ApiError(503,'BACKUP_DISABLED','DB 백업 관리자 설정이 필요합니다.');
  for(const [key,s]of sessions)if(s.expires<Date.now())sessions.delete(key);
  for(const [key,a]of attempts)if(a.until<Date.now())attempts.delete(key);
  if(attempts.size>1000||sessions.size>100)throw new ApiError(429,'BACKUP_LOGIN_LIMIT','잠시 후 다시 시도해 주세요.');
  const key=hash(request.ip),attempt=attempts.get(key);
  if(attempt&&attempt.until>Date.now()&&attempt.count>=5)throw new ApiError(429,'BACKUP_LOGIN_LIMIT','로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.');
  const password=request.body?.password;
  if(typeof password!=='string'||password.length>256||!passwordMatches(password,encoded)){
   attempts.set(key,{count:(attempt?.count??0)+1,until:attempt?.until??Date.now()+600000});
   throw new ApiError(401,'BACKUP_LOGIN_FAILED','관리자 비밀번호를 확인해 주세요.');
  }
  attempts.delete(key);const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
  sessions.set(hash(token),{csrf,expires:Date.now()+8*3600000});
  setCookie(reply,token);return {data:{authenticated:true,csrf}};
 });
 function setCookie(reply:FastifyReply,token:string){reply.header('Set-Cookie',`${cookieName}=${token}; Path=/api/backups; HttpOnly; SameSite=Strict; Max-Age=${token?28800:0}${process.env.NODE_ENV==='production'?'; Secure':''}`);reply.header('Cache-Control','no-store');}
 app.post('/api/backups/logout',async(request,reply)=>{requireAdmin(request,true);const token=request.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(token)sessions.delete(hash(token));setCookie(reply,'');return {data:{authenticated:false}};});
 app.addHook('onClose',async()=>{sessions.clear();attempts.clear();});
 return requireAdmin;
}
