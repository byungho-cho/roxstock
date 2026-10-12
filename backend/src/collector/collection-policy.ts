import {AsyncLocalStorage} from 'node:async_hooks';
import type {PrismaClient, Prisma, Security} from '../generated/prisma/index.js';
import {normalizeSecuritySymbol} from '../domain/security-symbol.js';

export const collectionFeatures=['realtime-prices','market-prices','dart-financial-statements','share-counts','consensus','valuation','security-master'] as const;
export type CollectionFeature=typeof collectionFeatures[number];
export type CollectionIdentity={id:bigint;symbol:string;collectionRevision:number};
type Policy=Pick<Security,'symbol'|'collectionExcluded'|'excludedFeatures'|'collectionRevision'>;
export class CollectionExcluded extends Error {readonly code='COLLECTION_EXCLUDED';constructor(message:string,readonly exclusionScope:'ALL'|'FEATURE'|'IDENTITY'='ALL',readonly feature?:CollectionFeature){super(message);}}
export function componentExcluded(error:unknown){const scope=context.getStore();return error instanceof CollectionExcluded&&error.exclusionScope==='FEATURE'&&error.feature!==scope?.feature;}
export function exclusionReason(security:Policy,feature?:CollectionFeature):string|null {
 if(normalizeSecuritySymbol(security.symbol).startsWith('Z99'))return 'Z99 코드: 모든 외부 수집에서 자동 제외';
 if(security.collectionExcluded)return '사용자 설정: 모든 외부 수집에서 제외';
 if(feature&&Array.isArray(security.excludedFeatures)&&security.excludedFeatures.includes(feature))return '사용자 설정: 해당 기능 수집에서 제외';
 return null;
}
export function eligibleWhere(feature:CollectionFeature):Prisma.SecurityWhereInput {
 return {AND:[{isActive:true,NOT:{symbol:{startsWith:'Z99'}},collectionExcluded:false},{OR:[{excludedFeatures:{equals:PrismaNull()}},{NOT:{excludedFeatures:{array_contains:feature}}}]}]};
}
// JSON SQL NULL and an absent feature both mean enabled. Filter existing feature arrays at SQL level.
import {Prisma as RuntimePrisma} from '../generated/prisma/index.js';
const PrismaNull=()=>RuntimePrisma.DbNull;
const context=new AsyncLocalStorage<{db:PrismaClient;identity:CollectionIdentity;feature:CollectionFeature;inTransaction?:boolean}|undefined>();
export const collectionContext=()=>context.getStore();
export async function collectionIdentity(db:PrismaClient,id:bigint,feature:CollectionFeature,expected?:Partial<CollectionIdentity>):Promise<CollectionIdentity>{
 const security=await db.security.findUnique({where:{id}});
 if(!security||security.isActive===false)throw new CollectionExcluded('종목을 찾을 수 없어 수집에서 제외');
 const reason=exclusionReason(security,feature);
 if(reason)throw new CollectionExcluded(reason,security.collectionExcluded||normalizeSecuritySymbol(security.symbol).startsWith('Z99')?'ALL':'FEATURE',feature);
 if(expected?.symbol&&normalizeSecuritySymbol(expected.symbol)!==security.symbol||expected?.collectionRevision!==undefined&&expected.collectionRevision!==security.collectionRevision)throw new CollectionExcluded('종목코드 또는 수집 설정 변경: 이전 요청 결과 제외','IDENTITY');
 return {id,symbol:security.symbol,collectionRevision:security.collectionRevision};
}
export async function withCollection<T>(db:PrismaClient,id:bigint,feature:CollectionFeature,work:()=>Promise<T>,expected?:Partial<CollectionIdentity>):Promise<T>{
 const prior=context.getStore();
 const inherited=prior?.identity.id===id?prior.identity:undefined;
 const token={...inherited,...Object.fromEntries(Object.entries(expected??{}).filter(([,v])=>v!==undefined))};
 const identity=await collectionIdentity(db,id,feature,token);
 return context.run({db,identity,feature},async()=>{try{return await work();}catch(error){if(!(error instanceof CollectionExcluded))await collectionIdentity(db,id,feature,identity);throw error;}});
}
export async function checkCollection(feature?:CollectionFeature){
 const scope=context.getStore();if(scope)await collectionIdentity(scope.db,scope.identity.id,feature??scope.feature,scope.identity);
}
export const collectionFetch=(fetcher:typeof fetch,feature?:CollectionFeature):typeof fetch=>async(input,init)=>{
 await checkCollection(feature);let result:Response;try{result=await fetcher(input,init);}catch(error){await checkCollection(feature);throw error;}await checkCollection(feature);return result;
};
export const withoutCollection=<T>(work:()=>Promise<T>)=>context.run(undefined,work);
export async function lockCollection(tx:Prisma.TransactionClient,feature?:CollectionFeature){
 const scope=context.getStore();if(!scope)return;
 await tx.$queryRaw`SELECT id FROM securities WHERE id=${scope.identity.id} FOR UPDATE`;
 await collectionIdentity(tx as PrismaClient,scope.identity.id,feature??scope.feature,scope.identity);
}
export const inCollectionTransaction=<T>(work:()=>Promise<T>)=>{
 const scope=context.getStore();return scope?context.run({...scope,inTransaction:true},work):work();
};
