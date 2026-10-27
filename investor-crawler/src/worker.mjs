import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {writeFile} from 'node:fs/promises';
import {PrismaClient,Prisma} from '../../shared/dist/generated/prisma/index.js';
import {ProviderError,dateKey} from './provider.mjs';
import {KisInvestorProvider} from './kis-provider.mjs';
import {runInvestorBackfill} from './backfill.mjs';
import {runKisSupplements} from './kis-supplements.mjs';
import {KrxFundamentalProvider} from './krx-fundamentals.mjs';

const db=new PrismaClient(),job='investor-trends',owner=randomUUID();
const kis=new KisInvestorProvider();
const krx=new KrxFundamentalProvider();
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const startDate=dateKey(process.env.INVESTOR_START_DATE??'2026-10-16');
const requestDelay=Math.max(1000,Number(process.env.INVESTOR_REQUEST_DELAY_MS??2000));
if(!Number.isFinite(requestDelay))throw new Error('INVALID_REQUEST_DELAY');
const stop=new AbortController();
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>stop.abort());
const safeLog=(event,details={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...details}));

function validate(rows){
 const identities=new Set();
 for(const row of rows){
  if(row.exchangeScope==='KRX'&&['INDIVIDUAL','FOREIGN','INSTITUTION'].includes(row.investorCode)&&[row.buyQuantity,row.sellQuantity,row.netQuantity].some(v=>v===null))throw new ProviderError('INCOMPLETE_QUANTITY_RESPONSE');
  const key=row.tradeDate+':'+row.investorCode;
  if(identities.has(key))throw new ProviderError('DUPLICATE_SUBJECT');identities.add(key);
  for(const suffix of ['Amount','Quantity']){
   const buy=row['buy'+suffix],sell=row['sell'+suffix],net=row['net'+suffix];
   if(buy!==null&&sell!==null&&net!==null){const difference=new Prisma.Decimal(buy).minus(sell).minus(net);const tolerance=row.source==='KIS_API'&&suffix==='Amount'&&row.raw.amountUnit==='MILLION_KRW'?1000000:0;if(difference.abs().greaterThan(tolerance))throw new ProviderError('NET_VALUE_MISMATCH');}
  }
 }
}
async function lock(){
 const now=new Date(),until=new Date(now.getTime()+120000);
 const changed=await db.collectorLock.updateMany({where:{jobName:job,lockedUntil:{lt:now}},data:{ownerToken:owner,lockedUntil:until}});
 if(changed.count)return true;
 try{await db.collectorLock.create({data:{jobName:job,ownerToken:owner,lockedUntil:until}});return true;}catch(e){if(e.code==='P2002')return false;throw e;}
}
async function run(){
 if(!await lock()){safeLog('LOCK_CONFLICT');return;}
 let lost=false,runRecord;
 const heartbeat=setInterval(()=>{void db.collectorLock.updateMany({where:{jobName:job,ownerToken:owner},data:{lockedUntil:new Date(Date.now()+120000)}}).then(r=>{if(!r.count)lost=true;}).catch(()=>{lost=true;});},30000);
 try{
  // This worker acquired an absent/expired lease. Older unfinished executions
  // cannot own it now; retain their original record and mark interruption.
  await db.collectorRun.updateMany({where:{jobType:job,status:'RUNNING'},data:{status:'FAILED',finishedAt:new Date(),failureReason:'WORKER_INTERRUPTED: expired owner lease; previous result not promoted to success'}});
  runRecord=await db.collectorRun.create({data:{jobType:job,provider:'KIS_API',metadata:{startDate,owner,mode:'forward-only',naverCollectionEnabled:false,scope:'KRX and NXT stock observations stored separately; market remains KIS_MARKET'}}});
  const securities=await db.security.findMany({where:{isActive:true,collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}},OR:[{buyTrades:{some:{}}},{accountWatchlistItems:{some:{}}}]},select:{id:true,symbol:true,collectionRevision:true}});
  const targets=[...['KOSPI','KOSDAQ'].map(key=>({type:'MARKET',key})),...securities.flatMap(s=>['KRX','NXT'].map(exchangeScope=>({type:'STOCK',key:s.symbol,security:s,exchangeScope})))];
  let stored=0,failed=0,pending=0;
  const since=new Date(Math.max(Date.parse(startDate+'T00:00:00Z'),Date.parse(today()+'T00:00:00Z')-3*86400000)).toISOString().slice(0,10);
  for(const target of targets){
   if(stop.signal.aborted||lost)throw new ProviderError(lost?'LOCK_OWNERSHIP_LOST':'WORKER_STOPPED');
   try{
    if(target.security){const current=await db.security.findUnique({where:{id:target.security.id}});if(!current||current.collectionExcluded||!current.isActive||current.symbol.startsWith('Z99')||current.symbol!==target.key||current.collectionRevision!==target.security.collectionRevision)throw new ProviderError('TARGET_CHANGED_OR_EXCLUDED');}
    const rows=(await (target.type==='MARKET'?kis.marketFlows(target.key):kis.stockFlows(target.key,today(),target.exchangeScope))).filter(r=>r.tradeDate>=since&&r.tradeDate<=today());
    validate(rows);
    if(!rows.length){pending++;await db.collectorRunItem.create({data:{runId:runRecord.id,securityId:target.security?.id,symbol:target.key,status:'SKIPPED',message:'NO_CURRENT_DATA: 시작일 이후 공급 자료가 아직 없습니다.'}});await delay(requestDelay,undefined,{signal:stop.signal});continue;}
    await db.$transaction(async tx=>{
     const leases=await tx.$queryRaw`SELECT owner_token FROM collector_locks WHERE job_name=${job} AND locked_until>${new Date()} FOR UPDATE`;
     if(leases[0]?.owner_token!==owner)throw new ProviderError('LOCK_OWNERSHIP_LOST');
     if(target.security){await tx.$queryRaw`SELECT id FROM securities WHERE id=${target.security.id} FOR UPDATE`;const current=await tx.security.findUnique({where:{id:target.security.id}});if(!current||current.collectionExcluded||!current.isActive||current.symbol!==target.key||current.collectionRevision!==target.security.collectionRevision)throw new ProviderError('TARGET_CHANGED_OR_EXCLUDED');}
     for(const row of rows){
      const {tradeDate,...fields}=row,data={...fields,tradeDate:new Date(tradeDate+'T00:00:00Z'),targetType:target.type,targetKey:target.key};
      const identity={targetType:target.type,targetKey:target.key,tradeDate:data.tradeDate,source:row.source,exchangeScope:row.exchangeScope,investorCode:row.investorCode};
      const update=Object.fromEntries(Object.entries(data).filter(([,value])=>value!==null));
      await tx.investorFlowDaily.upsert({where:{targetType_targetKey_tradeDate_source_exchangeScope_investorCode:identity},create:data,update});
     }
     await tx.collectorRunItem.create({data:{runId:runRecord.id,securityId:target.security?.id,symbol:target.key,status:'STALE',message:target.type==='MARKET'?'PARTIAL_FIELDS: 시장 순매수 금액 저장 · 수량 단위·확정 여부 미제공':'PARTIAL_FIELDS: '+target.exchangeScope+' 수량·금액 저장, 금액 원본 백만원 단위·확정 여부 미제공',observedAt:new Date(),diagnostics:{rows:rows.length,scope:rows[0].exchangeScope,source:rows[0].source,amountUnit:rows[0].amountUnit}}});
    });
    stored++;
   }catch(error){
    if(stop.signal.aborted)throw new ProviderError('WORKER_STOPPED');
    if(error?.code==='LOCK_OWNERSHIP_LOST')throw error;
    const code=error instanceof ProviderError?error.code:'INTERNAL_OR_DB_ERROR';failed++;
    await db.collectorRunItem.create({data:{runId:runRecord.id,securityId:target.security?.id,symbol:target.key,status:'FAILED',message:code}});
    safeLog('TARGET_FAILED',{runId:String(runRecord.id),target:target.key,code});
   }
   await delay(requestDelay,undefined,{signal:stop.signal});
  }
  await db.collectorRun.update({where:{id:runRecord.id},data:{status:stored?'PARTIAL':failed?'FAILED':'SKIPPED',finishedAt:new Date(),staleCount:stored,failureCount:failed,skippedCount:pending,metadata:{startDate,since,owner,storedTargets:stored,pendingTargets:pending,mode:'forward-only',reason:'No provider-complete observations; missing values preserved as null'}}});
  if(!stored&&failed&&process.argv.includes('--once'))process.exitCode=1;
  safeLog('RUN_FINISHED',{runId:String(runRecord.id),stored,failed,pending});
 }catch(error){
  const code=error instanceof ProviderError?error.code:stop.signal.aborted?'WORKER_STOPPED':'INTERNAL_OR_DB_ERROR';
  if(runRecord)await db.collectorRun.update({where:{id:runRecord.id},data:{status:'FAILED',finishedAt:new Date(),failureReason:code}}).catch(()=>safeLog('FAILURE_RECORD_FAILED',{originalCode:code,runId:String(runRecord.id)}));
  safeLog('RUN_FAILED',{code});
  if(process.argv.includes('--once'))process.exitCode=1;
 }finally{
  clearInterval(heartbeat);await db.collectorLock.deleteMany({where:{jobName:job,ownerToken:owner}});
 }
}

try{
 if(process.argv.includes('--supplement-once'))await runKisSupplements({db,kis,krx,signal:stop.signal,limit:10,log:safeLog});
 else if(process.argv.includes('--backfill'))await runInvestorBackfill({db,kis,signal:stop.signal,from:process.env.INVESTOR_BACKFILL_FROM??'2020-01-01',exchangeScope:process.argv.includes('--nxt')?'NXT':'KRX',log:safeLog});
 else if(process.argv.includes('--once'))await run();
 else{
  // Trial hours are configurable; no claim of provider finality at these times.
  const hours=(process.env.INVESTOR_COLLECTION_HOURS??'18,21').split(',').map(Number);
  if(hours.some(h=>!Number.isInteger(h)||h<0||h>23))throw new Error('INVALID_SCHEDULE');
  while(!stop.signal.aborted){
   await writeFile('/tmp/roxstock-investor-heartbeat',String(Date.now())).catch(()=>{});
   const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hour12:false}).format(new Date()));
   if(hours.includes(hour)){
    const hourStart=new Date();hourStart.setUTCMinutes(0,0,0);
    const recent=await db.collectorRun.findFirst({where:{jobType:job,startedAt:{gte:hourStart}},select:{id:true}});
    if(!recent)await run();
   }
   let backfillRequests=0;
   if(hour>=18&&(process.env.SECURITY_DATA_COLLECTION_ENABLED==='true'?process.env.KIS_CURRENT_FUNDAMENTALS_ENABLED!=='false':process.env.KIS_SUPPLEMENT_ENABLED!=='false')&&((process.env.KIS_APP_KEY?.trim()&&process.env.KIS_APP_SECRET?.trim())||process.env.KRX_API_KEY?.trim())){
    try{await runKisSupplements({db,kis,krx,signal:stop.signal,limit:10,log:safeLog});}catch(error){safeLog('KIS_SUPPLEMENT_PAUSED',{code:error instanceof ProviderError?error.code:'INTERNAL_OR_DB_ERROR'});}
   }
   if(process.env.INVESTOR_BACKFILL_ENABLED!=='false'&&process.env.KIS_APP_KEY?.trim()&&process.env.KIS_APP_SECRET?.trim()){
    try{const result=await runInvestorBackfill({db,kis,signal:stop.signal,from:process.env.INVESTOR_BACKFILL_FROM??'2020-01-01',requestLimit:10,log:safeLog});backfillRequests=result.requests;}catch(error){safeLog('BACKFILL_PAUSED',{code:error instanceof ProviderError?error.code:'INTERNAL_OR_DB_ERROR'});}
    await delay(2000,undefined,{signal:stop.signal});
    try{const result=await runInvestorBackfill({db,kis,signal:stop.signal,from:process.env.INVESTOR_BACKFILL_FROM??'2020-01-01',exchangeScope:'NXT',requestLimit:10,log:safeLog});backfillRequests+=result.requests;}catch(error){safeLog('NXT_BACKFILL_PAUSED',{code:error instanceof ProviderError?error.code:'INTERNAL_OR_DB_ERROR'});}
   }
   await delay(backfillRequests?2000:30000,undefined,{signal:stop.signal}).catch(()=>{});
  }
 }
}finally{await db.$disconnect();}
