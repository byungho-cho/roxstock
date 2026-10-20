import type {PrismaClient} from '../generated/prisma/index.js';
import {nextNewsAt,scheduleAnchor} from './schedule.js';
export async function ensureNewsSchedule(db:Pick<PrismaClient,'stockNewsSchedule'>,now=new Date()){
 return db.stockNewsSchedule.upsert({where:{id:'stock-news'},create:{id:'stock-news',intervalHours:3,startTime:'06:00',anchorAt:scheduleAnchor(now,'06:00'),updatedAt:now},update:{}});
}
export async function newsCollectionState(db:Pick<PrismaClient,'stockNewsState'|'stockNewsProviderState'|'stockNewsSchedule'>,now=new Date()){
 const [state,providers,config]=await Promise.all([db.stockNewsState.findUnique({where:{id:'stock-news'}}),db.stockNewsProviderState.findMany({orderBy:{provider:'asc'}}),db.stockNewsSchedule.findUnique({where:{id:'stock-news'}})]);
 const schedule=config??{intervalHours:3,startTime:'06:00',anchorAt:scheduleAnchor(now,'06:00'),revision:1};
 const retries=providers.filter(p=>p.nextRetryAt).map(p=>p.nextRetryAt!.getTime());
 const enabled=process.env.STOCK_NEWS_ENABLED!=='false',iso=(d:Date|null|undefined)=>d?.toISOString()??null;
 return {status:state?.lastStatus??'NOT_COLLECTED',updatedAt:iso(state?.lastFinishedAt??state?.lastCollectedAt),lastAttemptAt:iso(state?.lastAttemptAt),lastFinishedAt:iso(state?.lastFinishedAt),lastFullSuccessAt:iso(state?.lastFullSuccessAt),lastNewStoredAt:iso(state?.lastNewStoredAt),initialCompleted:!!state?.initialCompletedAt,initialDate:state?.initialDate??null,enabled,intervalHours:schedule.intervalHours,startTime:schedule.startTime,anchorAt:schedule.anchorAt.toISOString(),timezone:'Asia/Seoul',nextAt:enabled?nextNewsAt(schedule,now).toISOString():null,nextRetryAt:enabled&&retries.length?new Date(Math.min(...retries)).toISOString():null,providers:providers.map(p=>({id:p.provider,status:p.status,error:p.lastError,lastAttemptAt:iso(p.lastAttemptAt),lastSuccessAt:iso(p.lastSuccessAt),lastCheckedAt:iso(p.lastCheckedAt),nextRetryAt:iso(p.nextRetryAt),attempts:p.attempts,gaps:p.gaps,diagnostics:p.diagnostics}))};
}
