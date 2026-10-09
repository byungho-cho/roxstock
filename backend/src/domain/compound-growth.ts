import { Prisma, type CompoundGrowthPlan, type CompoundGrowthGoal } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';
const D = Prisma.Decimal.clone({ precision: 400 });
export const colors = ['#5EA1F0','#FFC21A','#2DCCA4','#FA616E','#A87AF4','#29BEC8','#CBD5E1'];
export const seoulYear = (now = new Date()) => Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now).slice(0,4));
export type PlanInput = { planName:string;startYear:number;endYear:number;initialAssetValue:string;annualContributionAmount:string;annualTargetRate:string;displayColor:string };
export type GoalInput = Pick<PlanInput,'annualTargetRate'|'displayColor'> & {goalName:string};
function invalid(message:string):never { throw new ApiError(400,'INVALID_INPUT',message); }
function body(value:unknown):Record<string,unknown> { if(!value||typeof value!=='object'||Array.isArray(value))invalid('입력 내용을 확인해 주세요.');return value as Record<string,unknown>; }
function name(value:unknown,label:string) { if(typeof value!=='string'||!value.trim()||value.trim().length>100)invalid(label+'은 1~100자로 입력해 주세요.');return value.trim(); }
function year(value:unknown) { if(typeof value!=='number'||!Number.isInteger(value)||value<1900||value>2200)invalid('연도는 1900~2200으로 입력해 주세요.');return value; }
function amount(value:unknown,label:string,rate=false) {
 if(typeof value!=='string'||!new RegExp(rate?'^-?\\d{1,5}(\\.\\d{1,4})?$':'^\\d{1,15}(\\.\\d{1,4})?$').test(value))invalid(label+'을 숫자로 입력해 주세요. (소수점 최대 4자리)');
 const n=new D(value);if(!n.isFinite()||(rate?n.lte(0)||n.gt(99999):label==='시작 금액'?n.lte(0):n.lt(0)))invalid(label+'의 범위를 확인해 주세요.');return n.toString();
}
export function parseGoal(value:unknown):GoalInput {
 const b=body(value);if(typeof b.displayColor!=='string'||!colors.includes(b.displayColor))invalid('목표 색상을 선택해 주세요.');
 return {goalName:name(b.goalName,'목표명'),annualTargetRate:amount(b.annualTargetRate,'연 수익률',true),displayColor:b.displayColor};
}
export function parsePlan(value:unknown):PlanInput {
 const b=body(value),startYear=year(b.startYear),endYear=year(b.endYear);
 if(startYear>endYear)invalid('시작 연도는 종료 연도보다 클 수 없습니다.');
 const goal=parseGoal({...b,goalName:'기준형'});
 return {planName:name(b.planName,'계획명'),startYear,endYear,initialAssetValue:amount(b.initialAssetValue,'시작 금액'),annualContributionAmount:amount(b.annualContributionAmount,'매년 추가금'),annualTargetRate:goal.annualTargetRate,displayColor:goal.displayColor};
}
export function project(initial:string,contribution:string,rate:string,start:number,end:number) {
 let asset=new D(initial);const addition=new D(contribution),factor=new D(1).plus(new D(rate).div(100));
 const rows:{year:number;asset:string;contributed:string}[]=[];
 for(let year=start;year<=end;year++){asset=asset.plus(addition).mul(factor);rows.push({year,asset:asset.toString(),contributed:new D(initial).plus(addition.mul(year-start+1)).toString()});}
 return rows;
}
export function serializePlan(plan:CompoundGrowthPlan & {goals:CompoundGrowthGoal[]},currentAssets:string|null,currentYear:number,endingAssets:string|null=null,yearAssets:ReadonlyMap<number,string>=new Map()) {
 const startYear=plan.startDate.getUTCFullYear(),endYear=plan.endDate.getUTCFullYear();
 const goals=plan.goals.map(goal=>{
  const rows=project(plan.initialAssetValue.toString(),plan.annualContributionAmount.toString(),goal.annualTargetRate.toString(),startYear,endYear).map(row=>{
   const realizedAsset=row.year<currentYear?yearAssets.get(row.year)??null:row.year===currentYear?currentAssets:null;
   const target=new D(row.asset);
   return {...row,realizedAsset,realizedTargetMet:realizedAsset===null?null:new D(realizedAsset).gte(target),annualAchievementRate:realizedAsset!==null&&target.gt(0)?new D(realizedAsset).div(target).mul(100).toString():null};
  });
  const finalTarget=rows.at(-1)?.asset??null,yearTarget=rows.find(row=>row.year===currentYear)?.asset??null;
  const final=finalTarget===null?null:new D(finalTarget);
  return {id:goal.id.toString(),goalName:goal.goalName,annualTargetRate:goal.annualTargetRate.toString(),displayColor:goal.displayColor??colors[0]!,isDefault:goal.isDefault,isVisible:goal.isVisible,rows,yearTarget,finalTarget,
   finalAchievementRate:endingAssets!==null&&final?.gt(0)?new D(endingAssets).div(final).mul(100).toString():null,
   progress:currentAssets!==null&&final?.gt(0)?new D(currentAssets).div(final).mul(100).toString():null};
 });
 return {id:plan.id.toString(),planName:plan.planName,displayColor:plan.displayColor??plan.goals[0]?.displayColor??colors[0]!,startYear,endYear,duration:endYear-startYear+1,initialAssetValue:plan.initialAssetValue.toString(),annualContributionAmount:plan.annualContributionAmount.toString(),goals,endingAssets,endingAsOf:endingAssets===null?null:endYear+'-12-31',
  status:currentYear<startYear?'UPCOMING':currentYear>endYear?'ENDED':'ACTIVE'};
}
