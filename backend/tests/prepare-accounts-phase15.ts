import {PrismaClient} from '../src/generated/prisma/index.js';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const url=new URL(process.env.DATABASE_URL??''),name=url.pathname.slice(1);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^[a-z0-9_]+_phase15_test$/.test(name))throw Error('Isolated loopback test database required');
url.pathname='/mysql';const admin=new PrismaClient({datasourceUrl:url.toString()});
try{await admin.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);}finally{await admin.$disconnect();}
const require=createRequire(import.meta.url);
execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',fileURLToPath(new URL('../../database/prisma/schema.prisma',import.meta.url))],{stdio:'inherit',env:process.env});

