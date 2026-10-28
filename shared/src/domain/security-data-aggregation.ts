/** Public aggregation contract. Pure: shared by API, collector telemetry and UI types. */
import {objectValue} from './security-data.js';
export const securityAggregationVersion='SECURITY_DATA_20261028_V2';
export const financialRequired=['revenueYtd','operatingProfitYtd','netIncomeYtd','totalAssets','totalLiabilities','totalEquity'] as const;
export const valueRequired=['eps','bps','roe','per','pbr'] as const;
export type DataFilter='all'|'financial'|'value';
export const dataFilter=(v:unknown):DataFilter=>v==='financial'||v==='value'?v:'all';
export type Evidence={reason:string;source:string;period:string;policyVersion:string;checkedAt?:string;until?:string};
export type GroupAssessment={applicable:boolean;included:boolean;complete:boolean;missing:string[];notApplicable:Record<string,Evidence>;exclusion:Evidence|null;state:string};
export const validDataNumber=(v:unknown)=>v!==null&&v!==undefined&&/^-?\d+(?:\.\d+)?$/.test(String(v));
export const validFieldNumber=(key:string,v:unknown)=>validDataNumber(v)&&(!['per','pbr','totalAssets','totalLiabilities'].includes(key)||!String(v).startsWith('-')||/^-0+(?:\.0+)?$/.test(String(v)));
export function assessGroup(keys:readonly string[],values:Record<string,unknown>,proof:Record<string,boolean>,na:Record<string,Evidence>,exclusion:Evidence|null=null,state='DISCLOSURE_UNVERIFIED'):GroupAssessment{
 const confirmed=Object.fromEntries(Object.entries(na).filter(([key,e])=>keys.includes(key)&&!!e.source&&!!e.reason&&!!e.period&&!!e.policyVersion));
 const missing=keys.filter(k=>!(validFieldNumber(k,values[k])&&proof[k])&&!confirmed[k]);
 // All-NA is a group applicability decision, never an invented successful group.
 const allNa=keys.every(k=>confirmed[k]);
 const groupExclusion=exclusion??(allNa?{reason:'ALL_FIELDS_NOT_APPLICABLE',source:'VERIFIED_FIELD_DECISIONS',period:confirmed[keys[0]!]!.period,policyVersion:securityAggregationVersion}:null);
 const complete=!groupExclusion&&!missing.length;
 return {applicable:!groupExclusion,included:!groupExclusion,complete,missing,notApplicable:confirmed,exclusion:groupExclusion,state:groupExclusion?(groupExclusion.reason==='FILING_NOT_DUE'?'AWAITING_DISCLOSURE':'EXCLUDED'):complete?'COMPLETE':state};
}
export function combineGroups(financial:GroupAssessment,value:GroupAssessment):GroupAssessment{
 const exclusion=financial.exclusion??value.exclusion,missing=[...financial.missing,...value.missing],complete=!exclusion&&financial.complete&&value.complete;
 return {included:!exclusion,applicable:!exclusion,complete,missing,notApplicable:{...financial.notApplicable,...value.notApplicable},exclusion,state:exclusion?(exclusion.reason==='FILING_NOT_DUE'?'AWAITING_DISCLOSURE':'EXCLUDED'):complete?'COMPLETE':financial.state==='PARTIAL'||value.state==='PARTIAL'?'PARTIAL':financial.state};
}
export function summarizeGroups(rows:ReadonlyArray<{groups:Record<DataFilter,GroupAssessment>}>,filter:DataFilter){
 const groups=rows.map(r=>r.groups[filter]),included=groups.filter(g=>g.included),complete=included.filter(g=>g.complete).length;
 const byState:Record<string,number>={};for(const g of groups)byState[g.state]=(byState[g.state]??0)+1;
 const exclusions=groups.filter(g=>g.exclusion).map(g=>g.exclusion!);
 // Detailed evidence stays on the audited period/security record. Avoid repeating it thousands of times on cards.
 const buckets=new Map<string,{reason:string;period:string;policyVersion:string;count:number;evidenceSources:string[]}>();
 for(const e of exclusions){const key=JSON.stringify([e.reason,e.period,e.policyVersion]),b=buckets.get(key)??{reason:e.reason,period:e.period,policyVersion:e.policyVersion,count:0,evidenceSources:[]};b.count++;if(b.evidenceSources.length<3&&!b.evidenceSources.includes(e.source))b.evidenceSources.push(e.source);buckets.set(key,b);}
 return {filter,unit:'SECURITY_PERIOD',target:included.length,complete,missing:included.length-complete,waiting:byState.AWAITING_DISCLOSURE??0,excluded:exclusions.filter(e=>e.reason!=='FILING_NOT_DUE').length,rate:included.length?complete/included.length*100:null,rateReason:included.length?null:'NO_ELIGIBLE_TARGET',byState,exclusions:[...buckets.values()]};
}
export type WorkState='PENDING'|'PROCESSING'|'SUCCESS'|'PARTIAL'|'FAILED'|'EXCLUDED';
export type WorkResult={key:string;receiptNo:string;securityId:string;reportPeriod:string;divisionPolicy:string;state:WorkState;resolvedDivision?:string;fiscalYear?:number;periodType?:string;storedAt?:string;errorCode?:string;reason?:string};
export function securityWorkKey(work:Pick<WorkResult,'receiptNo'|'securityId'|'reportPeriod'|'divisionPolicy'>){return JSON.stringify([work.receiptNo,work.securityId,work.reportPeriod,work.divisionPolicy]);}
export function processingCounts(work:readonly WorkResult[]){
 const unique=[...new Map(work.map(w=>[w.key,w])).values()],c={target:unique.length,pending:0,processing:0,success:0,partial:0,failed:0,excluded:0};
 const key={PENDING:'pending',PROCESSING:'processing',SUCCESS:'success',PARTIAL:'partial',FAILED:'failed',EXCLUDED:'excluded'} as const;
 for(const w of unique)c[key[w.state]]++;
 const denominator=c.success+c.partial+c.failed;
 return {...c,rate:denominator?c.success/denominator*100:null,rateDenominator:denominator,rateReason:denominator?null:c.target?'NO_TERMINAL_JUDGMENT':'NO_PROCESSING_TARGET'};
}
export function processingView(run:any,cursor:any,lastStoredAt:string|null=null){
 const m=objectValue(run?.metadata),discovery=objectValue(m.discovery),legacy=objectValue(m.counts);
 const known=Array.isArray(m.workItems),work=known?m.workItems as WorkResult[]:[];
 const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):0;
 const old={success:count(legacy.success),partial:count(legacy.partial??legacy.unresolved),failed:count(legacy.failed),excluded:count(legacy.excluded??legacy.skipped),pending:count(legacy.pending),processing:count(legacy.processing)};
 const oldDenominator=old.success+old.partial+old.failed;
 const counts=known?processingCounts(work):{...old,target:Object.values(old).reduce((n,v)=>n+v,0),rate:oldDenominator?old.success/oldDenominator*100:null,rateDenominator:oldDenominator,rateReason:oldDenominator?null:'NO_TERMINAL_JUDGMENT'};
 // Legacy timestamps can prove a completed query, but SKIPPED alone cannot.
 const oldCompleted=typeof m.discoveryCompletedAt==='string'&&run?.startedAt&&Math.abs(Date.parse(m.discoveryCompletedAt)-new Date(run.startedAt).getTime())<1000&&!m.cycleError?m.discoveryCompletedAt:null;
 const queryStatus=discovery.status??(m.cycleError?'FAILED':oldCompleted?'COMPLETE':run?.status==='RUNNING'?'RUNNING':'UNKNOWN');
 const discovered=Number.isSafeInteger(discovery.found)?discovery.found:null;
 let state='UNKNOWN',message='조회 결과 확인 필요';
 if(!run){state='NO_HISTORY';message='실행 이력 없음';}
 else if(queryStatus==='FAILED'){state='QUERY_FAILED';message='공시 조회 실패';}
 else if(queryStatus==='PARTIAL'){state='QUERY_PARTIAL';message='일부 구간 조회 실패 · 확인 범위 불완전';}
 else if(queryStatus==='WAITING'){state='WAITING';message='공시 조회 대기 · API 한도';}
 else if(queryStatus==='RUNNING'||queryStatus==='INCOMPLETE'){state='QUERYING';message='공시 확인 중';}
 else if(run.status==='RUNNING'&&(counts.pending||counts.processing)){state='PROCESSING';message='자료 처리 중';}
 else if(counts.failed||m.cycleError){state='FAILED';message=`자료 처리 실패${counts.failed?' '+counts.failed+'건':''}`;}
 else if(counts.partial){state='PARTIAL';message=`부분 완료 · 자료 미충족 ${counts.partial}건`;}
 else if(counts.pending||counts.processing){state='WAITING';message='자료 처리 대기';}
 else if(queryStatus==='COMPLETE'&&!counts.target){state='COMPLETE';message=discovered===0?'조회 완료 · 신규 수집 대상 없음':discovered&&discovered>0?'조회 완료 · 추가 반영 대상 없음':'조회 완료 · 처리 대상 없음';}
 else if(counts.target){state='COMPLETE';message='자료 처리 완료';}
 if(counts.rate===null)counts.rateReason=state==='QUERY_FAILED'?'DISCOVERY_FAILED':state==='QUERY_PARTIAL'?'DISCOVERY_INCOMPLETE':state==='NO_HISTORY'?'NO_HISTORY':counts.rateReason;
 return {policyVersion:securityAggregationVersion,unit:'PROCESSING_WORK',state,message,counts,discoveredReceipts:discovered,newTasks:Number.isSafeInteger(discovery.created)?discovery.created:null,discovery:{status:queryStatus,from:discovery.from??null,through:discovery.through??null,coverageFrom:m.coverageFrom??cursor?.coverageFrom??null,complete:queryStatus==='COMPLETE',completedAt:discovery.completedAt??oldCompleted,checkpoint:discovery.checkpoint??null,resumePoint:discovery.resumePoint??(cursor?{fromDate:cursor.fromDate,throughDate:cursor.throughDate,page:cursor.page}:null)},lastQueryCompletedAt:cursor?.lastCompletedAt?new Date(cursor.lastCompletedAt).toISOString():null,runEndedAt:run?.finishedAt?new Date(run.finishedAt).toISOString():null,lastStoredAt,lastError:discovery.errorCode??m.executionErrorCode??work.find(w=>w.state==='FAILED')?.errorCode??null,running:run?.status==='RUNNING',evidence:known?'WORK_LEDGER':'LEGACY_RUN_COUNTS',snapshotId:run?String(run.id)+':'+(run.finishedAt?new Date(run.finishedAt).toISOString():JSON.stringify(counts)):'NONE'};
}
export type SecurityProcessingView=ReturnType<typeof processingView>;
