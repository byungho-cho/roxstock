import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../src/app.js';
import {prisma} from '../src/lib/prisma.js';
test('real MariaDB scoped CRUD, overlap, default concurrency, child deletion',async()=>{
 const accounts=await Promise.all([1,2].map(i=>prisma.account.create({data:{name:'복리 자체검사 '+i,brokerName:'TEST',cashBalance:'500'}})));
 const app=buildApp(),a=accounts[0]!,b=accounts[1]!,root='/api/accounts/'+a.id+'/compound-plans';
 const input={planName:'실제 테스트 계획',startYear:2025,endYear:2026,initialAssetValue:'100',annualContributionAmount:'20',annualTargetRate:'10',displayColor:'#5EA1F0'};
 let planId='';
 try{
  let r=await app.inject({method:'POST',url:root,payload:input});assert.equal(r.statusCode,201,r.body);planId=r.json().data.id;
  r=await app.inject(root);assert.equal(r.json().data.currentAssets,'500');const original=r.json().data.plans[0];assert.equal(original.goals.length,1);assert.equal(original.goals[0].finalTarget,'167.2');
  r=await app.inject({method:'POST',url:root,payload:input});assert.equal(r.statusCode,409);
  r=await app.inject({method:'DELETE',url:'/api/accounts/'+b.id+'/compound-plans/'+planId});assert.equal(r.statusCode,404);assert.equal(await prisma.compoundGrowthPlan.count({where:{id:BigInt(planId)}}),1);
  const goalUrl=root+'/'+planId+'/goals';
  r=await app.inject({method:'POST',url:goalUrl,payload:{goalName:'손실 목표',annualTargetRate:'-5',displayColor:'#FA616E',startYear:1900,initialAssetValue:'999999'}});assert.equal(r.statusCode,400,r.body);
  r=await app.inject({method:'POST',url:goalUrl,payload:{goalName:'추가 목표',annualTargetRate:'5',displayColor:'#FA616E'}});assert.equal(r.statusCode,201,r.body);const second=r.json().data.id;
  const switches=await Promise.all([original.goals[0].id,second].map(id=>app.inject({method:'PUT',url:goalUrl+'/'+id+'/default'})));assert.ok(switches.every(r=>r.statusCode===200),switches.map(r=>r.body).join(' '));assert.equal(await prisma.compoundGrowthGoal.count({where:{planId:BigInt(planId),isDefault:true}}),1);
  r=await app.inject({method:'PUT',url:root+'/'+planId,payload:{...input,endYear:2024}});assert.equal(r.statusCode,400);assert.equal((await prisma.compoundGrowthPlan.findUniqueOrThrow({where:{id:BigInt(planId)}})).endDate.getUTCFullYear(),2026);
  r=await app.inject({method:'DELETE',url:goalUrl+'/'+second});assert.equal(r.statusCode,200);
  r=await app.inject({method:'DELETE',url:goalUrl+'/'+original.goals[0].id});assert.equal(r.statusCode,200);assert.equal((await app.inject(root)).json().data.plans[0].goals.length,0);
  r=await app.inject({method:'POST',url:goalUrl,payload:{goalName:'새 기준',annualTargetRate:'0',displayColor:'#5EA1F0'}});assert.equal(r.statusCode,201);assert.equal(await prisma.compoundGrowthGoal.count({where:{planId:BigInt(planId),isDefault:true}}),1);
  r=await app.inject({method:'DELETE',url:root+'/'+planId});assert.equal(r.statusCode,200);assert.equal(await prisma.compoundGrowthGoal.count({where:{planId:BigInt(planId)}}),0);assert.equal(await prisma.compoundGrowthPlan.count({where:{id:BigInt(planId)}}),0);
 }finally{
  await app.close();const ids=accounts.map(a=>a.id),plans=await prisma.compoundGrowthPlan.findMany({where:{accountId:{in:ids}}});await prisma.compoundGrowthGoal.deleteMany({where:{planId:{in:plans.map(p=>p.id)}}});await prisma.compoundGrowthPlan.deleteMany({where:{accountId:{in:ids}}});await prisma.account.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();
 }
});
