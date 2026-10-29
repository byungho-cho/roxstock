import {annualSecurityDetail} from './security-data-annual-detail.js';
import {id} from '../lib/input.js';
import {createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {securityDataReadSnapshot} from '@roxstock/shared/lib/prisma';
import {annualWAssessment,summarizeAnnual,annualReadinessVersion,type AnnualKind} from '@roxstock/shared/domain/security-w-readiness';
import {exclusionReason} from '@roxstock/shared/collection/collection-policy';
import {ApiError} from '@roxstock/shared/lib/api-error';
const currentYear=()=>Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()));
async function loadAnnual(){
 const year=currentYear(),rows=await securityDataReadSnapshot(async tx=>{const list=await tx.security.findMany({where:{isActive:true},include:{marketPrice:true,periodValuations:{where:{OR:[{fiscalYear:year-1,periodType:'ANNUAL'},{fiscalYear:year,periodType:'ESTIMATE'}]},orderBy:{updatedAt:'desc'}},financialStatements:{where:{fiscalYear:year-1,periodType:'ANNUAL'}},dartFinancialFilings:{where:{fiscalYear:year-1,periodType:'ANNUAL',isWithdrawn:false},omit:{accountSources:true},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}],take:1},valuationMetrics:{where:{metricDate:new Date(Date.UTC(year-1,11,31))},take:1}},orderBy:[{name:'asc'},{id:'asc'}]});
 // Load full proof only for potential preferred-share references, never for the whole list/cache payload.
 const ids=list.filter(s=>s.periodValuations.some(v=>{const p=v.provenance as any,sup=v.supplemental as any;return sup?.shares?.preferred===true&&(p?.bpsReferenceOnly===true||p?.perMetric?.bps?.bpsReferenceOnly===true);})).flatMap(s=>s.dartFinancialFilings.map(f=>f.id));
 if(ids.length){const proof=await tx.security.findMany({where:{dartFinancialFilings:{some:{id:{in:ids}}}},select:{dartFinancialFilings:{where:{id:{in:ids}},select:{id:true,accountSources:true}}}}),byId=new Map(proof.flatMap(s=>s.dartFinancialFilings).map(f=>[String(f.id),f.accountSources]));for(const s of list)for(const f of s.dartFinancialFilings)if(byId.has(String(f.id)))Object.assign(f,{accountSources:byId.get(String(f.id))});}
 return list;});
 const asOf=new Date().toISOString();
 const buckets=([{year:year-1,kind:'final'},{year,kind:'estimate'}] as const).map(bucket=>{
  const items=rows.map(s=>{const price=s.marketPrice&&(!s.marketPrice.collectionSymbol||s.marketPrice.collectionSymbol===s.symbol)?s.marketPrice.currentPrice.toString():null;return {id:String(s.id),name:s.name,symbol:s.symbol,excludedReason:exclusionReason(s,'valuation')??exclusionReason(s,'dart-financial-statements'),currentPrice:price,priceUpdatedAt:s.marketPrice?.priceUpdatedAt.toISOString()??null,assessment:annualWAssessment({year,price,periods:s.periodValuations.filter(v=>!v.collectionSymbol||v.collectionSymbol===s.symbol),manual:s.financialStatements,filings:s.dartFinancialFilings,metrics:s.valuationMetrics},bucket.year,bucket.kind)};});
  const snapshotId=createHash('sha256').update(JSON.stringify({version:annualReadinessVersion,...bucket,items})).digest('hex');
  return {...bucket,label:`${bucket.year}년 ${bucket.kind==='final'?'연간 결산':'연간 추정(E)'}`,...summarizeAnnual(items),items,snapshotId,policyVersion:annualReadinessVersion,asOf};
 });
 return {asOf,policyVersion:annualReadinessVersion,buckets};
}
let inFlight:ReturnType<typeof loadAnnual>|undefined;
async function annualSnapshot(){if(!inFlight){const job=loadAnnual();inFlight=job;void job.finally(()=>{if(inFlight===job)inFlight=undefined;}).catch(()=>{});}return inFlight;}
export async function securityAnnualRoutes(app:FastifyInstance){
 app.get<{Params:{year:string;kind:string;id:string}}>('/security-data/annual/:year/:kind/:id/detail',async req=>({data:await annualSecurityDetail(id(req.params.id,'id'),Number(req.params.year),req.params.kind)}));
 app.get('/security-data/annual',async()=>{const data=await annualSnapshot();return {data:{...data,buckets:data.buckets.map(({items,...summary})=>summary)}};});
 app.get<{Params:{year:string;kind:string;id:string}}>('/security-data/annual/:year/:kind/:id',async req=>{
  if(!/^[1-9]\d*$/.test(req.params.id))throw new ApiError(400,'INVALID_INPUT','종목을 확인하세요.');
  const data=await annualSnapshot(),bucket=data.buckets.find(b=>b.year===Number(req.params.year)&&b.kind===req.params.kind);if(!bucket)throw new ApiError(400,'INVALID_PERIOD','조회 기간을 확인하세요.');
  const item=bucket.items.find(r=>r.id===req.params.id);if(!item)throw new ApiError(404,'NOT_FOUND','종목을 찾을 수 없습니다.');
  return {data:{item,year:bucket.year,kind:bucket.kind,asOf:data.asOf,snapshotId:bucket.snapshotId}};
 });
 app.get<{Params:{year:string;kind:string};Querystring:{stage?:string;offset?:string;snapshot?:string}}>('/security-data/annual/:year/:kind',async req=>{
  const year=Number(req.params.year),kind=req.params.kind as AnnualKind,stage=req.query.stage??'w',offset=Number(req.query.offset??0);
  if(!['final','estimate'].includes(kind)||!['w','indicators','complete','all','value-missing','value-complete','value-all'].includes(stage)||!Number.isSafeInteger(offset)||offset<0||offset%50!==0)throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인하세요.');
  const snapshot=await annualSnapshot(),bucket=snapshot.buckets.find(b=>b.year===year&&b.kind===kind);if(!bucket)throw new ApiError(400,'INVALID_PERIOD','현재 연간 결산·추정 기간만 조회할 수 있습니다.');
  if(req.query.snapshot&&req.query.snapshot!==bucket.snapshotId||offset>0&&!req.query.snapshot)throw new ApiError(409,'SNAPSHOT_CHANGED','자료가 변경됐습니다. 첫 목록부터 다시 조회하세요.');
  const items=bucket.items.filter(r=>!r.excludedReason&&(stage==='value-all'?true:stage==='value-complete'?r.assessment.indicatorReady:stage==='value-missing'?!r.assessment.indicatorReady:stage==='all'?true:stage==='w'?!r.assessment.wReady:stage==='indicators'?r.assessment.wReady&&!r.assessment.indicatorReady:r.assessment.wReady&&r.assessment.indicatorReady));
  // Explicit all stage retains W-ready and missing rows alike.
  const selected=stage==='all'?bucket.items.filter(r=>!r.excludedReason):items;
  return {data:{...bucket,items:selected.slice(offset,offset+50),stage,total:selected.length,hasNext:offset+50<selected.length}};
 });
}
