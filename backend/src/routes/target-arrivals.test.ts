import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/index.js';

test('account-scoped API preserves explicit empty settings and rejects stale writes', async () => {
  const originalFind=prisma.account.findUnique;
  const originalUpdate=prisma.account.updateMany;
  let conditions: Prisma.JsonValue | null=null; let version=0;
  const observed: bigint[]=[];
  prisma.account.findUnique=(async (args: unknown) => {
    const accountId=(args as {where:{id:bigint}}).where.id;observed.push(accountId);
    return { id: accountId, isActive: true, targetArrivalConditions: accountId===1n?conditions:[], targetArrivalVersion:version, buyTrades:[] } as never;
  }) as unknown as typeof originalFind;
  prisma.account.updateMany=(async (args:unknown) => {
    const a=args as {where:{id:bigint;targetArrivalVersion:number};data:{targetArrivalConditions:Prisma.JsonValue}};
    if(a.where.id!==1n||a.where.targetArrivalVersion!==version)return {count:0};
    conditions=a.data.targetArrivalConditions;version++;return {count:1};
  }) as unknown as typeof originalUpdate;
  const app=buildApp();
  try {
    const initial=await app.inject('/api/accounts/1/target-arrival-conditions');assert.equal(initial.json().data.conditions.length,5);
    const saved=await app.inject({method:'PUT',url:'/api/accounts/1/target-arrival-conditions',payload:{conditions:[],version:0}});assert.equal(saved.statusCode,200);
    const empty=await app.inject('/api/accounts/1/target-arrival-conditions');assert.deepEqual(empty.json().data.conditions,[]);
    const disabled=await app.inject('/api/accounts/1/target-arrivals');assert.equal(disabled.json().meta.enabled,false);
    const other=await app.inject('/api/accounts/2/target-arrivals');assert.equal(other.json().meta.accountId,'2');assert.deepEqual(observed,[1n,1n,1n,1n,2n]);
    const conflict=await app.inject({method:'PUT',url:'/api/accounts/1/target-arrival-conditions',payload:{conditions:[],version:0}});assert.equal(conflict.statusCode,409);
    const invalid=await app.inject({method:'PUT',url:'/api/accounts/1/target-arrival-conditions',payload:{conditions:Array(6).fill({days:1,rate:'1'}),version:1}});assert.equal(invalid.statusCode,400);
  } finally {await app.close();prisma.account.findUnique=originalFind;prisma.account.updateMany=originalUpdate;}
});
