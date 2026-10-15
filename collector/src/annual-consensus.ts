import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {collectionFetch,CollectionExcluded,withCollection} from '@roxstock/shared/collection/collection-policy';
import { Prisma, type PrismaClient } from '@roxstock/shared/prisma';
import { getSeoulClock } from '@roxstock/shared/collection/time';
import {decimal,validateConsensus,consensusRatios,type AnnualConsensus} from '@roxstock/shared/collection/consensus-math';
export {validateConsensus,consensusRatios,type AnnualConsensus} from '@roxstock/shared/collection/consensus-math';
/** Only a licensed, documented provider adapter is accepted; no fallback scraping or TTM substitution. */
export async function fetchAnnualConsensus(symbol:string,now=new Date(),fetcher:typeof fetch=fetch){
 const year=Number(getSeoulClock(now).dateKey.slice(0,4));
 if(process.env.CONSENSUS_TERMS_APPROVED!=='true'||!process.env.CONSENSUS_TERMS_URL)throw new Error('CONSENSUS_TERMS_NOT_APPROVED');
 const endpoint=process.env.CONSENSUS_PROVIDER_URL;if(!endpoint)throw new Error('CONSENSUS_PROVIDER_NOT_CONFIGURED');
 const url=new URL(endpoint);if(url.protocol!=='https:')throw new Error('CONSENSUS_ENDPOINT_INVALID');url.searchParams.set('symbol',symbol);url.searchParams.set('fiscalYear',String(year));
 let response:Response;try{response=await collectionFetch(fetcher,'consensus')(url,{headers:{accept:'application/json',...(process.env.CONSENSUS_API_KEY?{authorization:`Bearer ${process.env.CONSENSUS_API_KEY}`}:{})},signal:AbortSignal.timeout(15000)});}catch(error){if(error instanceof CollectionExcluded)throw error;throw new Error('CONSENSUS_COMMUNICATION');}
 if(!response.ok)throw new Error(response.status===401?'CONSENSUS_AUTH':response.status===403?'CONSENSUS_PERMISSION':response.status===429?'CONSENSUS_RATE_LIMIT':'CONSENSUS_HTTP');
 let body:unknown;try{body=await response.json();}catch{throw new Error('CONSENSUS_RESPONSE_PARSE');}
 return validateConsensus(body,symbol,year);
}
export async function collectAnnualConsensus(db:PrismaClient,securityId:bigint,symbol:string){
 db=collectionClient(db);
 return withCollection(db,securityId,'consensus',async()=>{
 if(process.env.CONSENSUS_ENABLED!=='true')return {status:'NOT_CONFIGURED',code:'CONSENSUS_DISABLED'};
 if(!(process.env.KRX_VALIDATED_SYMBOLS??'005930').split(',').includes(symbol))return {status:'NOT_VALIDATED',code:'SAMSUNG_FIRST_ROLLOUT'};
 try{
 const year=Number(getSeoulClock().dateKey.slice(0,4));
 const fresh=await db.annualConsensusSnapshot.findFirst({where:{securityId,fiscalYear:year,state:'ESTIMATED',collectedAt:{gte:new Date(Date.now()-3600000)}}});
 if(fresh)return {status:'CURRENT',fiscalYear:year};
 const snapshot=await fetchAnnualConsensus(symbol);
 const key={securityId_fiscalYear_source_asOf:{securityId,fiscalYear:snapshot.fiscalYear,source:snapshot.source,asOf:new Date(snapshot.asOf)}};
 await db.annualConsensusSnapshot.upsert({where:key,create:{securityId,fiscalYear:snapshot.fiscalYear,source:snapshot.source,asOf:new Date(snapshot.asOf),data:snapshot as unknown as Prisma.InputJsonValue},update:{}});
 return {status:'COLLECTED',fiscalYear:snapshot.fiscalYear};
 }catch(error){if(error instanceof CollectionExcluded)throw error;const safe=error instanceof Error&&/^CONSENSUS_[A-Z_]+$/.test(error.message)?error.message:'CONSENSUS_COLLECTION_FAILED';return {status:'UNAVAILABLE',code:safe};}
 },{symbol});
}
/** Freeze only a verified historical close. Final values are separate from the preserved estimate payload. */
export async function settleAnnualConsensus(db:PrismaClient,securityId:bigint,year:number,finalValues:unknown,close:{value:string;date:string;source:string}|undefined,complete:boolean){
 if(!close||!/^\d{4}-\d{2}-\d{2}$/.test(close.date)||Number.isNaN(Date.parse(close.date))||!decimal(close.value)?.gt(0)||year>=Number(getSeoulClock().dateKey.slice(0,4))||(Date.parse(`${year}-12-31`)-Date.parse(close.date))/86400000<0||(Date.parse(`${year}-12-31`)-Date.parse(close.date))/86400000>7||close.source!=='KRX_UNADJUSTED_CLOSE')return;
 const where={securityId,fiscalYear:year,state:'ESTIMATED'};
 await db.annualConsensusSnapshot.updateMany({where:{...where,frozenClose:{equals:Prisma.DbNull}},data:{frozenClose:close as Prisma.InputJsonValue}});
 if(complete){
  const stored=await db.annualConsensusSnapshot.findFirst({where,select:{frozenClose:true}});
  const frozen=stored?.frozenClose as {value:string;date:string;source:string}|null;
  const incoming=finalValues as {values:Record<string,string|null>;provenance?:Record<string,unknown>};
  const eps=decimal(incoming.values?.eps),bps=decimal(incoming.values?.bps),price=decimal(frozen?.value);
  if(!frozen||!price?.gt(0)||!incoming.values)return;
  const final={...incoming,values:{...incoming.values,per:incoming.values.per!==null&&eps?.gt(0)?price.div(eps).toDecimalPlaces(4).toString():null,pbr:incoming.values.pbr!==null&&bps?.gt(0)?price.div(bps).toDecimalPlaces(4).toString():null},provenance:{...incoming.provenance,priceDate:frozen.date,priceSource:frozen.source,pricePolicy:'FIXED_YEAR_END_CLOSE'}};
  await db.annualConsensusSnapshot.updateMany({where,data:{state:'FINALIZED',finalValues:final as Prisma.InputJsonValue,finalizedAt:new Date()}});
 }
}
/** Run independently of filing availability: a year-end close is fixed before next year's annual filing. */
export async function freezePastEstimates(db:PrismaClient,securityId:bigint,symbol:string,market:string){
 db=collectionClient(db);
 return withCollection(db,securityId,'consensus',async()=>{
 if(process.env.CONSENSUS_ENABLED!=='true')return;
 const currentYear=Number(getSeoulClock().dateKey.slice(0,4));
 const snapshots=await db.annualConsensusSnapshot.findMany({where:{securityId,state:'ESTIMATED',fiscalYear:{lt:currentYear},frozenClose:{equals:Prisma.DbNull}},distinct:['fiscalYear'],select:{fiscalYear:true}});
 const {historicalClose}=await import('./historical-close.js');
 for(const snapshot of snapshots){
  try{await settleAnnualConsensus(db,securityId,snapshot.fiscalYear,{},await historicalClose(symbol,new Date(`${snapshot.fiscalYear}-12-31`),fetch,market),false);}
  catch{console.warn(JSON.stringify({event:'consensus_year_end_unavailable',securityId:String(securityId),year:snapshot.fiscalYear}));break;}
 }
 },{symbol});
}
