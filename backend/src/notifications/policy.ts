import {seoulDate,type TargetCondition} from '../domain/target-arrival.js';
export const notificationDestination=(kind:string)=>kind==='TARGET'?'/':kind==='NEWS'?'/detail/stock-news':null;
export const dailyTargetIdentity=(userId:bigint,accountId:bigint,securityId:bigint,condition:TargetCondition,now:Date)=>`${userId}:TARGET:${accountId}:${securityId}:${condition.days}:${condition.rate}:${seoulDate(now)}`;
