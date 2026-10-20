import type {Prisma} from '../generated/prisma/index.js';
import {eligibleWhere} from './collection-policy.js';
import {getSeoulClock} from './time.js';

/** Annual history starts in 2015; quarterly history starts in 2020. */
export function dartTaskPeriodScope(now=new Date()):Prisma.DartBackfillTaskWhereInput {
  return {fiscalYear:{gte:2015,lte:Number(getSeoulClock(now).dateKey.slice(0,4))},AND:[{OR:[{periodType:'ANNUAL'},{fiscalYear:{gte:2020}}]}]};
}

export function dartTaskScope(now=new Date()):Prisma.DartBackfillTaskWhereInput {
  return {...dartTaskPeriodScope(now),security:eligibleWhere('dart-financial-statements')};
}

/** Review holds are unresolved, but must not block the next automatic stage. */
export function dartAutomaticWork(now=new Date()):Prisma.DartBackfillTaskWhereInput {
  return {...dartTaskPeriodScope(now),OR:[{status:{in:['PENDING','PROCESSING']}},{status:'FAILED',OR:[{errorCode:null},{errorCode:{not:'REVIEW_REQUIRED'}}]}]};
}

export function dartWorkerStatus(input:{now:Date;configured:boolean;stateExists:boolean;quotaBlocked:boolean;automaticWindow:boolean;runStatus?:string;workerDates:Array<Date|null|undefined>}) {
  if(!input.configured)return 'NOT_CONFIGURED';
  if(!input.stateExists)return 'NOT_IMPLEMENTED';
  if(input.quotaBlocked||!input.automaticWindow)return 'WAITING';
  const dates=input.workerDates.filter((date):date is Date=>!!date);
  if(!dates.length)return 'WAITING';
  const heartbeat=Math.max(...dates.map(date=>date.getTime()));
  if(input.now.getTime()-heartbeat>120_000)return 'DELAYED';
  if(input.runStatus==='RUNNING')return 'RUNNING';
  if(input.runStatus==='FAILED'||input.runStatus==='PARTIAL')return input.runStatus;
  return 'OK';
}
