import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {relatedTargets,type NewsTarget} from '@roxstock/shared/news/policy';
import {newsTargets} from '@roxstock/shared/news/targets';
import {PrismaCollectorRepository} from './repository.js';

// A provider's explicit company code is stronger evidence than a partial name.
export function explicitReportSymbol(title:string){return /^.{1,120}?\((\d{6})\)/u.exec(title)?.[1]??null;}
export function reportTargetIds(title:string,targets:NewsTarget[]){
 const symbol=explicitReportSymbol(title);
 return symbol?targets.filter(t=>t.symbol===symbol).map(t=>t.id):relatedTargets(title,targets);
}
const trusted=(row:{providerId:string;originalUrl:string})=>{
 try{const url=new URL(row.originalUrl);return url.protocol==='https:'&&url.hostname==='consensus.hankyung.com'&&url.pathname==='/analysis/downpdf'&&url.searchParams.get('report_idx')===row.providerId;}catch{return false;}
};

/** One bounded, idempotent DB-only maintenance batch. No source/summary calls. */
export async function reconcileReportIdentities(db:PrismaClient){
 const owner=randomUUID(),repo=new PrismaCollectorRepository(db),job='stock-news';
 if(!await repo.acquireLock(job,owner,120))return {status:'LOCKED' as const};
 try{
  const news=await db.stockNewsItem.findMany({where:{provider:'HANKYUNG_CONSENSUS',materialType:'REPORT'},include:{securities:{take:100,include:{security:{select:{id:true,symbol:true}}}}},orderBy:{id:'asc'},take:100});
  const candidates=await db.stockNewsCandidate.findMany({where:{provider:'HANKYUNG_CONSENSUS'},orderBy:{canonicalHash:'asc'},take:200});
  const result=await db.$transaction(async tx=>{
   const [lease]=await tx.$queryRaw<{owner_token:string;valid:number}[]>`SELECT owner_token,(locked_until>UTC_TIMESTAMP(3)) AS valid FROM collector_locks WHERE job_name=${job} FOR UPDATE`;
   if(lease?.owner_token!==owner||!lease.valid)throw Error('NEWS_LEASE_LOST');
   let relationsRemoved=0,candidatesCorrected=0;
   const corrections:{providerId:string;newsId:string;securityIds:string[];removed:number}[]=[],candidateCorrections:{canonicalHash:string;oldSecurityIds:string[];oldStatus:string;oldReason:string|null}[]=[];
   for(const item of news){
    const symbol=explicitReportSymbol(item.title);if(!symbol||!trusted(item))continue;
    const wrong=item.securities.filter(r=>r.security.symbol!==symbol).map(r=>r.securityId);
    if(wrong.length){const count=(await tx.stockNewsSecurity.deleteMany({where:{newsId:item.id,securityId:{in:wrong}}})).count;relationsRemoved+=count;corrections.push({providerId:item.providerId,newsId:String(item.id),securityIds:wrong.map(String),removed:count});}
   }
   for(const row of candidates){
    const payload=row.payload as any,symbol=explicitReportSymbol(String(payload?.title??''));if(!symbol||!trusted({providerId:row.providerId,originalUrl:String(payload?.originalUrl??'')})||!Array.isArray(payload.securityIds))continue;
    if(payload.securityIds.length>100||payload.securityIds.some((id:unknown)=>typeof id!=='string'||!/^\d+$/.test(id)))continue;
    const ids=payload.securityIds as string[],valid=await tx.security.findMany({where:{id:{in:ids.map(BigInt)},symbol},select:{id:true}}),allowed=new Set(valid.map(r=>String(r.id))),kept=ids.filter(id=>allowed.has(id));
    if(kept.length!==ids.length){candidateCorrections.push({canonicalHash:row.canonicalHash,oldSecurityIds:ids,oldStatus:row.status,oldReason:row.reason});await tx.stockNewsCandidate.update({where:{canonicalHash:row.canonicalHash},data:{payload:{...payload,securityIds:kept},...(row.status==='DEFERRED'&&!kept.length?{status:'EXCLUDED',reason:'NOT_RELATED_EXPLICIT_REPORT_SYMBOL'}:{reason:'EXPLICIT_REPORT_SYMBOL_RECONCILED'}),lastCheckedAt:new Date()}});candidatesCorrected++;}
   }
   const run=await tx.collectorRun.create({data:{jobType:'stock-news-maintenance',provider:'REPORT_IDENTITY',status:'SUCCESS',finishedAt:new Date(),successCount:relationsRemoved,metadata:{kind:'REPORT_SYMBOL_RECONCILIATION',policy:'news-report-code-v1',newsChecked:news.length,candidatesChecked:candidates.length,relationsRemoved,candidatesCorrected,corrections,candidateCorrections,sourceCalls:0}}});
   return {status:'SUCCESS' as const,runId:String(run.id),newsChecked:news.length,candidatesChecked:candidates.length,relationsRemoved,candidatesCorrected,corrections:corrections.map(({providerId,removed})=>({providerId,removed})),sourceCalls:0,moreNewsPossible:news.length===100,moreCandidatesPossible:candidates.length===200,moreRelationsPossible:news.some(item=>item.securities.length===100)};
  },{timeout:30000});
  const ids=['653074','653075','653078'];
  const [items,pending]=await Promise.all([db.stockNewsItem.findMany({where:{provider:'HANKYUNG_CONSENSUS',providerId:{in:ids}},select:{providerId:true}}),db.stockNewsCandidate.findMany({where:{provider:'HANKYUNG_CONSENSUS',providerId:{in:ids}},select:{providerId:true,status:true,reason:true,publishedAt:true,expiresAt:true,lastCheckedAt:true},take:10})]);
  const targets=await newsTargets(db),mappingMissing=targets.filter(t=>!['ETF','ETN'].includes(t.securityType??'STOCK')&&!t.corpCode).map(t=>({symbol:t.symbol,securityType:t.securityType??'STOCK'}));
  return {...result,mappingMissing,reports:ids.map(providerId=>({providerId,stored:items.some(i=>i.providerId===providerId),candidate:pending.find(p=>p.providerId===providerId)??null}))};
 }finally{await repo.releaseLock(job,owner);}
}
