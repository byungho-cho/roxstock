import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
// Every mutation acquires one account row lock before reading or writing children.
// READ COMMITTED avoids MariaDB's stale joined-child reads at SERIALIZABLE.
async function compoundTransaction<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 return prisma.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000});
}
import { requireActiveAccount } from '../domain/classification.js';
import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { calculateDashboard } from '../domain/portfolio.js';
import { loadPortfolio } from './portfolio.js';
import { parsePlan,parseGoal,serializePlan,seoulYear } from '../domain/compound-growth.js';
type Params={accountId:string;planId:string;goalId:string};
const include={goals:{orderBy:[{displayOrder:'asc' as const},{id:'asc' as const}]}};
async function locked(tx:Prisma.TransactionClient,accountId:bigint,planId?:bigint){
 // Acquire the account write lock before any snapshot reads (serialized per account).
 await tx.$queryRawUnsafe('SELECT id FROM accounts WHERE id = ? FOR UPDATE',accountId);
 await requireActiveAccount(tx,accountId);
 if(planId){const plan=await tx.compoundGrowthPlan.findFirst({where:{id:planId,accountId},include});
  if(!plan)throw new ApiError(404,'PLAN_NOT_FOUND','계획을 찾을 수 없습니다.');return plan;}
 return null;
}
export async function compoundGrowthRoutes(app:FastifyInstance){
 const root='/accounts/:accountId/compound-plans';
 app.get<{Params:Params}>(root,async request=>prisma.$transaction(async tx=>{
  const accountId=id(request.params.accountId,'accountId'),{account,holdings}=await loadPortfolio(accountId,tx);
  const dashboard=calculateDashboard(account.cashBalance,holdings),now=new Date(),currentYear=seoulYear(now);
  const plans=await tx.compoundGrowthPlan.findMany({where:{accountId},include,orderBy:[{startDate:'asc'},{displayOrder:'asc'},{id:'asc'}]});
  const endedDates=plans.filter(p=>p.endDate.getUTCFullYear()<currentYear).map(p=>new Date(Date.UTC(p.endDate.getUTCFullYear(),11,31)));
  const endingSnapshots=endedDates.length?await tx.dailyAccountSnapshot.findMany({where:{accountId,snapshotDate:{in:endedDates}}}):[];
  const endingByYear=new Map(endingSnapshots.map(row=>[row.snapshotDate.getUTCFullYear(),row.totalAssetValue.toString()]));
  const assets=dashboard.totalAssetValue?.toString()??null;
  const asOf=new Date(Math.max(account.updatedAt.getTime(),dashboard.latestPriceUpdatedAt?.getTime()??0));
  return {data:{accountId:accountId.toString(),currentAssets:assets,asOf:asOf.toISOString(),calculatedAt:now.toISOString(),currentYear,
   pricingComplete:dashboard.pricingComplete,plans:plans.map(plan=>serializePlan(plan,assets,currentYear,endingByYear.get(plan.endDate.getUTCFullYear())??null)),
   basis:{contributionTiming:'START_OF_YEAR',initialTiming:'START_OF_START_YEAR',inclusiveYears:true,yearTarget:'CALENDAR_YEAR_END_WITHIN_PLAN',progressDenominator:'FINAL_TARGET',timezone:'Asia/Seoul'}}};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}));
 for(const method of ['post','put'] as const){
  app[method]<{Params:Params;Body:unknown}>(method==='post'?root:root+'/:planId',async(request,reply)=>{
   const accountId=id(request.params.accountId,'accountId'),planId=method==='put'?id(request.params.planId,'planId'):undefined,input=parsePlan(request.body);
   const result=await compoundTransaction(async tx=>{
    const existing=await locked(tx,accountId,planId);
    const startDate=new Date(Date.UTC(input.startYear,0,1)),endDate=new Date(Date.UTC(input.endYear,11,31));
    const overlap=await tx.compoundGrowthPlan.findFirst({where:{accountId,...(planId?{id:{not:planId}}:{}),startDate:{lte:endDate},endDate:{gte:startDate}}});
    if(overlap)throw new ApiError(409,'PLAN_PERIOD_OVERLAP','같은 계좌의 계획 기간이 겹칩니다.');
    const values={planName:input.planName,displayColor:input.displayColor,startDate,endDate,initialAssetValue:input.initialAssetValue,annualContributionAmount:input.annualContributionAmount};
    if(existing){
     await tx.compoundGrowthPlan.update({where:{id:existing.id},data:values});
     const goal=existing.goals.find(g=>g.isDefault);
     if(goal)await tx.compoundGrowthGoal.update({where:{id:goal.id},data:{annualTargetRate:input.annualTargetRate,displayColor:input.displayColor}});
     return existing.id;
    }
    const created=await tx.compoundGrowthPlan.create({data:{accountId,...values,goals:{create:{goalName:'기준형',annualTargetRate:input.annualTargetRate,displayColor:input.displayColor,isDefault:true}}}});
    return created.id;
   });reply.code(method==='post'?201:200);return {data:{id:result.toString()}};
  });
 }
 app.delete<{Params:Params}>(root+'/:planId',async request=>{
  const accountId=id(request.params.accountId,'accountId'),planId=id(request.params.planId,'planId');
  await compoundTransaction(async tx=>{await locked(tx,accountId,planId);await tx.compoundGrowthGoal.deleteMany({where:{planId}});await tx.compoundGrowthPlan.delete({where:{id:planId}});});
  return {data:{deleted:true}};
 });
 for(const method of ['post','put'] as const){
  app[method]<{Params:Params;Body:unknown}>(root+'/:planId/goals'+(method==='put'?'/'+':goalId':''),async(request,reply)=>{
   const accountId=id(request.params.accountId,'accountId'),planId=id(request.params.planId,'planId'),goalId=method==='put'?id(request.params.goalId,'goalId'):undefined,input=parseGoal(request.body);
   const result=await compoundTransaction(async tx=>{
    const plan=(await locked(tx,accountId,planId))!;
    if(goalId&&!plan.goals.some(g=>g.id===goalId))throw new ApiError(404,'GOAL_NOT_FOUND','목표를 찾을 수 없습니다.');
    if(plan.goals.some(g=>g.goalName===input.goalName&&g.id!==goalId))throw new ApiError(409,'GOAL_NAME_EXISTS','같은 이름의 목표가 있습니다.');
    const goal=goalId?await tx.compoundGrowthGoal.update({where:{id:goalId},data:input}):await tx.compoundGrowthGoal.create({data:{planId,...input,isDefault:plan.goals.length===0}});
    return goal.id;
   });reply.code(method==='post'?201:200);return {data:{id:result.toString()}};
  });
 }
 app.put<{Params:Params}>(root+'/:planId/goals/:goalId/default',async request=>{
  const accountId=id(request.params.accountId,'accountId'),planId=id(request.params.planId,'planId'),goalId=id(request.params.goalId,'goalId');
  await compoundTransaction(async tx=>{
   const plan=(await locked(tx,accountId,planId))!;
   if(!plan.goals.some(g=>g.id===goalId))throw new ApiError(404,'GOAL_NOT_FOUND','목표를 찾을 수 없습니다.');
   await tx.compoundGrowthGoal.updateMany({where:{planId,isDefault:true},data:{isDefault:false}});
   await tx.compoundGrowthGoal.update({where:{id:goalId},data:{isDefault:true}});
  });return {data:{id:goalId.toString()}};
 });
 app.delete<{Params:Params}>(root+'/:planId/goals/:goalId',async request=>{
  const accountId=id(request.params.accountId,'accountId'),planId=id(request.params.planId,'planId'),goalId=id(request.params.goalId,'goalId');
  await compoundTransaction(async tx=>{
   const plan=(await locked(tx,accountId,planId))!,goal=plan.goals.find(g=>g.id===goalId);
   if(!goal)throw new ApiError(404,'GOAL_NOT_FOUND','목표를 찾을 수 없습니다.');
   await tx.compoundGrowthGoal.delete({where:{id:goalId}});
   if(goal.isDefault){const next=plan.goals.find(g=>g.id!==goalId);if(next)await tx.compoundGrowthGoal.update({where:{id:next.id},data:{isDefault:true}});}
  });return {data:{deleted:true}};
 });
}
