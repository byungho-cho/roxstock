import test from 'node:test';
import assert from 'node:assert/strict';
import type {PrismaClient} from '@roxstock/shared/prisma';
import {PrismaDartRepository} from './dart-repository.js';
import {runDartCollectorCycle,type DartCollectorConfig} from './dart-collector.js';
test('raising the local quota permits another turn but the actual budget and provider quota still block',async()=>{
 const now=new Date('2026-10-23T12:00:00Z');let code='DAILY_CALL_LIMIT',calls=3000;
 const originals={state:PrismaDartRepository.prototype.getState,usage:PrismaDartRepository.prototype.getDailyUsage};
 const config:DartCollectorConfig={enabled:true,apiKey:'fixture',dailyCallLimit:10000,minDelayMs:0,backfillStartYear:2015,backfillCompanyLimit:100,universeBatchSize:35,windowStartHour:18,windowEndHour:6,corpRefreshHours:24};
 try{
  PrismaDartRepository.prototype.getState=async()=>({lastRunAt:now,lastError:code+': paused'}) as never;
  PrismaDartRepository.prototype.getDailyUsage=async()=>({apiCallCount:calls}) as never;
  const db={valuationSupplementScan:{findUnique:async()=>({automaticTurnUntil:new Date(now.getTime()+60000),heartbeatAt:now})}} as unknown as PrismaClient;
  assert.equal((await runDartCollectorCycle(db,config,now)).status,'YIELDED');
  calls=10000;assert.equal((await runDartCollectorCycle(db,config,now)).status,'QUOTA_BLOCKED');
  calls=3000;code='020';assert.equal((await runDartCollectorCycle(db,config,now)).status,'QUOTA_BLOCKED');
 }finally{PrismaDartRepository.prototype.getState=originals.state;PrismaDartRepository.prototype.getDailyUsage=originals.usage;}
});
