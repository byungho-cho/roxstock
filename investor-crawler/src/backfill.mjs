import {randomUUID} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {Prisma} from '../../shared/dist/generated/prisma/index.js';
import {ProviderError,dateKey} from './provider.mjs';

const lockName='investor-trends';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const dayBefore=value=>new Date(Date.parse(value+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const terminal=state=>['COMPLETE','EXHAUSTED'].includes(state);
export function backfillPage(rows,cursor,from){
 if(!rows.length)return {rows:[],nextCursor:cursor,oldest:null,complete:false};
 const dates=[...new Set(rows.map(row=>dateKey(row.tradeDate)))].sort();
 if(dates.at(-1)>cursor)throw new ProviderError('BACKFILL_FUTURE_RESPONSE');
 const oldest=dates[0],nextCursor=dayBefore(oldest);
 if(nextCursor>=cursor)throw new ProviderError('BACKFILL_CURSOR_NOT_ADVANCING');
 return {rows:rows.filter(row=>row.tradeDate>=from&&row.tradeDate<=cursor),nextCursor,oldest,complete:oldest<=from};
}
const eligible=security=>security.isActive&&!security.collectionExcluded&&!security.symbol.startsWith('Z99')&&!(Array.isArray(security.excludedFeatures)&&security.excludedFeatures.includes('investor-trends'));
function currentlyHeldOrWatched(security){
 if(security.accountWatchlistItems.some(item=>item.listType==='WATCHLIST'))return true;
 return security.buyTrades.some(buy=>buy.quantity.minus(buy.sellTrades.reduce((sum,sell)=>sum.plus(sell.quantity),new Prisma.Decimal(0))).greaterThan(0));
}
/** Persistent per-target cursor and rows commit together. Shares the live collector's owner-checked lease. */
export async function runInvestorBackfill({db,kis,signal,from='2020-01-01',exchangeScope='KRX',requestLimit=Infinity,requestDelayMs=2000,log=()=>{}}){
 if(!['KRX','NXT'].includes(exchangeScope))throw new ProviderError('INVALID_EXCHANGE_SCOPE');
 if(exchangeScope==='NXT'&&from<'2025-03-04')from='2025-03-04';
 const jobType=exchangeScope==='NXT'?'investor-trends-nxt-backfill':'investor-trends-backfill';
 dateKey(from);const owner=randomUUID();let campaign,requests=0,lastRequest=0,lost=false;
 const now=new Date();
 const acquired=await db.collectorLock.updateMany({where:{jobName:lockName,lockedUntil:{lt:now}},data:{ownerToken:owner,lockedUntil:new Date(Date.now()+120000)}});
 if(!acquired.count){try{await db.collectorLock.create({data:{jobName:lockName,ownerToken:owner,lockedUntil:new Date(Date.now()+120000)}});}catch(error){if(error.code==='P2002')return {requests:0,locked:true};throw error;}}
 const heartbeat=setInterval(()=>{void db.collectorLock.updateMany({where:{jobName:lockName,ownerToken:owner},data:{lockedUntil:new Date(Date.now()+120000)}}).then(result=>{if(!result.count)lost=true;}).catch(()=>{lost=true;});},30000);
 const check=()=>{if(lost)throw new ProviderError('LOCK_OWNERSHIP_LOST');if(signal?.aborted)throw new ProviderError('WORKER_STOPPED');};
 const lease=async tx=>{const rows=await tx.$queryRaw`SELECT owner_token FROM collector_locks WHERE job_name=${lockName} AND locked_until>${new Date()} FOR UPDATE`;if(rows[0]?.owner_token!==owner)throw new ProviderError('LOCK_OWNERSHIP_LOST');};
 try{
  campaign=await db.collectorRun.findFirst({where:{jobType,provider:'KIS_API'},orderBy:{id:'desc'}});
  if(campaign?.metadata?.from!==from||campaign?.metadata?.actorSchema!==2||(campaign?.metadata?.exchangeScope??'KRX')!==exchangeScope)campaign=null;
  const initial=!campaign;
  if(!campaign)campaign=await db.collectorRun.create({data:{jobType,provider:'KIS_API',metadata:{from,actorSchema:2,exchangeScope,initialUntil:today(),mode:'reverse-pages',naverCollectionEnabled:false}}});
  const securities=await db.security.findMany({where:{isActive:true,collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}},OR:[{buyTrades:{some:{}}},{accountWatchlistItems:{some:{}}}]},include:{buyTrades:{select:{quantity:true,sellTrades:{select:{quantity:true}}}},accountWatchlistItems:{select:{listType:true}}},orderBy:{symbol:'asc'}});
  let items=await db.collectorRunItem.findMany({where:{runId:campaign.id},orderBy:{id:'asc'}});
  const queued=new Set(items.map(item=>`${item.securityId}:${item.symbol}`));
  for(const security of securities.filter(security=>eligible(security)&&(initial||currentlyHeldOrWatched(security)))){
   if(queued.has(`${security.id}:${security.symbol}`))continue;
   const state={state:'PENDING',from,until:today(),cursor:today(),pages:0,rows:0,failures:0,emptyResponses:0,tradingDates:[]};
   const item=await db.collectorRunItem.create({data:{runId:campaign.id,securityId:security.id,symbol:security.symbol,status:'STALE',message:'BACKFILL_PENDING',diagnostics:state}});items.push(item);
  }
  for(const symbol of exchangeScope==='KRX'&&typeof kis.marketFlows==='function'?['KOSPI','KOSDAQ']:[]){
   if(items.some(item=>item.symbol===symbol&&item.securityId==null))continue;
   items.push(await db.collectorRunItem.create({data:{runId:campaign.id,symbol,status:'STALE',message:'BACKFILL_PENDING',diagnostics:{state:'PENDING',targetType:'MARKET',from,until:today(),cursor:today(),pages:0,rows:0,failures:0,emptyResponses:0,tradingDates:[]}}}));
  }
  const mutable=items.map(item=>({...item,diagnostics:{...item.diagnostics}}));
  await db.collectorRun.update({where:{id:campaign.id},data:{metadata:{...campaign.metadata,targetCount:mutable.length,updatedAt:new Date().toISOString()}}});
  for(const item of mutable)if(item.diagnostics.state==='BLOCKED'&&item.diagnostics.retryAfter&&Date.parse(item.diagnostics.retryAfter)<=Date.now()){item.diagnostics.state='PENDING';item.diagnostics.failures=0;item.diagnostics.retryAfter=null;}
  const candidates=mutable.filter(item=>!terminal(item.diagnostics.state)&&(!item.diagnostics.retryAfter||Date.parse(item.diagnostics.retryAfter)<=Date.now()));
  if(candidates.length)log('BACKFILL_STARTED',{runId:String(campaign.id),targets:mutable.length,pending:candidates.length,from});
  let changed=true;
  while(changed&&requests<requestLimit){
   changed=false;
   for(const item of candidates){
    check();if(requests>=requestLimit)break;if(terminal(item.diagnostics.state)||item.diagnostics.state==='BLOCKED'||item.diagnostics.retryAfter&&Date.parse(item.diagnostics.retryAfter)>Date.now())continue;
    let state=item.diagnostics;
    const market=item.diagnostics.targetType==='MARKET';
    const current=market?null:await db.security.findUnique({where:{id:item.securityId}});
    if(!market&&(!current||!eligible(current)||current.symbol!==item.symbol)){
     state.state='PAUSED';await db.collectorRunItem.update({where:{id:item.id},data:{status:'SKIPPED',message:'TARGET_CHANGED_OR_EXCLUDED',diagnostics:state}});continue;
    }
    const pause=Math.max(0,Math.max(2000,requestDelayMs)-(Date.now()-lastRequest));
    if(pause)await wait(pause,undefined,{signal});check();lastRequest=Date.now();requests++;
    try{
     const response=await (market?kis.marketFlows(item.symbol,state.cursor):kis.stockFlows(item.symbol,state.cursor,exchangeScope));
     if(!market&&response.some(row=>row.exchangeScope!==exchangeScope))throw new ProviderError('BACKFILL_EXCHANGE_SCOPE_MISMATCH');
     const page=backfillPage(response,state.cursor,from);check();
     const next={...state,failures:0,retryAfter:null,state:page.complete?'COMPLETE':'PENDING',cursor:page.nextCursor,pages:state.pages+1,rows:state.rows+page.rows.length,oldest:page.oldest??state.oldest??null,tradingDates:[...new Set([...(state.tradingDates??[]),...page.rows.map(row=>row.tradeDate)])].sort()};
     if(!page.oldest){
      next.emptyResponses=(state.emptyResponses??0)+1;next.pages=state.pages;
      // An empty response is verified twice; lack of any history is never marked complete.
      if(next.emptyResponses>=2&&state.pages>0){next.state='EXHAUSTED';next.completionReason='PROVIDER_HISTORY_EXHAUSTED';}
      else if(next.emptyResponses>=2)throw new ProviderError('BACKFILL_NO_HISTORY');
     }else next.emptyResponses=0;
     await db.$transaction(async tx=>{
      await lease(tx);if(!market){await tx.$queryRaw`SELECT id FROM securities WHERE id=${item.securityId} FOR UPDATE`;
      const latest=await tx.security.findUnique({where:{id:item.securityId}});
      if(!latest||!eligible(latest)||latest.symbol!==item.symbol||latest.collectionRevision!==current.collectionRevision)throw new ProviderError('TARGET_CHANGED_OR_EXCLUDED');}
      for(const row of page.rows){
       const {tradeDate,...fields}=row;const data={...fields,targetType:market?'MARKET':'STOCK',targetKey:item.symbol,tradeDate:new Date(tradeDate+'T00:00:00Z')};
       const identity={targetType:market?'MARKET':'STOCK',targetKey:item.symbol,tradeDate:data.tradeDate,source:'KIS_API',exchangeScope:row.exchangeScope,investorCode:row.investorCode};
       await tx.investorFlowDaily.upsert({where:{targetType_targetKey_tradeDate_source_exchangeScope_investorCode:identity},create:data,update:data});
      }
      await tx.collectorRunItem.update({where:{id:item.id},data:{status:terminal(next.state)?'SUCCESS':'STALE',message:next.state==='EXHAUSTED'?'BACKFILL_AVAILABLE_HISTORY_COMPLETE':next.state==='COMPLETE'?'BACKFILL_COMPLETE':'BACKFILL_PROGRESS',observedAt:new Date(),diagnostics:next}});
     },{maxWait:10000,timeout:60000});
     item.diagnostics=next;changed=!terminal(next.state)||changed;
     if(requests%10===0){
      const progress={complete:mutable.filter(item=>terminal(item.diagnostics.state)).length,totalPages:mutable.reduce((sum,item)=>sum+(item.diagnostics.pages??0),0)};
      await db.collectorRun.update({where:{id:campaign.id},data:{metadata:{...campaign.metadata,targetCount:mutable.length,...progress,updatedAt:new Date().toISOString()}}});
      log('BACKFILL_BATCH',{runId:String(campaign.id),requests,...progress});
     }
    }catch(error){
     if(signal?.aborted||['LOCK_OWNERSHIP_LOST','WORKER_STOPPED'].includes(error.code))throw error;
     const code=error instanceof ProviderError?error.code:'BACKFILL_DB_OR_INTERNAL_ERROR';
     const failures=(state.failures??0)+1;
     const retryable=['KIS_CONNECTION_FAILED','KIS_RATE_LIMIT','KIS_REQUEST_FAILED','BACKFILL_DB_OR_INTERNAL_ERROR'].includes(code);
     const next={...state,failures,state:retryable&&failures<3?'PENDING':'BLOCKED',lastError:code,retryAfter:retryable&&failures>=3?new Date(Date.now()+3600000).toISOString():null};
     await db.collectorRunItem.update({where:{id:item.id},data:{status:'FAILED',message:code,observedAt:new Date(),diagnostics:next}});item.diagnostics=next;
     changed=retryable&&failures<3||changed;log('BACKFILL_TARGET_ERROR',{symbol:item.symbol,code});
    }
   }
  }
  const complete=mutable.filter(item=>terminal(item.diagnostics.state)).length;
  const failed=mutable.filter(item=>item.diagnostics.state==='BLOCKED').length;
  const exhausted=mutable.filter(item=>item.diagnostics.state==='EXHAUSTED').length;
  await db.collectorRun.update({where:{id:campaign.id},data:{status:complete===mutable.length?(exhausted?'PARTIAL':'SUCCESS'):'PARTIAL',finishedAt:complete===mutable.length?new Date():null,successCount:complete,failureCount:failed,staleCount:mutable.length-complete-failed,metadata:{...campaign.metadata,targetCount:mutable.length,complete,failed,exhausted,requestsThisSession:requests,totalPages:mutable.reduce((sum,item)=>sum+(item.diagnostics.pages??0),0),updatedAt:new Date().toISOString(),markets:'KIS_MARKET_NET_AMOUNT; QUANTITY_UNIT_UNVERIFIED'}}});
  log('BACKFILL_PROGRESS',{runId:String(campaign.id),targets:mutable.length,complete,failed,requests,totalPages:mutable.reduce((sum,item)=>sum+(item.diagnostics.pages??0),0)});
  return {requests,runId:String(campaign.id),complete,failed,total:mutable.length};
 }finally{
  clearInterval(heartbeat);await db.collectorLock.deleteMany({where:{jobName:lockName,ownerToken:owner}});
 }
}
