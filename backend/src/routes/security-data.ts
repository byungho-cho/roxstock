import {securityDataDetail as detail} from './security-data-detail.js';
import {securityAnnualRoutes} from './security-data-annual.js';
import type {FastifyInstance} from 'fastify';
import {createHash} from 'node:crypto';
import {Prisma} from '@roxstock/shared/prisma';
import {completedQuarters,editableCurrentPeriod,objectValue,securityDataFields,validateManualNumber} from '@roxstock/shared/domain/security-data';
import {valueCompletion} from '@roxstock/shared/domain/collection-status';
import {storedQuarter} from './security-data-aggregation.js';
import {securityProcessingStatus} from './security-data-processing.js';
import {dataFilter} from '@roxstock/shared/domain/security-data-aggregation';
import {prisma} from '../auth/scoped-db.js';
import {authContext} from '../auth/context.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
function spec(year:string,quarter:string){const y=Number(year),q=Number(quarter);if(!Number.isInteger(y)||y<2015||!Number.isInteger(q)||q<1||q>4)throw new ApiError(400,'INVALID_PERIOD','보고기간을 확인하세요.');return {year:y,quarter:q,period:q===4?'ANNUAL':`Q${q}`};}
export async function securityDataRoutes(app:FastifyInstance){
 await securityAnnualRoutes(app);
 app.get('/security-data/status',async()=>({data:await securityProcessingStatus()}));
 app.get<{Querystring:{filter?:string}}>('/security-data/quarters',async req=>{const quarters=await Promise.all(completedQuarters().map(async q=>{const {items,...summary}=await storedQuarter(q.year,q.quarter,req.query.filter);return summary;}));return {data:{asOf:new Date().toISOString(),aggregatedAt:new Date().toISOString(),snapshotId:createHash('sha256').update(quarters.map(q=>q.snapshotId).join(':')).digest('hex'),policyVersion:quarters[0]?.policyVersion,quarters}};});
 app.get<{Params:{year:string;quarter:string};Querystring:{offset?:string;filter?:string;snapshot?:string}}>('/security-data/quarters/:year/:quarter',async req=>{
  const p=spec(req.params.year,req.params.quarter),offset=Number(req.query.offset??0);if(!Number.isSafeInteger(offset)||offset<0||offset%50!==0)throw new ApiError(400,'INVALID_OFFSET','조회 위치를 확인하세요.');
  const data=await storedQuarter(p.year,p.quarter,req.query.filter);
  if(req.query.snapshot&&req.query.snapshot!==data.snapshotId||offset>0&&!req.query.snapshot)throw new ApiError(409,'SNAPSHOT_CHANGED','자료가 변경됐습니다. 첫 목록부터 다시 조회합니다.');
  const filter=dataFilter(req.query.filter),all=data.items.filter(s=>s.groups[filter].included&&!s.groups[filter].complete);
  return {data:{...data,items:all.slice(offset,offset+50),hasNext:offset+50<all.length,total:all.length}};
 });
 app.get<{Params:{year:string;quarter:string;id:string}}>('/security-data/quarters/:year/:quarter/:id',async req=>({data:await detail(id(req.params.id,'id'),spec(req.params.year,req.params.quarter))}));
 app.put<{Params:{year:string;quarter:string;id:string};Body:unknown}>('/security-data/quarters/:year/:quarter/:id/basis',async req=>{
  const identity=authContext.getStore();if(identity?.role!=='ADMIN')throw new ApiError(403,'ADMIN_REQUIRED','관리자만 설정할 수 있습니다.');
  const p=spec(req.params.year,req.params.quarter),securityId=id(req.params.id,'id');
  if(!editableCurrentPeriod(p.year,p.period))throw new ApiError(409,'HISTORICAL_EDIT_DEFERRED','직전 완료 4개 분기만 설정할 수 있습니다.');
  const requested=objectValue(req.body);if(!['CFS','OFS'].includes(requested.fsDivision)||Object.keys(requested).some(k=>k!=='fsDivision'))throw new ApiError(400,'INVALID_BASIS','연결/별도만 선택하세요. 수기 편집은 원화만 지원합니다.');
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT revision FROM analysis_revisions WHERE \`key\`='financial' FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM securities WHERE id=${securityId} FOR UPDATE`;
   const current=await detail(securityId,p,tx);
   if(current.basisSetup.blockedReason)throw new ApiError(409,'BASIS_REVIEW_REQUIRED',current.basisSetup.blockedReason);
   if(current.basis){if(current.basis.fsDivision===requested.fsDivision&&current.basis.currency==='KRW')return;throw new ApiError(409,'BASIS_ALREADY_VERIFIED','이미 확인된 자료 기준이 있습니다. 다시 조회하세요.');}
   const basis={receiptNo:null,fsDivision:requested.fsDivision,currency:'KRW',periodKey:current.basisSetup.periodKey,periodStart:null,periodEnd:null,amountMultiplier:'1',shareClass:'COMMON',kind:'MANUAL_PERIOD',policyVersion:'SECURITY_DATA_20261028_V2'};
   const key={securityId_fiscalYear_periodType:{securityId,fiscalYear:p.year,periodType:p.period}},saved=await tx.periodValuation.findUnique({where:key}),sup=objectValue(saved?.supplemental);
   if(Object.keys(objectValue(sup.manualFields)).length)throw new ApiError(409,'BASIS_REVIEW_REQUIRED','기존 수기 값의 자료 기준 검토가 필요합니다.');
   const supplemental=json({...sup,manualBasis:basis,manualEditRevision:(sup.manualEditRevision??0)+1});
   await tx.periodValuation.upsert({where:key,create:{securityId,fiscalYear:p.year,periodType:p.period,status:'PARTIAL',values:{},reasons:{},provenance:{},supplemental},update:{supplemental}});
   await tx.securityDataEdit.create({data:{securityId,fiscalYear:p.year,periodType:p.period,field:'__basis__',userId:identity.userId,before:json({basis:null}),after:json({basis})}});
  });
  return {data:await detail(securityId,p)};
 });
 app.patch<{Params:{year:string;quarter:string;id:string};Body:{field?:string;value?:unknown;expectedValue?:unknown;basis?:unknown}}>('/security-data/quarters/:year/:quarter/:id',async req=>{
  const identity=authContext.getStore();if(identity?.role!=='ADMIN')throw new ApiError(403,'ADMIN_REQUIRED','관리자만 편집할 수 있습니다.');
  const p=spec(req.params.year,req.params.quarter),securityId=id(req.params.id,'id');
  if(!editableCurrentPeriod(p.year,p.period))throw new ApiError(409,'HISTORICAL_EDIT_DEFERRED','직전 완료 4개 분기만 편집할 수 있습니다.');
  const field=req.body?.field??'';let value:string;try{value=validateManualNumber(field,req.body?.value);}catch{throw new ApiError(400,'INVALID_FIELD_VALUE','직접 편집 가능한 수치와 자릿수를 확인하세요.');}
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT revision FROM analysis_revisions WHERE \`key\`='financial' FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM securities WHERE id=${securityId} FOR UPDATE`;
   const current=await detail(securityId,p,tx),target=current.fields.find(f=>f.key===field)!;
   if(target.value!==req.body.expectedValue)throw new ApiError(409,'VALUE_CHANGED','값이 변경되었습니다. 다시 조회한 후 편집하세요.');
   if(current.basis&&Object.keys(current.basis).some(k=>(current.basis as any)[k]!==objectValue(req.body.basis)[k]))throw new ApiError(409,'BASIS_CHANGED','공시 기간·단위·연결/별도 기준을 확인하세요.');
   if(!current.basis)throw new ApiError(409,'MANUAL_BASIS_REQUIRED','먼저 자료 기준 설정을 완료하세요.');
   if(current.basisSetup.blockedReason)throw new ApiError(409,'MANUAL_EDIT_UNSUPPORTED',current.basisSetup.blockedReason);
   const basis=current.basis;
   const key={securityId_fiscalYear_periodType:{securityId,fiscalYear:p.year,periodType:p.period}},saved=await tx.periodValuation.findUnique({where:key}),supplemental=objectValue(saved?.supplemental),manualFields=objectValue(supplemental.manualFields),at=new Date().toISOString();
   const entry={value,source:'MANUAL',at,fsDivision:basis.fsDivision,periodEnd:basis.periodEnd,currency:basis.currency,shareClass:'COMMON',receiptNo:basis.receiptNo,periodKey:current.basisSetup.periodKey};
   const values={...objectValue(saved?.values)},provenance=objectValue(saved?.provenance);if(['eps','bps','roe','per','pbr'].includes(field))values[field]=value;
   // Shares are whole, non-negative, and keep the basic count identity valid.
   const issued=field==='issuedShares'?value:current.fields.find(f=>f.key==='issuedShares')?.value,treasury=field==='treasuryShares'?value:current.fields.find(f=>f.key==='treasuryShares')?.value;
   if(issued!=null&&treasury!=null&&new Prisma.Decimal(issued).lt(treasury))throw new ApiError(400,'INVALID_SHARE_COUNT','자기주식수는 발행주식수보다 클 수 없습니다.');
   // Explicit manual write uses the same transaction; collector fence preserves previously edited fields.
   const data={status:valueCompletion(values).complete?'SUCCESS':'PARTIAL',values:json(values),provenance:json({...provenance,perMetric:{...objectValue(provenance.perMetric),...(field in values?{[field]:entry}:{})}}),reasons:saved?.reasons??{},supplemental:json({...supplemental,manualBasis:basis,manualFields:{...manualFields,[field]:entry},lastManualEditAt:at,manualEditRevision:(supplemental.manualEditRevision??0)+1})};
   await tx.periodValuation.upsert({where:key,create:{securityId,fiscalYear:p.year,periodType:p.period,...data},update:data});
   await tx.securityDataEdit.create({data:{securityId,fiscalYear:p.year,periodType:p.period,field,userId:identity.userId,before:json({value:target.value,source:target.source,basis:current.basis}),after:json(entry)}});
  });
  return {data:await detail(securityId,p)};
 });
}
