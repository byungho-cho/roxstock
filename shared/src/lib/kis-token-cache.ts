import {mkdir,readFile,writeFile,rename,rm,chmod,stat,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
export class KisTokenCacheError extends Error {constructor(readonly code:string){super(code);}}
type Token={token:string;expiresAt:number};
const pending=new Map<string,Promise<Token>>();
/** Same credential/environment shares one private cache and exclusive issuance lock across processes. */
export function persistentKisToken({appKey,appSecret,origin,issue,directory=process.env.KIS_TOKEN_CACHE_DIR??join(homedir(),'.roxstock','kis-tokens')}:{appKey:string;appSecret:string;origin:string;issue:()=>Promise<Token>;directory?:string}):Promise<Token>{
 const scope=createHash('sha256').update(JSON.stringify([origin,appKey,appSecret])).digest('hex'),key=directory+':'+scope;
 const current=pending.get(key);if(current)return current;
 const work=load();pending.set(key,work);void work.finally(()=>{if(pending.get(key)===work)pending.delete(key);}).catch(()=>{});return work;
 async function load(){
  const file=join(directory,scope+'.json'),lock=join(directory,scope+'.lock'),owner=randomUUID();
  try{await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);}catch{throw new KisTokenCacheError('KIS_TOKEN_CACHE_UNAVAILABLE');}
  const read=async()=>{try{const raw=JSON.parse(await readFile(file,'utf8'));return raw?.scope===scope?raw:null;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw new KisTokenCacheError('KIS_TOKEN_CACHE_INVALID');}};
  const usable=(v:any):v is Token=>typeof v?.token==='string'&&v.token.length>0&&Number.isFinite(v.expiresAt)&&v.expiresAt>Date.now()+60000;
  const existing=await read();if(usable(existing))return {token:existing.token,expiresAt:existing.expiresAt};
  let acquired=false;const deadline=Date.now()+30000;
  while(!acquired){
   try{await mkdir(lock,{mode:0o700});acquired=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw new KisTokenCacheError('KIS_TOKEN_CACHE_UNAVAILABLE');
    const saved=await read();if(usable(saved))return {token:saved.token,expiresAt:saved.expiresAt};
    try{if(Date.now()-(await stat(lock)).mtimeMs>120000){const abandoned=lock+'.abandoned-'+owner;await rename(lock,abandoned);await rm(abandoned,{recursive:true,force:true});continue;}}catch{}
    if(Date.now()>=deadline)throw new KisTokenCacheError('KIS_TOKEN_CACHE_BUSY');
    await new Promise(r=>setTimeout(r,100));
   }
  }
  await writeFile(join(lock,'owner'),owner,{mode:0o600});
  const owns=async()=>{try{return await readFile(join(lock,'owner'),'utf8')===owner;}catch{return false;}};
  const heartbeat=setInterval(()=>{void (async()=>{if(await owns()){const now=new Date();await utimes(lock,now,now);}})().catch(()=>{});},10000);heartbeat.unref();
  const save=async(value:object)=>{const temp=join(directory,scope+'.'+owner+'.tmp');try{if(!await owns())throw new KisTokenCacheError('KIS_TOKEN_LOCK_LOST');await writeFile(temp,JSON.stringify({scope,...value}),{mode:0o600,flag:'wx'});await rename(temp,file);await chmod(file,0o600);}catch{await rm(temp,{force:true}).catch(()=>{});throw new KisTokenCacheError('KIS_TOKEN_CACHE_WRITE_FAILED');}};
  try{
   const saved=await read();if(usable(saved))return {token:saved.token,expiresAt:saved.expiresAt};
   if(saved?.attemptedAt&&Date.now()-saved.attemptedAt<60000)throw new KisTokenCacheError('KIS_TOKEN_ISSUE_COOLDOWN');
   await save({attemptedAt:Date.now()});
   if(!await owns())throw new KisTokenCacheError('KIS_TOKEN_LOCK_LOST');
   const token=await issue();
   if(typeof token.token!=='string'||!token.token||!Number.isFinite(token.expiresAt)||token.expiresAt<=Date.now()+60000||token.expiresAt>Date.now()+86400000+1000)throw new KisTokenCacheError('KIS_TOKEN_INVALID_EXPIRY');
   await save({...token,attemptedAt:Date.now()});return token;
  }finally{clearInterval(heartbeat);if(await owns())await rm(lock,{recursive:true,force:true});}
 }
}
