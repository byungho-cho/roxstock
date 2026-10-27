import {PageCache} from '../domain/page-cache.js';
import {randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma} from '../generated/prisma/index.js';
import {loadValueRows,type ValueReadRow,type ValueFilter} from './value-rows.js';
import {compactValueCacheRow} from './value-cache-row.js';
const schemaVersion=10;
type Payload={schemaVersion:number;financialRevision:string;revisions:Record<string,string>;rows:ValueReadRow[];priceCacheGeneratedAt:string};
type Entry={revision:string;payload:Payload;generatedAt:Date};
export class ValueReadModel {
 private memory=new Map<number,Entry>();
 private fallbackCache=new PageCache(60_000,12);
 private pending=new Map<number,Promise<{entry:Entry;status:string}>>();
 constructor(private db:PrismaClient,private loader:(year:number,ids?:bigint[],previous?:Parameters<typeof loadValueRows>[2],filter?:ValueFilter)=>ReturnType<typeof loadValueRows>=(year,ids,previous,filter)=>loadValueRows(year,ids,previous,db,filter)){}
 clear(){this.memory.clear();this.pending.clear();this.fallbackCache.clear();}
 private async revision(){return (await this.db.analysisRevision.findUnique({where:{key:'financial'}}))?.revision.toString()??'0';}
 private async stored(year:number){
  const row=await this.db.analysisReadCache.findUnique({where:{key:`value:${year}`}});
  const payload=row?.payload as unknown as Payload;
  return row&&payload&&[1,2,3,4,5,6,7,8,9,schemaVersion].includes(payload.schemaVersion)&&Array.isArray(payload.rows)&&typeof payload.financialRevision==='string'&&payload.revisions?{...row,payload}:undefined;
 }
 async get(year:number,filter?:ValueFilter){
  const memory=this.memory.get(year);
  const revision=await this.revision();
  const stamp=memory?await this.db.analysisReadCache.findUnique({where:{key:`value:${year}`},select:{revision:true}}):undefined;
  if(memory?.payload.schemaVersion===schemaVersion&&memory.payload.financialRevision===revision&&stamp?.revision===memory.revision)return {rows:memory.payload.rows,meta:this.meta(memory,'HIT')};
  const previous=memory&&stamp?.revision===memory.revision?memory:await this.stored(year);
  if(previous?.payload.schemaVersion===schemaVersion&&previous.payload.financialRevision===revision){this.remember(year,previous);return {rows:previous.payload.rows,meta:this.meta(previous,'PERSISTED_HIT')};}
  if(!previous){
   // No daily snapshot (including first startup): use the existing stored-data query, never collect externally.
   const key=JSON.stringify([year,revision,filter]);
   const cached=await this.fallbackCache.get(key,async()=>(await this.loader(year,undefined,undefined,filter)).map(compactValueCacheRow));
   return {rows:cached.value,meta:{status:'FALLBACK',queryCacheStatus:cached.status,generatedAt:null,priceCacheGeneratedAt:null,financialRevision:revision}};
  }
  try{const {entry,status}=await this.refresh(year,false,previous);return {rows:entry.payload.rows,meta:this.meta(entry,status)};}
  catch(error){return {rows:previous.payload.rows,meta:{...this.meta(previous,'STALE'),refreshError:'CACHE_REFRESH_FAILED'}};}
 }
 private meta(entry:Entry,status:string){return {status,generatedAt:entry.generatedAt.toISOString(),priceCacheGeneratedAt:entry.payload.priceCacheGeneratedAt,financialRevision:entry.payload.financialRevision};}
 private remember(year:number,entry:Entry){if(this.memory.size>=12)this.memory.delete(this.memory.keys().next().value!);this.memory.set(year,entry);}
 async snapshotRow(year:number,id:string){return await this.stored(year)?(await this.get(year)).rows.find(r=>r.id===id):undefined;}
 async warm(year:number,failedSymbols:string[]=[]){const raw=await this.db.analysisReadCache.findUnique({where:{key:`value:${year}`}});const previous=raw?{...raw,payload:raw.payload as unknown as Payload}:undefined;return this.refresh(year,true,previous,failedSymbols);}
 private refresh(year:number,prices:boolean,previous?:Entry,failedSymbols:string[]=[]):Promise<{entry:Entry;status:string}>{
  // Share identical work; a price generation waits for financial refresh then explicitly starts its own generation.
  const pending=this.pending.get(year);
  if(pending)return prices?pending.then(()=>this.refresh(year,true,this.memory.get(year),failedSymbols)):pending;
  const work=this.build(year,prices,previous,failedSymbols).finally(()=>{if(this.pending.get(year)===work)this.pending.delete(year);});
  this.pending.set(year,work);return work;
 }
 private async build(year:number,prices:boolean,previous?:Entry,failedSymbols:string[]=[]){
  const before=await this.revision();
  const versions=await this.db.analysisRevision.findMany({where:{key:{startsWith:'security:'}}});
  const revisions=Object.fromEntries(versions.map(r=>[r.key.slice(9),r.revision.toString()]));
  const dirty=previous&&!prices?Object.keys(revisions).filter(id=>previous.payload.revisions[id]!==revisions[id]):[];
  const ids=!prices&&previous&&previous.payload.schemaVersion===schemaVersion?dirty.map(id=>BigInt(id)):undefined;
  const updated=await this.loader(year,ids,!prices&&previous?new Map(previous.payload.rows.map(r=>[r.id,r])):undefined);
  const priceFailures=new Set(failedSymbols);
  if(prices)for(const row of updated)if(priceFailures.has(row.symbol)){row.collectionErrors.push('PRICE_COLLECTION_FAILED_LAST_VALUE_RETAINED');row.collectionStatus='ERROR';}
  const rows=(ids&&previous?[...previous.payload.rows.filter(r=>!dirty.includes(r.id)),...updated]:updated).map(compactValueCacheRow);
  if(await this.revision()!==before)throw new Error('FINANCIAL_REVISION_CHANGED_DURING_BUILD');
  const generatedAt=new Date(),entry:Entry={revision:randomUUID(),generatedAt,payload:{schemaVersion,financialRevision:before,revisions,rows,priceCacheGeneratedAt:prices||!previous?generatedAt.toISOString():previous.payload.priceCacheGeneratedAt}};
  const data={revision:entry.revision,payload:entry.payload as unknown as Prisma.InputJsonValue,generatedAt};
  if(previous){
   const result=await this.db.analysisReadCache.updateMany({where:{key:`value:${year}`,revision:previous.revision},data});
   if(result.count!==1){const winner=await this.stored(year);if(!winner)throw new Error('CACHE_GENERATION_REPLACED');this.remember(year,winner);return {entry:winner,status:'COALESCED'};}
  }else await this.db.analysisReadCache.create({data:{key:`value:${year}`,...data}});
  this.remember(year,entry);return {entry,status:prices?'REBUILT':'REFRESHED'};
 }
}
/** Called only by the evening whole-market collector, never the realtime holding-price worker. */
export async function warmValueCaches(db:PrismaClient,failedSymbols:string[]=[] ){
 const current=Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4));
 const stored=await db.analysisReadCache.findMany({where:{key:{startsWith:'value:'}},select:{key:true}});
 const model=new ValueReadModel(db);
 for(const year of new Set([current,...stored.map(r=>Number(r.key.slice(6))).filter(y=>y>=2015&&y<=current)]))await model.warm(year,failedSymbols);
}
