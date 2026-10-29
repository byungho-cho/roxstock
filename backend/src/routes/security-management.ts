import {invalidateSecurityCaches} from '../domain/security-cache-revision.js';
import type {FastifyInstance} from 'fastify';
import {Prisma} from '@roxstock/shared/prisma';
import {prisma} from '../auth/scoped-db.js';
import {serializable} from '../lib/transaction.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';
import {normalizeSecuritySymbol,isSecuritySymbol} from '@roxstock/shared/domain/security-symbol';
import {collectionFeatures,exclusionReason,type CollectionFeature} from '@roxstock/shared/collection/collection-policy';
import {realtimePriceCache} from '../realtime/price-cache.js';
import {securityUsageReasons as usageReasons} from '../domain/security-usage.js';
type Query={query?:string;cursor?:string};
const publicSecurity=(s:any)=>({id:String(s.id),symbol:s.symbol,name:s.name,marketType:s.marketType,listingYear:s.listingYear,isActive:s.isActive,registrationSource:s.registrationSource,canCorrectCode:s.registrationSource==='MANUAL',collectionExcluded:s.collectionExcluded,excludedFeatures:Array.isArray(s.excludedFeatures)?s.excludedFeatures:[],automaticExclusion:s.symbol.startsWith('Z99'),exclusionReason:exclusionReason(s),collectionRevision:s.collectionRevision});
const missing=()=>new ApiError(404,'SECURITY_NOT_FOUND','종목을 찾을 수 없습니다.');
export async function securityManagementRoutes(app:FastifyInstance){
 app.get<{Querystring:Query}>('/security-management',async request=>{
  const search=request.query.query?.trim()??'';if(search.length>100)throw new ApiError(400,'INVALID_INPUT','검색어가 너무 깁니다.');
  let cursor:{name:string;id:string;query:string;ceiling:string}|undefined;
  if(request.query.cursor)try{cursor=JSON.parse(Buffer.from(request.query.cursor,'base64url').toString());if(!cursor||cursor.query!==search||typeof cursor.name!=='string'||!/^\d+$/.test(cursor.id)||!/^\d+$/.test(cursor.ceiling))throw Error();}catch{throw new ApiError(400,'INVALID_CURSOR','페이지 조건이 올바르지 않습니다.');}
  const where:Prisma.SecurityWhereInput={isActive:true,...(search?{OR:[{symbol:{contains:normalizeSecuritySymbol(search)}},{name:{contains:search}}]}:{})};
  const ceiling=cursor?BigInt(cursor.ceiling):(await prisma.security.aggregate({where,_max:{id:true}}))._max.id??0n;
  const rows=await prisma.security.findMany({where:{AND:[where,{id:{lte:ceiling}},...(cursor?[{OR:[{name:{gt:cursor.name}},{name:cursor.name,id:{gt:BigInt(cursor.id)}}]}]:[])]},orderBy:[{name:'asc'},{id:'asc'}],take:51});
  const visible=rows.slice(0,50),last=visible.at(-1),hasNext=rows.length>50;
  return {data:{rows:visible.map(publicSecurity),hasNext,nextCursor:hasNext&&last?Buffer.from(JSON.stringify({name:last.name,id:String(last.id),query:search,ceiling:String(ceiling)})).toString('base64url'):null}};
 });
 app.get<{Params:{id:string}}>('/security-management/:id',async request=>{
  const securityId=id(request.params.id,'id'),security=await prisma.security.findUnique({where:{id:securityId}});if(!security)throw missing();
  const reasons=await usageReasons(prisma,securityId);
  const history=await prisma.securityCodeHistory.findMany({where:{securityId},select:{id:true,previousSymbol:true,newSymbol:true,createdAt:true},orderBy:{id:'desc'}});
  return {data:{...publicSecurity(security),deleteBlockedReasons:reasons,codeHistory:history.map(r=>({...r,id:String(r.id),createdAt:r.createdAt.toISOString()}))}};
 });
 app.patch<{Params:{id:string};Body:{name?:unknown;symbol?:unknown;listingYear?:unknown;confirmCodeChange?:unknown}}>('/security-management/:id',async request=>{
  const securityId=id(request.params.id,'id'),body=request.body??{};
  const result=await serializable(async tx=>{
   await tx.$queryRaw`SELECT id FROM securities WHERE id=${securityId} FOR UPDATE`;
   const s=await tx.security.findUnique({where:{id:securityId}});if(!s)throw missing();
   const name=body.name===undefined?s.name:typeof body.name==='string'?body.name.trim():'';
   const symbol=body.symbol===undefined?s.symbol:typeof body.symbol==='string'?normalizeSecuritySymbol(body.symbol):'';
   if(!name||name.length>100||!isSecuritySymbol(symbol))throw new ApiError(400,'INVALID_INPUT','종목명과 영문·숫자 6자리 코드를 확인하세요.');
   const changed=symbol!==normalizeSecuritySymbol(s.symbol);
   if(changed&&s.registrationSource!=='MANUAL')throw new ApiError(403,'CODE_CORRECTION_FORBIDDEN','사용자 등록이 확인된 종목만 코드를 정정할 수 있습니다.');
   if(changed&&body.confirmCodeChange!==true)throw new ApiError(400,'CODE_CONFIRMATION_REQUIRED','종목코드 변경 안내를 확인하세요.');
   const duplicate=await tx.security.findFirst({where:{symbol,id:{not:securityId}},select:{id:true}});if(duplicate)throw new ApiError(409,'DUPLICATE_SECURITY_CODE','이미 등록된 종목코드입니다.');
   let listingYear=s.listingYear;
   if(body.listingYear!==undefined){listingYear=body.listingYear===null||body.listingYear===''?null:Number(body.listingYear);if(listingYear!==null&&(!Number.isInteger(listingYear)||listingYear<1900||listingYear>new Date().getFullYear()))throw new ApiError(400,'INVALID_INPUT','상장연도를 확인하세요.');}
   if(changed){
    const saved=await tx.security.findUnique({where:{id:securityId},include:{marketPrice:true,financialStatements:true,valuationMetrics:true,periodValuations:true,annualConsensusSnapshots:true,fundamentals:true,dartFinancialFilings:true,dartShareSnapshots:true,dartCorpMapping:true,dartSecurityState:true,dartBackfillTasks:true,dartDailyCompanyChecks:true}});
    const preservedData=JSON.parse(JSON.stringify(saved,(_key,value)=>typeof value==='bigint'?value.toString():value));
    await tx.securityCodeHistory.create({data:{securityId,previousSymbol:s.symbol,newSymbol:symbol,codeRevision:s.codeRevision,preservedData}});
    // These are mutable dispatch queues, not the immutable execution/target history. Preserve their old state above.
    await tx.dartBackfillTask.updateMany({where:{securityId},data:{status:'PENDING',attempts:0,processedAt:null,lastAttemptAt:null,nextAttemptAt:null,selectedReceiptNo:null,errorCode:null,errorMessage:null,diagnostics:Prisma.DbNull}});
    await tx.dartSecurityState.updateMany({where:{securityId},data:{backfillStartedAt:null,backfillCompletedAt:null,priorityCheckedAt:null,universeCheckedAt:null,lastError:null}});
   }
   return tx.security.update({where:{id:securityId},data:{name,symbol,listingYear,...(changed?{codeRevision:{increment:1},collectionRevision:{increment:1},codeChangedAt:new Date()}: {})}});
  });
  invalidateSecurityCaches();realtimePriceCache.removeSecurity(String(securityId));return {data:publicSecurity(result)};
 });
 app.patch<{Params:{id:string};Body:{feature?:unknown;excluded?:unknown;confirmed?:unknown;allFeatures?:unknown;restoreGlobal?:unknown}}>('/security-management/:id/collection',async request=>{
  const securityId=id(request.params.id,'id'),{feature,excluded,confirmed,allFeatures,restoreGlobal}=request.body??{};
  if(allFeatures!==undefined&&(typeof allFeatures!=='boolean'||allFeatures&&feature!=='ALL'))throw new ApiError(400,'INVALID_INPUT','전체 적용은 전체 외부 수집 설정에서만 가능합니다.');
  if(restoreGlobal!==undefined&&(typeof restoreGlobal!=='boolean'||restoreGlobal&&(feature==='ALL'||excluded!==false||allFeatures===true)))throw new ApiError(400,'INVALID_INPUT','전체 제외 해제는 개별 기능 활성화에서만 가능합니다.');
  if(feature!=='ALL'&&!collectionFeatures.includes(feature as CollectionFeature)||typeof excluded!=='boolean')throw new ApiError(400,'INVALID_INPUT','수집 기능과 제외 여부를 확인하세요.');
  if(excluded&&confirmed!==true)throw new ApiError(400,'EXCLUSION_CONFIRMATION_REQUIRED','수집 제외 확인이 필요합니다.');
  const result=await serializable(async tx=>{
   await tx.$queryRaw`SELECT id FROM securities WHERE id=${securityId} FOR UPDATE`;
   const s=await tx.security.findUnique({where:{id:securityId}});if(!s)throw missing();
   if(!s.isActive)throw new ApiError(409,'SECURITY_INACTIVE','비활성 종목의 수집 설정은 변경할 수 없습니다.');
   if(normalizeSecuritySymbol(s.symbol).startsWith('Z99')&&!excluded)throw new ApiError(409,'AUTOMATIC_EXCLUSION','Z99 코드는 모든 외부 수집에서 자동 제외됩니다.');
   // Opt-in editor operation: reopen only this row, preserving every other effective OFF state.
   const values=new Set(restoreGlobal&&s.collectionExcluded?collectionFeatures:Array.isArray(s.excludedFeatures)?s.excludedFeatures.filter((f):f is string=>typeof f==='string'):[]);
   if(feature!=='ALL'){if(excluded)values.add(String(feature));else values.delete(String(feature));}
   // The editor's master switch changes all features in one transaction; legacy ALL keeps local settings.
   const result=await tx.security.update({where:{id:securityId},data:{...(feature==='ALL'?{collectionExcluded:excluded,...(allFeatures?{excludedFeatures:excluded?[...collectionFeatures]:[]}: {})}:{excludedFeatures:[...values],...(restoreGlobal?{collectionExcluded:false}:{})}),collectionRevision:{increment:1}}});
   await tx.dartBackfillTask.updateMany({where:{securityId,status:'PROCESSING'},data:{status:'PENDING',nextAttemptAt:null}});
   return result;
  });invalidateSecurityCaches();realtimePriceCache.removeSecurity(String(securityId));return {data:publicSecurity(result)};
 });
 app.delete<{Params:{id:string};Body:{confirmed?:unknown}}>('/security-management/:id',async request=>{
  if(request.body?.confirmed!==true)throw new ApiError(400,'DELETE_CONFIRMATION_REQUIRED','삭제 확인이 필요합니다.');
  const securityId=id(request.params.id,'id');
  await serializable(async tx=>{
   await tx.$queryRaw`SELECT id FROM securities WHERE id=${securityId} FOR UPDATE`;
   if(!await tx.security.findUnique({where:{id:securityId}}))throw missing();
   const reasons=await usageReasons(tx,securityId);if(reasons.length)throw new ApiError(409,'SECURITY_IN_USE',reasons.join(' · ')+'에서 사용 중이므로 삭제할 수 없습니다.');
   // Master deactivation preserves collected data and restrictive FKs; no cascade is performed.
   await tx.security.update({where:{id:securityId},data:{isActive:false,collectionExcluded:true,collectionRevision:{increment:1}}});
  });invalidateSecurityCaches();realtimePriceCache.removeSecurity(String(securityId));return {data:{deleted:true}};
 });
}
