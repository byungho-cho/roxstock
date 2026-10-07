import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
test('stored history never loads live portfolio and preserves account/date scope',async()=>{
 const findAccount=prisma.account.findUnique,findSnapshots=prisma.dailyAccountSnapshot.findMany,findPlan=prisma.compoundGrowthPlan.findFirst,findPositions=prisma.dailyPositionSnapshot.findMany;
 let reads=0;
 prisma.account.findUnique=(async(args:any)=>{reads++;assert.deepEqual(args.select,{id:true,isActive:true});return {id:7n,isActive:true};}) as any;
 prisma.dailyAccountSnapshot.findMany=(async(args:any)=>{assert.equal(args.where.accountId,7n);assert.equal(args.where.snapshotDate.gte.toISOString().slice(0,10),'2025-12-31');return [];}) as any;
 prisma.compoundGrowthPlan.findFirst=(async()=>null) as any;prisma.dailyPositionSnapshot.findMany=(async()=>[]) as any;
 const app=buildApp();try {const res=await app.inject('/api/accounts/7/asset-history?from=2025-12-31&to=2200-01-01&storedOnly=true');assert.equal(res.statusCode,200,res.body);assert.deepEqual(res.json().data,[]);assert.equal(reads,1);}finally{await app.close();prisma.account.findUnique=findAccount;prisma.dailyAccountSnapshot.findMany=findSnapshots;prisma.compoundGrowthPlan.findFirst=findPlan;prisma.dailyPositionSnapshot.findMany=findPositions;}
});
