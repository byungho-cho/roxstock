import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePlan,parseGoal,project,serializePlan,seoulYear} from './compound-growth.js';
import {Prisma} from '../generated/prisma/index.js';
test('confirmed annual beginning contribution, inclusive years, no extra end year',()=>{
 assert.deepEqual(project('100','20','10',2025,2026),[{year:2025,asset:'132',contributed:'120'},{year:2026,asset:'167.2',contributed:'140'}]);
 assert.equal(project('123.45','0','0',2025,2025)[0]!.asset,'123.45');
 assert.equal(project('100','20','-100',2025,2026)[1]!.asset,'0');
 assert.equal(seoulYear(new Date('2025-12-31T15:00:00Z')),2026);
});
test('invalid periods, nonfinite money/rate, missing name and readonly goal payload validation',()=>{
 const good={planName:'실제 계획',startYear:2025,endYear:2026,initialAssetValue:'100',annualContributionAmount:'20',annualTargetRate:'10',displayColor:'#5EA1F0'};
 assert.equal(parsePlan(good).startYear,2025);assert.equal(parsePlan({...good,annualContributionAmount:'0'}).annualContributionAmount,'0');
 for(const patch of [{endYear:2024},{initialAssetValue:'NaN'},{initialAssetValue:'Infinity'},{initialAssetValue:'-1'},{initialAssetValue:'0'},{annualTargetRate:'0'},{annualContributionAmount:''},{annualTargetRate:'-101'},{planName:''},{startYear:2025.2}])assert.throws(()=>parsePlan({...good,...patch}));
 assert.throws(()=>parseGoal({goalName:'목표',annualTargetRate:'10',displayColor:'red'}));
});
test('shared projections; unavailable year target, assets and zero denominator',()=>{
 const plan:any={id:1n,planName:'계획',startDate:new Date('2025-01-01'),endDate:new Date('2026-12-31'),initialAssetValue:new Prisma.Decimal(100),annualContributionAmount:new Prisma.Decimal(20),goals:[{id:2n,goalName:'기준',annualTargetRate:new Prisma.Decimal(10),displayColor:'#5EA1F0',isDefault:true,isVisible:true}]};
 const p=serializePlan(plan,'83.6',2026);assert.equal(p.duration,2);assert.equal(p.goals[0]!.yearTarget,'167.2');assert.equal(p.goals[0]!.finalTarget,'167.2');assert.equal(p.goals[0]!.progress,'50');
 assert.equal(serializePlan(plan,null,2026).goals[0]!.progress,null);
 assert.equal(serializePlan(plan,'83.6',2024).goals[0]!.yearTarget,null);
 plan.initialAssetValue=new Prisma.Decimal(0);plan.annualContributionAmount=new Prisma.Decimal(0);
 assert.equal(serializePlan(plan,'100',2026).goals[0]!.progress,null);
});

test('ended plans use collected closing assets for final achievement, never current assets as historical closing data',()=>{
 const plan:any={id:1n,planName:'완료 계획',startDate:new Date('2025-01-01'),endDate:new Date('2026-12-31'),initialAssetValue:new Prisma.Decimal(100),annualContributionAmount:new Prisma.Decimal(20),goals:[{id:2n,goalName:'기준',annualTargetRate:new Prisma.Decimal(10),displayColor:'#5EA1F0',isDefault:true,isVisible:true}]};
 const historical=serializePlan(plan,'500',2027,'83.6');assert.equal(historical.endingAssets,'83.6');assert.equal(historical.endingAsOf,'2026-12-31');assert.equal(historical.goals[0]!.finalAchievementRate,'50');
 const missing=serializePlan(plan,'500',2027);assert.equal(missing.endingAssets,null);assert.equal(missing.goals[0]!.finalAchievementRate,null);assert.equal(missing.goals[0]!.yearTarget,null);
});
