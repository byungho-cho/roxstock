import type {Prisma} from '../generated/prisma/index.js';
import type {DartPeriodType} from './dart-types.js';

// Only explicit policies qualify. Missing mappings are unresolved identity checks.
export const dartPolicyExclusions = ['SECURITY_TYPE_NOT_APPLICABLE','SECURITY_INACTIVE','PRE_LISTING_POLICY_EXCLUDED','USER_COLLECTION_EXCLUDED'];
export const dartIncludedTasks: Prisma.DartBackfillTaskWhereInput = {
  NOT: {status:'EXCLUDED'},
  OR:[{status:{not:'NOT_APPLICABLE'}},{errorCode:null},{errorCode:{notIn:dartPolicyExclusions}}],
};
export type DartDisplayStatus = 'SUCCESS'|'NOT_DUE'|'NO_FILING'|'DATA_UNAVAILABLE'|'EXCLUDED'|'REVIEW_REQUIRED'|'PENDING'|'PROCESSING'|'FAILED';
export function dartDisplayStatus(status:string,code:string|null):DartDisplayStatus {
  if(status==='EXCLUDED'||status==='NOT_APPLICABLE'&&dartPolicyExclusions.includes(code??''))return 'EXCLUDED';
  if(status==='NOT_APPLICABLE'||status==='FAILED'&&code==='REVIEW_REQUIRED')return 'REVIEW_REQUIRED';
  // A legacy empty response is not proof that the API never provides the data.
  if(status==='NO_FILING'&&code!=='NO_FILING_CONFIRMED')return 'REVIEW_REQUIRED';
  return status as DartDisplayStatus;
}
export function dartProgress(rows:ReadonlyArray<{status:string;errorCode:string|null;_count:{_all:number}}>) {
  const byStatus:Record<string,number>={};
  for(const row of rows){const status=dartDisplayStatus(row.status,row.errorCode);if(status!=='EXCLUDED')byStatus[status]=(byStatus[status]??0)+row._count._all;}
  const planned=Object.values(byStatus).reduce((n,v)=>n+v,0),notDue=byStatus.NOT_DUE??0,currentTarget=planned-notDue;
  const success=byStatus.SUCCESS??0,confirmed=(byStatus.NO_FILING??0)+(byStatus.DATA_UNAVAILABLE??0),completed=success+confirmed;
  return {planned,currentTarget,notDue,completed,success,confirmed,reviewRequired:byStatus.REVIEW_REQUIRED??0,byStatus,
    completionRate:currentTarget?completed/currentTarget*100:null,collectionSuccessRate:currentTarget?success/currentTarget*100:null,
    complete:currentTarget>0&&completed===currentTarget,empty:planned===0,allNotDue:planned>0&&currentTarget===0};
}

export function dartPeriodEnd(year:number,period:DartPeriodType,closingMonth:number):string {
  if(!Number.isInteger(closingMonth)||closingMonth<1||closingMonth>12)throw Error('Verified fiscal closing month required');
  // CALENDAR_REPORT_YEAR: the task year is the calendar year of its period end.
  const month=period==='ANNUAL'?closingMonth:((closingMonth+({Q1:3,Q2:6,Q3:9}[period]))-1)%12+1;
  return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
}
export function missingDartReport(input:{now:Date;year:number;period:DartPeriodType;closingMonth:number|null;monthEvidence:string;verifiedDeadline?:{date:string;source:string}}) {
  const checkedAt=input.now.toISOString(),daily=new Date(input.now.getTime()+86400000);
  if(input.verifiedDeadline&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.verifiedDeadline.date)||!input.verifiedDeadline.source.trim()||!Number.isFinite(Date.parse(input.verifiedDeadline.date))))throw Error('Verified deadline evidence required');
  if(!input.closingMonth)return {status:'FAILED' as const,errorCode:'REVIEW_REQUIRED',errorMessage:'결산월·보고기간 검증 필요',nextAttemptAt:null,diagnostics:{checkedAt,reason:'FISCAL_MONTH_UNVERIFIED',monthEvidence:input.monthEvidence}};
  const periodEnd=dartPeriodEnd(input.year,input.period,input.closingMonth);
  const end=Date.parse(periodEnd+'T23:59:59+09:00');
  // This is a lower bound, never an asserted final legal deadline (extensions/holidays may apply).
  const lowerBound=end+(input.period==='ANNUAL'?90:45)*86400000;
  const verified=input.verifiedDeadline;
  const deadline=verified?Date.parse(verified.date+'T23:59:59+09:00'):null;
  const evidence={checkedAt,periodEnd,closingMonth:input.closingMonth,monthEvidence:input.monthEvidence,
    minimumSubmissionDays:input.period==='ANNUAL'?90:45,deadlineConfirmed:!!verified,...(verified?{deadline:verified.date,deadlineSource:verified.source}:{})};
  if(input.now.getTime()<=Math.max(end,deadline??lowerBound))return {status:'NOT_DUE' as const,errorCode:'FILING_NOT_DUE',errorMessage:'보고기간 미종료 또는 제출 시기 미도래',nextAttemptAt:daily,diagnostics:{...evidence,nextCheckAt:daily.toISOString(),reason:input.now.getTime()<=end?'PERIOD_NOT_ENDED':'BEFORE_SUBMISSION_LOWER_BOUND'}};
  if(deadline!==null&&Number.isFinite(deadline))return {status:'NO_FILING' as const,errorCode:'NO_FILING_CONFIRMED',errorMessage:'확인된 제출 시기 이후 대상 공시 없음',nextAttemptAt:daily,diagnostics:{...evidence,nextCheckAt:daily.toISOString(),reason:'VERIFIED_DEADLINE_PASSED'}};
  return {status:'FAILED' as const,errorCode:'REVIEW_REQUIRED',errorMessage:'공시 없음 · 제출기한의 연장·휴일 조정 확인 필요',nextAttemptAt:daily,diagnostics:{...evidence,nextCheckAt:daily.toISOString(),reason:'SUBMISSION_DEADLINE_UNVERIFIED'}};
}
export function thebornPreListingTask(symbol:string,year:number,period:DartPeriodType) {
  return symbol==='475560'&&year>=2015&&(period==='ANNUAL'?year<=2023:year>=2020&&year<=2024);
}

export function dartStatusWhere(status:DartDisplayStatus):Prisma.DartBackfillTaskWhereInput {
  if(status==='EXCLUDED')return {OR:[{status:'EXCLUDED'},{status:'NOT_APPLICABLE',errorCode:{in:dartPolicyExclusions}}]};
  if(status==='REVIEW_REQUIRED')return {OR:[{status:'FAILED',errorCode:'REVIEW_REQUIRED'},{status:'NOT_APPLICABLE',OR:[{errorCode:null},{errorCode:{notIn:dartPolicyExclusions}}]},{status:'NO_FILING',OR:[{errorCode:null},{errorCode:{not:'NO_FILING_CONFIRMED'}}]}]};
  if(status==='NO_FILING')return {status:'NO_FILING',errorCode:'NO_FILING_CONFIRMED'};
  if(status==='FAILED')return {status:'FAILED',OR:[{errorCode:null},{errorCode:{not:'REVIEW_REQUIRED'}}]};
  return {status};
}
