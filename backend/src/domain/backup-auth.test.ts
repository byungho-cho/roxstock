import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {backupPasswordHash,passwordMatches,installBackupAuth} from './backup-auth.js';
test('backup access requires a server session, exact password, origin and CSRF token',async()=>{
 const password='isolated-test-password',encoded=backupPasswordHash(password);assert.equal(passwordMatches(password,encoded),true);assert.equal(passwordMatches(password+' ',encoded),false);
 const previous={enabled:process.env.BACKUP_ENABLED,password:process.env.BACKUP_ADMIN_PASSWORD_HASH,origin:process.env.BACKUP_PUBLIC_ORIGIN};
 process.env.BACKUP_ENABLED='true';process.env.BACKUP_ADMIN_PASSWORD_HASH=encoded;process.env.BACKUP_PUBLIC_ORIGIN='http://localhost';
 const app=Fastify();app.setErrorHandler((error:any,_request,reply)=>reply.code(error.statusCode??500).send({error:{code:error.code}}));const requireAdmin=installBackupAuth(app);
 app.get('/protected',async request=>{requireAdmin(request);return {ok:true};});app.post('/protected',async request=>{requireAdmin(request,true);return {ok:true};});
 try{
  assert.equal((await app.inject('/protected')).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/backups/login',headers:{origin:'http://evil.example'},payload:{password}})).statusCode,403);
  const login=await app.inject({method:'POST',url:'/api/backups/login',headers:{origin:'http://localhost'},payload:{password}});assert.equal(login.statusCode,200);
  const cookie=String(login.headers['set-cookie']).split(';')[0]!,csrf=login.json().data.csrf;assert.match(String(login.headers['set-cookie']),/HttpOnly/);
  assert.equal((await app.inject({url:'/protected',headers:{cookie}})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:'/protected',headers:{cookie,origin:'http://localhost'}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/protected',headers:{cookie,origin:'http://localhost','x-backup-csrf':csrf}})).statusCode,200);
 }finally{await app.close();for(const [key,value]of Object.entries({BACKUP_ENABLED:previous.enabled,BACKUP_ADMIN_PASSWORD_HASH:previous.password,BACKUP_PUBLIC_ORIGIN:previous.origin})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
