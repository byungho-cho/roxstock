import type {PrismaClient,LivePriceAlert} from '@roxstock/shared/prisma';
import {freshAlertTrade,matchesPrice,type PriceDirection} from '@roxstock/shared/domain/live-price-alerts';
import {quoteLimit,type LiveQuote,type QuoteMarket} from '@roxstock/shared/domain/live-quotes';
import {KisLiveService,marketOpen} from './kis-live.js';

/** One observer on the existing socket. Persist boundaries and events, never a tick history. */
export class LivePriceAlerts {
 private rows:LivePriceAlert[]=[];
 private symbols=new Map<string,string>();
 private revisions=new Map<string,number>();
 private timer?:ReturnType<typeof setInterval>;
 private detach?:()=>void;
 private loading?:Promise<void>;
 private queue=Promise.resolve();
 private pending=0;
 private lastTicks=new Map<string,{at:number;sequence:string|null}>();
 private stopped=false;
 degraded=false;
 constructor(private db:PrismaClient,private live:KisLiveService){}
 revision(userId:bigint){return this.revisions.get(String(userId))??0;}
 changed(userId:bigint){this.revisions.set(String(userId),this.revision(userId)+1);}
 async reload():Promise<void>{
  if(this.loading){await this.loading;return this.reload();}
  this.loading=(async()=>{
   const rows=await this.db.livePriceAlert.findMany({where:{enabled:true,deletedAt:null},orderBy:{id:'asc'}});
   const securities=await this.db.security.findMany({where:{id:{in:[...new Set(rows.map(r=>r.securityId))]},isActive:true},select:{id:true,symbol:true}});
   this.symbols=new Map(securities.map(s=>[String(s.id),s.symbol]));this.rows=rows;
   this.live.monitor([...new Set(rows.flatMap(r=>{const symbol=this.symbols.get(String(r.securityId));return symbol?[`${r.market}:${symbol}`]:[];}))]);
  })();
  try{await this.loading;}finally{this.loading=undefined;}
 }
 async start(){
  this.detach=this.live.onTrade(q=>{void this.enqueue(q);});
  this.timer=setInterval(()=>void this.reload().catch(()=>{this.degraded=true;}),5000);this.timer.unref();
  await this.reload();
 }
 async close(){this.stopped=true;clearInterval(this.timer);this.detach?.();await this.queue;this.live.monitor([]);}
 enqueue(q:LiveQuote){
  if(this.stopped)return Promise.resolve();
  if(this.pending>=2048){this.degraded=true;return Promise.resolve();}
  this.pending++;const task=this.queue.then(()=>this.process(q));
  this.queue=task.catch(()=>{this.degraded=true;}).finally(()=>{this.pending--;});return this.queue;
 }
 async process(q:LiveQuote,now=new Date()){
  if(!marketOpen(q.market,now)||!freshAlertTrade(q,new Date(0),now))return;
  const key=q.market+':'+q.symbol,at=Date.parse(q.observedAt),sequence=q.sequence??null,prior=this.lastTicks.get(key);
  if(prior&&(at<prior.at||at===prior.at&&sequence&&prior.sequence&&BigInt(sequence)<=BigInt(prior.sequence)))return;
  this.lastTicks.set(key,{at,sequence});
  if(this.lastTicks.size>quoteLimit*2)this.lastTicks.delete(this.lastTicks.keys().next().value!);
  const candidates=this.rows.filter(r=>r.market===q.market&&this.symbols.get(String(r.securityId))===q.symbol);
  for(const cached of candidates){
   if(!cached.enabled||cached.pausedUntil&&cached.pausedUntil>now||!freshAlertTrade(q,cached.eligibleAfter,now))continue;
   const observed=new Date(q.observedAt),sequence=q.sequence??null;
   if(cached.lastObservedAt&&(observed<cached.lastObservedAt||+observed===+cached.lastObservedAt&&sequence&&cached.lastSequence&&BigInt(sequence)<=BigInt(cached.lastSequence)))continue;
   const inside=matchesPrice(q.price,Number(cached.amount),cached.direction as PriceDirection);
   if(cached.inside===inside)continue;
   let result:LivePriceAlert|undefined,eventAdded=false;
   await this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM live_price_alerts WHERE id=${cached.id} FOR UPDATE`;
    const row=await tx.livePriceAlert.findUnique({where:{id:cached.id}});
    if(!row||row.version!==cached.version||!row.enabled||row.deletedAt||row.pausedUntil&&row.pausedUntil>now||!freshAlertTrade(q,row.eligibleAfter,now))return;
    if(row.lastObservedAt&&(observed<row.lastObservedAt||+observed===+row.lastObservedAt&&sequence&&row.lastSequence&&BigInt(sequence)<=BigInt(row.lastSequence)))return;
    if(row.inside===inside){result=row;return;}
    result=await tx.livePriceAlert.update({where:{id:row.id},data:{inside,lastObservedAt:observed,lastSequence:sequence}});
    if(inside){
     const openKey=String(row.id),pending=await tx.livePriceAlertEvent.findUnique({where:{openKey}});
     if(!pending){await tx.livePriceAlertEvent.create({data:{userId:row.userId,conditionId:row.id,openKey,securityId:row.securityId,market:row.market,direction:row.direction,amount:row.amount,price:q.price,change:q.change,rate:q.rate,observedAt:observed,createdAt:now}});eventAdded=true;}
    }
   });
   if(result)Object.assign(cached,result);
   if(eventAdded)this.changed(cached.userId);
  }
 }
 status(userId:bigint){return {healthy:!this.degraded,capacity:quoteLimit,monitoring:this.rows.filter(r=>r.userId===userId).length,background:'SERVER_INBOX',systemPush:false,sourceConnection:this.live.state,activeWindow:this.rows.some(r=>r.userId===userId&&marketOpen(r.market as QuoteMarket))};}
}
