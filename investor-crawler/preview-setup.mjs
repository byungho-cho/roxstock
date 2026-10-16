// Run through SSH on the Docker host. Creates only labeled isolated preview
// resources; never connects to, migrates, or seeds the production database.
import fs from 'node:fs';
import cp from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const root='/opt/roxstock/.deploy/investor-preview',network='roxstock-investor-preview',dbName='roxstock-investor-db-preview',crawlerName='roxstock-investor-crawler-preview',label='roxstock.preview=investor-v1.1';
const image=process.env.INVESTOR_PREVIEW_IMAGE??'roxstock-investor-crawler:dev-1.1.0';
if(!/^roxstock-investor-crawler:[a-zA-Z0-9_.-]+$/.test(image))throw Error('Invalid preview image');
const docker=(args)=>cp.execFileSync('docker',args,{encoding:'utf8',maxBuffer:4*1024*1024});
function exists(kind,name){try{docker([kind,'inspect',name]);return true;}catch{return false;}}
fs.mkdirSync(root,{recursive:true,mode:0o700});if(fs.realpathSync(root)!==root)throw Error('Unsafe preview root');
const config=root+'/crawler.env',dbConfig=root+'/database.env';
if(!fs.existsSync(config)){
 const password=randomBytes(32).toString('hex');
 fs.writeFileSync(config,`DATABASE_URL=mysql://investor_preview:${password}@${dbName}:3306/investor_preview\nINVESTOR_START_DATE=2026-10-16\nINVESTOR_COLLECTION_HOURS=18,21\nINVESTOR_REQUEST_DELAY_MS=2000\n`,{flag:'wx',mode:0o600});
 fs.writeFileSync(dbConfig,`MARIADB_ROOT_PASSWORD=${randomBytes(32).toString('hex')}\nMARIADB_DATABASE=investor_preview\nMARIADB_USER=investor_preview\nMARIADB_PASSWORD=${password}\n`,{flag:'wx',mode:0o600});
}
if(!exists('network',network))docker(['network','create','--label',label,network]);
else if(JSON.parse(docker(['network','inspect',network]))[0].Labels?.['roxstock.preview']!=='investor-v1.1')throw Error('Unmanaged preview network');
if(!exists('container',dbName))docker(['run','-d','--name',dbName,'--label',label,'--network',network,'--memory','192m','--cpus','0.25','--restart','unless-stopped','--env-file',dbConfig,'--mount',`type=volume,source=roxstock-investor-preview-db,target=/var/lib/mysql`,'--health-cmd','healthcheck.sh --connect --innodb_initialized','--health-interval','5s','--health-retries','12','mariadb:11.8.9','--innodb-buffer-pool-size=32M','--max-connections=12','--performance-schema=OFF']);
for(let i=0;i<60;i++){const state=JSON.parse(docker(['inspect',dbName]))[0];if(state.Config.Labels['roxstock.preview']!=='investor-v1.1')throw Error('Unmanaged preview name');if(state.State.Health?.Status==='healthy')break;if(i===59)throw Error('Preview database is not healthy');await delay(1000);}
const base=['run','--rm','--network',network,'--memory','192m','--cpus','0.5','--env-file',config,image];
docker([...base,'node','node_modules/prisma/build/index.js','migrate','deploy','--schema','database/prisma/schema.prisma']);
const seed=`import {PrismaClient} from './shared/dist/generated/prisma/index.js';const db=new PrismaClient();const account=await db.account.upsert({where:{id:1n},create:{id:1n,name:'Isolated preview',brokerName:'TEST',accountNumber:'TEST-ONLY',normalizedAccountNumber:'TESTONLY'},update:{}});for(const [symbol,name]of [['005930','삼성전자'],['000660','SK하이닉스']]){const s=await db.security.upsert({where:{symbol},create:{symbol,name,marketType:'KOSPI',registrationSource:'USER'},update:{}});await db.accountWatchlistItem.upsert({where:{accountId_securityId:{accountId:account.id,securityId:s.id}},create:{accountId:account.id,securityId:s.id,listType:'WATCHLIST'},update:{}});}await db.$disconnect();`;
docker([...base,'node','--input-type=module','-e',seed]);
docker([...base,'node','investor-crawler/src/worker.mjs','--once']);
if(exists('container',crawlerName)){
 const old=JSON.parse(docker(['inspect',crawlerName]))[0];
 if(old.Config.Labels?.['roxstock.preview']!=='investor-v1.1')throw Error('Unmanaged preview crawler');
 const nextImage=JSON.parse(docker(['image','inspect',image]))[0].Id;
 if(old.Image!==nextImage){docker(['stop','--time','45',crawlerName]);docker(['rm',crawlerName]);}
}
if(!exists('container',crawlerName))docker(['run','-d','--name',crawlerName,'--label',label,'--network',network,'--memory','128m','--cpus','0.25','--restart','unless-stopped','--read-only','--tmpfs','/tmp:size=16m,mode=1777','--env-file',config,'--health-cmd',"node -e \"const fs=require('fs');if(Date.now()-Number(fs.readFileSync('/tmp/roxstock-investor-heartbeat','utf8'))>900000)process.exit(1)\"",'--health-interval','30s','--health-start-period','60s',image]);
const summary=`import {PrismaClient} from './shared/dist/generated/prisma/index.js';const db=new PrismaClient();console.log(JSON.stringify({database:'isolated investor_preview',observations:await db.investorFlowDaily.count(),latestRun:await db.collectorRun.findFirst({orderBy:{id:'desc'},select:{status:true,staleCount:true,failureCount:true,skippedCount:true}})}));await db.$disconnect();`;
process.stdout.write(docker([...base,'node','--input-type=module','-e',summary]));
console.log(JSON.stringify({crawler:JSON.parse(docker(['inspect',crawlerName]))[0].State.Status,image,network,productionDatabaseModified:false}));
