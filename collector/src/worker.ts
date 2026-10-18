import {collectProductClassifications} from './product-classification.js';
import {loadKisProductTypes} from './providers/kis-product-master.js';
import {priceScheduleDecision} from './price-schedule.js';
import {processManualRefresh} from './dart-manual-refresh.js';
import {warmValueCaches} from '@roxstock/shared/read-model/value-cache';
import {runIndependentSupplement} from './independent-valuation-supplement.js';
import 'dotenv/config';
import { prisma } from '@roxstock/shared/lib/prisma';
import { loadCollectorConfig } from '@roxstock/shared/collection/config';
import { collectorLog as log } from '@roxstock/shared/collection/logger';
import { collectPrices,type PriceCollectorResult } from './price-collector.js';
import { MockPriceProvider } from './providers/mock-price-provider.js';
import { NaverPriceProvider } from './providers/naver-price-provider.js';
import { DataGoKrSecurityProvider } from './providers/data-go-kr-security-provider.js';
import { PrismaCollectorRepository } from './repository.js';
import { collectSecurityMaster } from './security-master-collector.js';
import { collectDailyAccountSnapshots } from './snapshot-collector.js';
import { getSeoulClock, snapshotScheduleKey } from '@roxstock/shared/collection/time';

const config = loadCollectorConfig();
const repository = new PrismaCollectorRepository(prisma);
const shutdown = new AbortController();
const provider = config.provider === 'mock'
  ? new MockPriceProvider()
  : new NaverPriceProvider(config.requestTimeoutMs);

const runPrices = async (symbols?: string[]) => {const result=await collectPrices(repository, provider, {
  signal: shutdown.signal,
  delayMs: config.providerDelayMs,
  lockTtlSeconds: Math.max(config.lockTtlSeconds, 7200),
  symbols,
  ...(!symbols?.length?{metadata:{scheduleDate:getSeoulClock(new Date()).dateKey,attempt:'manual-current'}}:{}),
});if(!symbols?.length&&result.success>0){try{await warmValueCaches(prisma,result.failedSymbols);}catch(error){log('error','value cache generation failed; last good snapshot retained',{error:String(error)});}}return result;};
const runScheduledPrices = async (scheduleDate: string, attempt: 'primary' | 'partial-retry' | 'outage-retry', symbols?: string[]) => {const result=await collectPrices(repository, provider, {
    signal: shutdown.signal,
    delayMs: config.providerDelayMs,
    lockTtlSeconds: Math.max(config.lockTtlSeconds, 7200),
    symbols,
    metadata: { scheduleDate, attempt },
  });return result;};
const runSnapshots = (now = new Date()) => collectDailyAccountSnapshots(repository, {
  lockTtlSeconds: config.lockTtlSeconds,
  now,
});
const runSecurities = () => {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!serviceKey) throw new Error('DATA_GO_KR_SERVICE_KEY is required for security master collection');
  const securityProvider = new DataGoKrSecurityProvider({
    serviceKey,
    endpoint: config.securityMasterEndpoint,
    timeoutMs: config.requestTimeoutMs,
    pageSize: config.securityMasterPageSize,
    lookbackDays: config.securityMasterLookbackDays,
  });
  return collectSecurityMaster(repository, {name:securityProvider.name,fetchLatest:async()=>{const batch=await securityProvider.fetchLatest();try{const types=await loadKisProductTypes();for(const item of batch.items){const type=types.get(item.marketType+':'+item.symbol);if(type)item.productClassification=type;}}catch{log('warn','product classification unavailable; existing master types preserved',{code:'PRODUCT_MASTER_UNAVAILABLE'});}return batch;}}, {
    lockTtlSeconds: config.lockTtlSeconds,
    deactivateMissing: config.securityMasterDeactivateMissing,
    minimumExpectedCount: config.securityMasterMinimumCount,
  });
};

const once = async (target: string, symbolArgument?: string): Promise<void> => {
  if (target === 'prices') await runPrices(symbolArgument?.split(',').map((symbol) => symbol.trim()).filter(Boolean));
  else if (target === 'snapshots') await runSnapshots();
  else if (target === 'securities') await runSecurities();
  else if (target === 'all') { await runSecurities(); await runPrices(); await runSnapshots(); }
  else throw new Error('usage: worker.ts [daemon|securities|prices [005930,005380]|snapshots|all]');
};

const daemon = async (): Promise<void> => {
  let completedPriceDate = '';
  let classificationChecked=false;
  let lockedRetryAt = 0;
  let outageRetryDate = '';
  let outageRetryAt = 0;
  let lastSnapshotKey = '';
  let lastSecurityMasterKey = '';
  let ticking = false;
  const tick = async () => {
    if (ticking || shutdown.signal.aborted) return;
    ticking = true;
    const now = new Date();
    const clock = getSeoulClock(now);
    try {
      if(!classificationChecked){await collectProductClassifications(prisma,now);classificationChecked=true;}
      let cachePrices:PriceCollectorResult|undefined,hasNewPrices=false;
      if (clock.hour >= config.priceCollectionHour && clock.dateKey !== completedPriceDate && now.getTime() >= lockedRetryAt) {
        const alreadyCompleted = await repository.hasCompletedScheduledPriceRun(clock.dateKey);
        if(!alreadyCompleted){const decision=await priceScheduleDecision(now);if(decision.closed){const run=await repository.createRun('market-prices',provider.name,{scheduleDate:clock.dateKey,attempt:'primary',calendar:decision});await repository.addRunItem(run,{symbol:'*',status:'SKIPPED',message:'MARKET_CLOSED: 확인된 휴장일 · 당일 전체 수집 생략'});await repository.finishRun(run,'SKIPPED',{success:0,failed:0,stale:0,skipped:1});completedPriceDate=clock.dateKey;}}
        if (alreadyCompleted || completedPriceDate===clock.dateKey) {
          completedPriceDate = clock.dateKey;
        } else if (outageRetryDate === clock.dateKey && outageRetryAt > 0 && now.getTime() >= outageRetryAt) {
          const retried=await runScheduledPrices(clock.dateKey, 'outage-retry');cachePrices=retried;hasNewPrices=retried.success>0;
          if(retried.skipReason==='LOCK_CONFLICT')lockedRetryAt=now.getTime()+300000;else completedPriceDate = clock.dateKey;
          if(retried.skipReason!=='LOCK_CONFLICT'){outageRetryDate = '';outageRetryAt = 0;}
        } else if (outageRetryDate !== clock.dateKey) {
          const result = await runScheduledPrices(clock.dateKey, 'primary');cachePrices=result;hasNewPrices=result.success>0;
          if(result.skipReason==='LOCK_CONFLICT'){lockedRetryAt=now.getTime()+300000;}
          else if (result.status === 'PARTIAL' && result.failedSymbols.length > 0) {
            const retried=await runScheduledPrices(clock.dateKey, 'partial-retry', result.failedSymbols);if(retried.skipReason!=='LOCK_CONFLICT')cachePrices=retried;hasNewPrices ||= retried.success>0;
            if(retried.skipReason==='LOCK_CONFLICT')lockedRetryAt=now.getTime()+300000;else completedPriceDate = clock.dateKey;
          } else if (result.status === 'FAILED' && result.failed > 0 && result.success === 0 && result.stale === 0) {
            outageRetryDate = clock.dateKey;
            outageRetryAt = now.getTime() + config.priceRetryDelayMinutes * 60 * 1000;
            log('warn', 'full price source outage scheduled for one retry', {
              scheduleDate: clock.dateKey,
              retryAt: new Date(outageRetryAt).toISOString(),
            });
          } else {
            completedPriceDate = clock.dateKey;
          }
        }
      }
      if(hasNewPrices&&cachePrices&&!shutdown.signal.aborted){try{await warmValueCaches(prisma,cachePrices.failedSymbols);}catch(error){log('error','value cache generation failed; last good snapshot retained',{error:String(error)});}}
      if(shutdown.signal.aborted)return;
      const snapshotKey = snapshotScheduleKey(now);
      if (config.snapshotHours.includes(clock.hour) && snapshotKey !== lastSnapshotKey) {
        lastSnapshotKey = snapshotKey;
        await runSnapshots(now);
      }
      if (clock.hour === config.securityMasterHour && clock.dateKey !== lastSecurityMasterKey) {
        lastSecurityMasterKey = clock.dateKey;
        await runSecurities();
      }
    } catch (error) {
      log('error', 'collector scheduler tick failed', { reason: error instanceof Error ? error.message : String(error) });
    } finally {
      ticking = false;
    }
  };
  log('info', 'collector scheduler started', { timezone: 'Asia/Seoul', config });
  // A long initial price sweep must not postpone the independent supplement timer.
  void tick();
  const timer = setInterval(() => void tick(), config.schedulerTickSeconds * 1000);
  let supplementRunning=false;
  const supplementTick=async()=>{if(supplementRunning)return;supplementRunning=true;try{const result=await runIndependentSupplement(prisma,{windowStartHour:config.dartWindowStartHour,windowEndHour:config.dartWindowEndHour,apiKey:process.env.DART_API_KEY,dailyCallLimit:config.dartDailyCallLimit,minDelayMs:config.dartMinDelayMs},new Date(),{serviceManual:async()=>{const state=await prisma.dartCollectorState.findUnique({where:{id:1}});return processManualRefresh(prisma,{enabled:config.dartEnabled,apiKey:process.env.DART_API_KEY??'',dailyCallLimit:state?.backfillCompletedAt?config.dartDailyCallLimit:config.dartBackfillDailyCallLimit,minDelayMs:state?.backfillCompletedAt?config.dartMinDelayMs:config.dartBackfillMinDelayMs});}});if(!['IDLE','LOCKED','OUTSIDE_WINDOW','DISABLED','QUOTA_BLOCKED'].includes(result.status))log('info','independent valuation supplement finished',result);}catch{log('error','independent valuation supplement failed',{code:'SUPPLEMENT_INTERNAL_ERROR'});}finally{supplementRunning=false;}};
  void supplementTick();const supplementTimer=setInterval(()=>void supplementTick(),60000);
  const stop = async () => { shutdown.abort(); clearInterval(timer); clearInterval(supplementTimer); while(ticking || supplementRunning)await new Promise(r=>setTimeout(r,100)); await prisma.$disconnect(); process.exit(0); };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
};

const target = process.argv[2] ?? 'daemon';
try {
  if (target === 'daemon') await daemon();
  else { await once(target, process.argv[3]); await prisma.$disconnect(); }
} catch (error) {
  log('error', 'collector process failed', { reason: error instanceof Error ? error.message : String(error) });
  await prisma.$disconnect();
  process.exitCode = 1;
}
