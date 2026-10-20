import {kstStart,seoulDay} from './policy.js';
export type NewsScheduleConfig={intervalHours:number;startTime:string;anchorAt:Date;revision:number};
export function validateNewsSchedule(value:unknown):{intervalHours:number;startTime:string}{
 const v=value as Record<string,unknown>|null;
 if(!v||!Number.isInteger(v.intervalHours)||Number(v.intervalHours)<1||Number(v.intervalHours)>24||typeof v.startTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.startTime))throw Error('NEWS_INVALID_SCHEDULE');
 return {intervalHours:Number(v.intervalHours),startTime:v.startTime};
}
export function scheduleAnchor(now:Date,startTime:string){return new Date(seoulDay(now)+'T'+startTime+':00+09:00');}
/** Arithmetic from one persisted anchor, never a midnight reset or a catch-up loop. */
export function regularSlot(config:NewsScheduleConfig,now:Date){
 const step=config.intervalHours*3600000,index=Math.floor((now.getTime()-config.anchorAt.getTime())/step);
 return new Date(config.anchorAt.getTime()+index*step);
}
export function nextNewsAt(config:NewsScheduleConfig,now:Date){return new Date(regularSlot(config,now).getTime()+config.intervalHours*3600000);}
export function newsWindow(initialDate:string,lastCheckedAt:Date|null,now:Date){
 return new Date(Math.max(kstStart(initialDate).getTime(),(lastCheckedAt??now).getTime()-72*3600000));
}
