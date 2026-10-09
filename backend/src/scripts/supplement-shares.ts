import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '../generated/prisma/index.js';
import {OpenDartProvider,DartApiError,type DartReportCode} from '../collector/dart-provider.js';
import {PrismaDartRepository} from '../collector/dart-repository.js';
import {storeShareCounts} from '../collector/share-counts.js';
const db=new PrismaClient(),repo=new PrismaDartRepository(db),owner=randomUUID();
const apply=process.argv.includes('--apply'),symbol=process.argv.find(a=>a.startsWith('--symbol='))?.slice(9),limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.slice(8)??'50');
if(!Number.isInteger(limit)||limit<1||limit>3000)throw Error('limit must be 1..3000');
const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
const summary={target:0,attempted:0,success:0,partial:0,failed:0,remaining:0,stopCode:null as string|null};
try{
 const filings=await db.dartFinancialFiling.findMany({where:{isWithdrawn:false,fiscalYear:{gte:2015,lte:currentYear},...(symbol?{security:{symbol}}:{})},include:{security:{include:{dartCorpMapping:true}}},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}],distinct:['securityId','fiscalYear','reportCode']});
 const snapshots=await db.dartShareSnapshot.findMany();
 const complete=new Set(snapshots.filter(s=>s.shareClass==='COMMON'&&s.issuedShares!==null&&s.treasuryShares!==null&&s.outstandingShares!==null).map(s=>`${s.securityId}:${s.receiptNo}`));
 const missing=filings.filter(f=>!complete.has(`${f.securityId}:${f.receiptNo}`));
 // A receipt is globally unique. Reuse only an unambiguous exact receipt in the
 // stored DART report cache when the master mapping is temporarily unavailable.
 const cachedCodes=new Map<string,Set<string>>();
 if(apply&&missing.some(f=>!f.security.dartCorpMapping))for(const cache of await db.dartReportCache.findMany({select:{corpCode:true,reports:true}})){
  if(!/^\d{8}$/.test(cache.corpCode)||!Array.isArray(cache.reports))continue;
  for(const report of cache.reports){const receipt=report&&typeof report==='object'&&!Array.isArray(report)?report.receiptNo:undefined;if(typeof receipt!=='string'||!/^\d{14}$/.test(receipt))continue;const codes=cachedCodes.get(receipt)??new Set<string>();codes.add(cache.corpCode);cachedCodes.set(receipt,codes);}
 }
 const securityCodes=new Map<bigint,Set<string>>();
 for(const filing of filings){const codes=securityCodes.get(filing.securityId)??new Set<string>();for(const code of cachedCodes.get(filing.receiptNo)??[])codes.add(code);securityCodes.set(filing.securityId,codes);}
 const priority=new Set((await repo.prioritySecurityIds()).map(String));missing.sort((a,b)=>Number(priority.has(String(b.securityId)))-Number(priority.has(String(a.securityId)))||b.fiscalYear-a.fiscalYear||b.periodEndDate.getTime()-a.periodEndDate.getTime());
 summary.target=missing.length;summary.remaining=missing.length;
 if(apply){
  if(!await repo.acquireLock(owner,900))throw Error('COLLECTOR_BUSY');
  const provider=new OpenDartProvider({apiKey:process.env.DART_API_KEY??'',dailyCallLimit:3000,minDelayMs:2000,reserveCall:n=>repo.reserveApiCall(n,new Date(),owner)});
  for(const f of missing.slice(0,limit)){
   const lease=await db.collectorLock.updateMany({where:{jobName:'dart-financial-statements',ownerToken:owner,lockedUntil:{gt:new Date()}},data:{lockedUntil:new Date(Date.now()+900000)}});if(lease.count!==1)throw Error('COLLECTOR_LOCK_LOST');
   summary.attempted++;
   try{
    const codes=securityCodes.get(f.securityId),corpCode=f.security.dartCorpMapping?.corpCode??(codes?.size===1?[...codes][0]:undefined);
    if(!corpCode)throw Error('CORP_MAPPING_MISSING');
    const shares=await provider.fetchPeriodShares(corpCode,f.fiscalYear,f.reportCode as DartReportCode,f.receiptNo);
    if(!shares)throw Error('SHARES_NO_DATA');
    await storeShareCounts(db,f,shares);
    const common=shares.rows.find(r=>r.shareClass==='COMMON');
    if(common&&common.issuedShares!==null&&common.treasuryShares!==null&&common.outstandingShares!==null){summary.success++;summary.remaining--;}else summary.partial++;
    console.log(JSON.stringify({symbol:f.security.symbol,year:f.fiscalYear,report:f.reportCode,receiptNo:f.receiptNo,rows:shares.rows}));
   }catch(e){summary.failed++;const code=e instanceof DartApiError?e.code:e instanceof Error&&/^(SHARES_[A-Z_]+|CORP_MAPPING_MISSING)$/.test(e.message)?e.message:typeof e==='object'&&e&&'code'in e?String(e.code):'SHARES_ERROR';console.log(JSON.stringify({symbol:f.security.symbol,year:f.fiscalYear,receiptNo:f.receiptNo,code}));if(e instanceof DartApiError&&(e.quotaExceeded||['DAILY_CALL_LIMIT','SCHEDULE_WINDOW_ENDED'].includes(code))){summary.stopCode=code;break;}}
  }
 }
 console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',...summary}));
}finally{if(apply)await repo.releaseLock(owner);await db.$disconnect();}
