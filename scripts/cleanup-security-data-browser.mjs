import {prisma} from './shared/dist/lib/prisma.js';
import {readFileSync,unlinkSync} from 'node:fs';
try{const path='/tmp/roxstock-security-data-browser-sessions.json';try{await prisma.authSession.deleteMany({where:{id:{in:JSON.parse(readFileSync(path,'utf8'))}}});unlinkSync(path);}catch(e){if(e.code!=='ENOENT')throw e;}}finally{await prisma.$disconnect();}
