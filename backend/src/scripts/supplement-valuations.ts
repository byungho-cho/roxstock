import {OpenDartProvider} from '../collector/dart-provider.js';
import {loadPeriodSupplement} from '../collector/valuation-supplement.js';
import 'dotenv/config';
import {PrismaClient} from '../generated/prisma/index.js';
import {randomUUID} from 'node:crypto';
import {PrismaDartRepository} from '../collector/dart-repository.js';
import {supplementStoredPeriod} from '../collector/valuation-supplement.js';
const db=new PrismaClient(),repo=new PrismaDartRepository(db),owner=randomUUID();
const apply=process.argv.includes('--apply'),selected=process.argv.find(a=>a.startsWith('--security='))?.split('=')[1];
const sources=process.argv.includes('--sources'),symbol=process.argv.find(a=>a.startsWith('--symbol='))?.split('=')[1];
const target=symbol?await db.security.findFirst({where:{symbol,securityType:'STOCK'},include:{dartCorpMapping:true}}):null;
if(sources&&!apply)throw new Error('--sources requires --apply; use verify:krx:samsung for read-only API verification.');
if(sources&&!target)throw new Error('--sources requires an existing --symbol, starting with 005930.');
if(sources&&!(process.env.KRX_VALIDATED_SYMBOLS??'005930').split(',').includes(symbol!))throw new Error('Symbol has not passed Samsung-first source validation.');
const provider=sources?new OpenDartProvider({apiKey:process.env.DART_API_KEY??'',dailyCallLimit:3000,minDelayMs:2000,reserveCall:limit=>repo.reserveApiCall(limit,new Date(),owner)}):undefined;
const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
try {
 if(apply&&!await repo.acquireLock(owner,900))throw new Error('Collector is busy. Retry after it releases the shared lock.');
 const priority=new Set((await repo.prioritySecurityIds()).map(String));
 const rows=await db.dartFinancialFiling.findMany({where:{isWithdrawn:false,fiscalYear:{gte:2015,lte:currentYear},...(target?{securityId:target.id}:selected?{securityId:BigInt(selected)}:{})},distinct:['securityId','fiscalYear','periodType'],select:{securityId:true,fiscalYear:true,periodType:true}});
 rows.sort((a,b)=>Number(priority.has(String(b.securityId)))-Number(priority.has(String(a.securityId)))||b.fiscalYear-a.fiscalYear||(a.securityId<b.securityId?-1:1));
 for(const row of rows){
  if(apply){const lease=await db.collectorLock.updateMany({where:{jobName:'dart-financial-statements',ownerToken:owner,lockedUntil:{gt:new Date()}},data:{lockedUntil:new Date(Date.now()+900000)}});if(lease.count!==1)throw new Error('Collector lock lost; supplementation stopped.');}
  const result=await supplementStoredPeriod(db,row.securityId,row.fiscalYear,row.periodType,{dryRun:!apply,...(provider&&target?.dartCorpMapping?{load:loadPeriodSupplement(provider,target.symbol,target.dartCorpMapping.corpCode,undefined,target.marketType)}:{})});
  console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',...result},(_,v)=>typeof v==='bigint'?String(v):v));
 }
}finally{if(apply)await repo.releaseLock(owner);await db.$disconnect();}
