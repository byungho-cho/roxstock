import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../app.js';
import {prisma} from '../lib/prisma.js';

test('investment baseline prefers previous year end, then account earliest snapshot, then zero input', async () => {
  const accountOriginal=prisma.account.findUnique;
  const uniqueOriginal=prisma.dailyAccountSnapshot.findUnique;
  const firstOriginal=prisma.dailyAccountSnapshot.findFirst;
  let previous:any=null, first:any=null, fallbackCalls=0;
  prisma.account.findUnique=(async()=>({isActive:true})) as any;
  prisma.dailyAccountSnapshot.findUnique=(async(args:any)=>{
    assert.equal(args.where.accountId_snapshotDate.accountId,1n);
    assert.equal(args.where.accountId_snapshotDate.snapshotDate.toISOString(),'2025-12-31T00:00:00.000Z');
    return previous;
  }) as any;
  prisma.dailyAccountSnapshot.findFirst=(async(args:any)=>{
    fallbackCalls++;
    assert.deepEqual(args.where,{accountId:1n});
    assert.deepEqual(args.orderBy,[{snapshotDate:'asc'},{id:'asc'}]);
    return first;
  }) as any;
  const app=buildApp();
  const snapshot=(date:string,amount:bigint)=>({snapshotDate:new Date(date+'T00:00:00Z'),totalAssetValue:amount,investmentAmount:amount-100n,updatedAt:new Date(date+'T14:00:00Z')});
  try {
    previous=snapshot('2025-12-31',1000n);first=snapshot('2024-01-05',500n);
    let response=await app.inject('/api/accounts/1/investment-baseline?year=2026');
    assert.equal(response.statusCode,200);assert.equal(response.json().data.totalAssetValue,'1000');assert.equal(response.json().data.investmentAmount,'900');assert.equal(fallbackCalls,0);
    previous=null;
    response=await app.inject('/api/accounts/1/investment-baseline?year=2026');
    assert.equal(response.json().data.source,'FIRST_SNAPSHOT');assert.equal(response.json().data.date,'2024-01-05');assert.equal(response.json().data.totalAssetValue,'500');
    first=null;
    response=await app.inject('/api/accounts/1/investment-baseline?year=2026');
    assert.equal(response.json().data,null);
  } finally {
    await app.close();prisma.account.findUnique=accountOriginal;prisma.dailyAccountSnapshot.findUnique=uniqueOriginal;prisma.dailyAccountSnapshot.findFirst=firstOriginal;
  }
});
