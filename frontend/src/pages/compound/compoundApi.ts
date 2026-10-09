import {apiRequest} from '../../data/apiClient';
export type Projection={year:number;asset:string;contributed:string;realizedAsset?:string|null;realizedTargetMet?:boolean|null;annualAchievementRate?:string|null};
export type Goal={id:string;goalName:string;annualTargetRate:string;displayColor:string;isDefault:boolean;isVisible:boolean;rows:Projection[];yearTarget:string|null;finalTarget:string|null;progress:string|null;finalAchievementRate?:string|null};
export type Plan={id:string;planName:string;displayColor?:string;startYear:number;endYear:number;duration:number;initialAssetValue:string;annualContributionAmount:string;goals:Goal[];endingAssets?:string|null;endingAsOf?:string|null;status:'UPCOMING'|'ACTIVE'|'ENDED'};
export type Plans={accountId:string;currentAssets:string|null;asOf:string;calculatedAt:string;currentYear:number;pricingComplete:boolean;plans:Plan[];basis:{contributionTiming:string;initialTiming:string;inclusiveYears:boolean;yearTarget:string;progressDenominator:string;timezone:string}};
export type FormValues={planName:string;goalName:string;startYear:number;endYear:number;initialAssetValue:string;annualContributionAmount:string;annualTargetRate:string;displayColor:string};
export const colors=['#5EA1F0','#FFC21A','#2DCCA4','#FA616E','#A87AF4','#29BEC8','#CBD5E1'];
export const root=(accountId:string)=>'/accounts/'+encodeURIComponent(accountId)+'/compound-plans';
export async function listPlans(accountId:string,signal?:AbortSignal){
 const value=await apiRequest<Plans>(root(accountId),{signal});
 if(!value||value.accountId!==accountId||!Number.isInteger(value.currentYear)||!Array.isArray(value.plans)||value.plans.some(plan=>!Array.isArray(plan.goals)||plan.goals.some(goal=>!Array.isArray(goal.rows))))throw new Error('복리계획 조회 응답을 확인할 수 없습니다. 다시 조회해 주세요.');
 return value;
}
export const mutate=(path:string,method:string,body?:unknown)=>apiRequest<{id?:string;deleted?:boolean}>(path,{method,...(body?{body:JSON.stringify(body)}:{})});
