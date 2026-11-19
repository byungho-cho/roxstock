import {prisma} from './prisma.js';
import {installExchangeSchedules} from '../domain/exchange-schedule.js';

export const exchangeScheduleJob='exchange-schedule-check';
let refreshedAt=0;
let pending:Promise<void>|undefined;
/** Each process reads the same persisted, last verified schedule at most once per minute. */
export async function refreshExchangeScheduleCache(now=Date.now()) {
    if(now-refreshedAt<60000)return;
    if(pending)return pending;
    pending=(async()=>{
        const run=await prisma.collectorRun.findFirst({
            where:{jobType:exchangeScheduleJob,status:'SUCCESS'},
            orderBy:{id:'desc'},select:{metadata:true},
        });
        if(run){
            const data=run.metadata as {schedules?:unknown}|null;
            installExchangeSchedules(data?.schedules);
        }
        refreshedAt=now;
    })().finally(()=>{pending=undefined;});
    return pending;
}
