// Streamed to the deployed backend. Output goes only to a private runner file, never to logs.
import {prisma} from './shared/dist/lib/prisma.js';
import {randomToken,tokenHash} from './backend/dist/auth/crypto.js';
import {readFileSync,writeFileSync} from 'node:fs';
const marker='/tmp/roxstock-security-data-browser-sessions.json',sessions=[],identities=[];
try{
 try{const previous=JSON.parse(readFileSync(marker,'utf8'));await prisma.authSession.deleteMany({where:{id:{in:previous}}});}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const role of ['USER','ADMIN']){
  const user=await prisma.authUser.findFirst({where:{role,verifiedAt:{not:null},mustChangePassword:false},select:{id:true}});if(!user)throw Error('VERIFICATION_IDENTITY_UNAVAILABLE');
  const id=randomToken(),token=id+'.'+randomToken(),csrf=randomToken();sessions.push(id);
  await prisma.authSession.create({data:{id,userId:user.id,persistent:false,tokenHash:tokenHash(token),csrfHash:tokenHash(csrf),expiresAt:new Date(Date.now()+300000)}});
  identities.push({role,cookies:[{name:'rox_session',value:token,domain:'newrox.cafe24.com',path:'/',httpOnly:true,secure:true,sameSite:'Lax'},{name:'rox_csrf',value:csrf,domain:'newrox.cafe24.com',path:'/',httpOnly:false,secure:true,sameSite:'Strict'}]});
 }
 writeFileSync(marker,JSON.stringify(sessions),{mode:0o600});process.stdout.write(JSON.stringify(identities));
}catch(error){await prisma.authSession.deleteMany({where:{id:{in:sessions}}});throw error;}finally{await prisma.$disconnect();}
