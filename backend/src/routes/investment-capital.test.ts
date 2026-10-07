import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
test('capital API isolates account, reads only stored snapshots and rejects inactive accounts',async()=>{
 const account=prisma.account.findUnique, snapshots=prisma.dailyAccountSnapshot.findMany;
 const year=Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4));
 let active=true, reads=0;
 prisma.account.findUnique=(async(args:any)=>{assert.equal(args.where.id,7n);return {isActive:active};}) as any;
 prisma.dailyAccountSnapshot.findMany=(async(args:any)=>{reads++;assert.equal(args.where.accountId,7n);assert.deepEqual(args.select,{snapshotDate:true,investmentAmount:true});return [{snapshotDate:new Date(`${year-1}-12-31T00:00:00Z`),investmentAmount:'107317732'}];}) as any;
 const app=buildApp();try{
  let res=await app.inject('/api/accounts/7/investment-capital');assert.equal(res.statusCode,200);assert.equal(res.json().data[1].investmentAmount,'107317732');assert.equal(reads,1);
  active=false;res=await app.inject('/api/accounts/7/investment-capital');assert.equal(res.statusCode,404);assert.equal(reads,1);
 } finally {await app.close();prisma.account.findUnique=account;prisma.dailyAccountSnapshot.findMany=snapshots;}
});
