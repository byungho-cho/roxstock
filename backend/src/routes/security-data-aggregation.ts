import {createHash} from 'node:crypto';
import {securityDataReadSnapshot} from '@roxstock/shared/lib/prisma';
import {objectValue} from '@roxstock/shared/domain/security-data';
import {assessGroup,combineGroups,dataFilter,financialRequired,valueRequired,securityAggregationVersion,summarizeGroups,validDataNumber,type Evidence} from '@roxstock/shared/domain/security-data-aggregation';
import {dartPolicyExclusions} from '@roxstock/shared/collection/dart-task-status';
import {exclusionReason} from '@roxstock/shared/collection/collection-policy';
import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {financialCurrency} from '@roxstock/shared/domain/financial-currency';
import {collectionPublicMessage} from '../domain/collection-public-message.js';
const date=(v:any)=>v instanceof Date?v.toISOString().slice(0,10):typeof v==='string'?v.slice(0,10):null;
const periodOf=(year:number,quarter:number)=>`${year}:${quarter===4?'ANNUAL':'Q'+quarter}`;
const supportedCurrency=(v:unknown)=>typeof v==='string'&&/^[A-Z]{3}$/.test(v);
export function storedBasis(f:any,v:any,year:number,quarter:number){
 const sup=objectValue(v?.supplemental),p=objectValue(v?.provenance),manual=objectValue(sup.manualBasis),duration=objectValue(objectValue(f?.sourceValidation).publicDocument).fiscalDuration??sup.fiscalDuration;
 const candidate=f?{receiptNo:f.receiptNo,fsDivision:f.fsDivision,periodEnd:date(f.periodEndDate),periodStart:objectValue(duration).start??null,currency:financialCurrency(f),amountMultiplier:'1',shareClass:'COMMON',kind:'ACTUAL'}:Object.keys(manual).length?manual:p.fsDivision&&p.periodEnd&&p.receiptNo&&p.kind==='ACTUAL'?{receiptNo:p.receiptNo,fsDivision:p.fsDivision,periodEnd:p.periodEnd,periodStart:objectValue(duration).start??null,currency:p.currency,amountMultiplier:'1',shareClass:p.shareClass??objectValue(sup.shares).shareClass,kind:'ACTUAL'}:null;
 const valid=!!candidate&&['CFS','OFS'].includes(candidate.fsDivision)&&supportedCurrency(candidate.currency)&&candidate.shareClass==='COMMON'&&['ACTUAL','MANUAL_PERIOD'].includes(candidate.kind)&&(candidate.kind==='MANUAL_PERIOD'?candidate.periodKey===periodOf(year,quarter):!!date(candidate.periodEnd));
 const basis=valid?candidate:null,source=basis?(f?'COLLECTED':Object.keys(manual).length?'MANUAL':'STORED_METADATA'):null;
 const currencies=new Set<string>();for(const e of [p,...Object.values(objectValue(p.perMetric)),...Object.values(objectValue(sup.manualFields)),objectValue(sup.accounts)]){const c=objectValue(e).currency;if(c)currencies.add(String(c));}
 const conflict=!!basis&&Object.keys(manual).length&&['fsDivision','currency','periodEnd'].some(k=>manual[k]!==basis[k])||!!sup.manualConflict||currencies.size>1||[...currencies].some(c=>c!=='KRW')&&(!basis||basis.currency==='KRW');
 const blockedReason=conflict?'기존 자료의 연결/별도·통화·보고기간 기준 충돌 · 원본과 수기 값 보존':basis&&basis.currency!=='KRW'||[...currencies].some(c=>c!=='KRW')?'외화 자료는 조회만 가능합니다. 이번 수기 편집은 원화만 지원합니다.':!basis&&Object.keys(objectValue(sup.manualFields)).length?'기존 수기 값의 자료 기준 검토가 필요합니다.':null;
 return {basis,source,needed:!basis&&!blockedReason,blockedReason,periodKey:periodOf(year,quarter),supportedCurrency:'KRW' as const};
}
export function metricBasisMatches(e:any,b:any,year:number,quarter:number,sup:any){
 e=objectValue(e);if(!b||e.kind==='ANNUAL_ESTIMATE'||e.isEstimated===true)return false;
 if(e.fsDivision!==b.fsDivision||(e.currency??(e.source==='KIS_API'?'KRW':null))!==b.currency)return false;
 if(b.kind==='MANUAL_PERIOD')return e.source==='MANUAL'&&e.periodKey===periodOf(year,quarter)&&e.periodEnd===b.periodEnd;
 const common=e.shareClass==='COMMON'||objectValue(sup.shares).preferred===false||objectValue(sup.shares).shareClass==='COMMON'||Array.isArray(objectValue(sup.shares).rows)&&objectValue(sup.shares).rows.some((r:any)=>r.shareClass==='COMMON');
 return e.periodEnd===b.periodEnd&&e.receiptNo===b.receiptNo&&common;
}
function taskEvidence(task:any,year:number,quarter:number,now:Date):Evidence|null{
 if(!task)return null;const d=objectValue(task.diagnostics),audit=task.decisions?.[0],reason=task.errorCode;
 if((task.status==='EXCLUDED'||task.status==='NOT_APPLICABLE'&&dartPolicyExclusions.includes(reason??''))&&reason&&(audit||d.policyEvidence||d.exclusionEvidence||d.confirmedExclusion===true))return {reason:String(reason),source:audit?'DART_TASK_DECISION:'+String(audit.id):'DART_TASK:'+String(task.id),period:periodOf(year,quarter),policyVersion:String(d.policyVersion??'PRESERVED_AUDITED_POLICY'),checkedAt:task.updatedAt?.toISOString()};
 if(task.status==='NOT_DUE'&&reason==='FILING_NOT_DUE'&&Number.isInteger(d.closingMonth)&&d.monthEvidence&&d.periodEnd){const end=Date.parse(String(d.periodEnd)+'T23:59:59+09:00'),until=d.deadlineConfirmed&&d.deadline&&d.deadlineSource?Date.parse(String(d.deadline)+'T23:59:59+09:00'):end+Number(d.minimumSubmissionDays??0)*86400000;if(Number.isFinite(until)&&until>=now.getTime())return {reason:'FILING_NOT_DUE',source:String(d.monthEvidence),period:periodOf(year,quarter),policyVersion:securityAggregationVersion,until:new Date(until).toISOString(),checkedAt:d.checkedAt};}
 return null;
}
async function loadQuarter(year:number,quarter:number){
 const filter='all' as const,period=quarter===4?'ANNUAL':`Q${quarter}`,now=new Date();
 const {rows,receipts}=await securityDataReadSnapshot(async tx=>{
 const rows=await tx.security.findMany({where:{isActive:true},include:{dartCorpMapping:{select:{corpCode:true}},dartFinancialFilings:{where:{fiscalYear:year,periodType:period as any,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}],take:1},periodValuations:{where:{fiscalYear:year,periodType:period}},dartBackfillTasks:{where:{fiscalYear:year,periodType:period as any},include:{decisions:{orderBy:{id:'desc'},take:1}},orderBy:{updatedAt:'desc'},take:1},collectorRunItems:{where:{diagnostics:{path:'$.phase',equals:'SECURITY_DATA'},AND:[{diagnostics:{path:'$.fiscalYear',equals:year}},{diagnostics:{path:'$.periodType',equals:period}}]},orderBy:{id:'desc'},take:1,select:{status:true,message:true,observedAt:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
 const receipts=await tx.securityDataReceipt.findMany({select:{corpCode:true,receiptNo:true,report:true,status:true,updatedAt:true},orderBy:{receiptNo:'asc'}});
 return {rows,receipts};
 });
 // End the MVCC transaction before proof normalization, grouping and hashing.
 // CPU work must not extend database transaction lifetime under concurrent cache rebuilds.
 const evidenceReceipts=receipts.filter(r=>{const raw=objectValue(r.report),result=String(raw.report_nm??'');return result.includes(`(${year}.${String(quarter*3).padStart(2,'0')})`)||raw.fiscalYear===year&&raw.periodType===period;});
 const published=new Set(evidenceReceipts.map(r=>r.corpCode));
 const items=rows.map(s=>{
  const f=s.dartFinancialFilings[0],v=s.periodValuations[0],sup=objectValue(v?.supplemental),manual=objectValue(sup.manualFields),p=objectValue(v?.provenance),context=storedBasis(f,v,year,quarter),b=context.basis,effective=f?supplementedFilings([f],v?[v]:[])[0]:null;
  const values:Record<string,unknown>={},proof:Record<string,boolean>={};
  for(const k of [...financialRequired,...valueRequired]){
   const m=objectValue(manual[k]),e=Object.keys(m).length?m:objectValue(objectValue(p.perMetric)[k]??p);
   values[k]=Object.keys(m).length?m.value:valueRequired.includes(k as any)?objectValue(v?.values)[k]:objectValue(effective)[k];
   proof[k]=Object.keys(m).length||valueRequired.includes(k as any)?metricBasisMatches(e,b,year,quarter,sup):!!f&&!!b&&b.kind==='ACTUAL'&&!!b.currency&&!!b.periodEnd;
  }
  const na:Record<string,Evidence>={};for(const [ratio,base] of [['per','eps'],['pbr','bps']])if(values[ratio!]==null&&validDataNumber(values[base!])&&proof[base!]&&Number(values[base!])<=0)na[ratio!]={reason:base!.toUpperCase()+'_NON_POSITIVE',source:'VERIFIED_'+base!.toUpperCase(),period:periodOf(year,quarter),policyVersion:securityAggregationVersion};
  // Only audited per-field decisions for this exact period and basis qualify.
  for(const [key,raw]of Object.entries(objectValue(sup.notApplicable))){const e=objectValue(raw);if(e.confirmed===true&&e.source&&e.reason&&e.periodKey===periodOf(year,quarter)&&e.fsDivision===b?.fsDivision&&e.currency===b?.currency&&e.policyVersion)na[key]={reason:e.reason,source:e.source,period:e.periodKey,policyVersion:e.policyVersion};}
  const recordPresent=!!f||Object.values(values).some(validDataNumber),disclosed=!!f||published.has(s.dartCorpMapping?.corpCode??''),state=recordPresent?'PARTIAL':disclosed?'MISSING':'DISCLOSURE_UNVERIFIED';
  const decision=taskEvidence(s.dartBackfillTasks[0],year,quarter,now),explicit=disclosed&&decision?.reason==='FILING_NOT_DUE'?null:decision;
  const exclusion=(feature:'dart-financial-statements'|'valuation')=>{const reason=exclusionReason(s,feature);return reason?{reason,source:'SECURITY_COLLECTION_POLICY:'+s.collectionRevision,period:periodOf(year,quarter),policyVersion:securityAggregationVersion}:explicit;};
  const financial=assessGroup(financialRequired,values,proof,na,exclusion('dart-financial-statements'),state),value=assessGroup(valueRequired,values,proof,na,exclusion('valuation'),state),groups={financial,value,all:combineGroups(financial,value)};
  return {id:String(s.id),name:s.name,symbol:s.symbol,groups,state:groups[filter].state,missingFinancial:financial.missing,missingValue:value.missing,disclosed,exclusion:groups[filter].exclusion,executionError:s.collectorRunItems[0]?.status==='FAILED'?{message:collectionPublicMessage(s.collectorRunItems[0].message),at:s.collectorRunItems[0].observedAt?.toISOString()??null}:null};
 });
 const summary=summarizeGroups(items,filter);
 const snapshotId=createHash('sha256').update(JSON.stringify({version:securityAggregationVersion,year,quarter,items:items.map(({state,exclusion,...r})=>r),versions:rows.map(s=>[String(s.id),s.updatedAt,s.dartFinancialFilings[0]?.collectedAt,s.periodValuations[0]?.updatedAt,s.dartBackfillTasks[0]?.updatedAt]),receipts:evidenceReceipts.map(r=>[r.receiptNo,r.status,r.updatedAt])})).digest('hex');
 return {year,quarter,label:`${year}년 ${quarter}분기`,...summary,items,policyVersion:securityAggregationVersion,asOf:now.toISOString(),aggregatedAt:now.toISOString(),snapshotId,required:{financial:financialRequired,value:valueRequired},groupPolicy:'ALL_REQUIRES_BOTH_APPLICABLE_GROUPS'};
}

// Coalesce concurrent shared-data reads only. No persistent cache or historical work is created.
let activeReads=0;const readWaiters:Array<()=>void>=[];
const inFlight=new Map<string,Promise<Awaited<ReturnType<typeof loadQuarter>>>>();
async function boundedRead(year:number,quarter:number){
 if(activeReads>=2)await new Promise<void>(resolve=>readWaiters.push(resolve));else activeReads++;
 try{return await loadQuarter(year,quarter);}finally{const next=readWaiters.shift();if(next)next();else activeReads--;}
}
export async function storedQuarter(year:number,quarter:number,filterInput:unknown='all'){
 const key=year+':'+quarter;let pending=inFlight.get(key);
 if(!pending){pending=boundedRead(year,quarter);inFlight.set(key,pending);void pending.finally(()=>{if(inFlight.get(key)===pending)inFlight.delete(key);}).catch(()=>{});}
 const data=await pending,filter=dataFilter(filterInput);
 if(filter==='all')return data;
 const items=data.items.map(item=>({...item,state:item.groups[filter].state,exclusion:item.groups[filter].exclusion}));
 return {...data,...summarizeGroups(items,filter),items};
}
