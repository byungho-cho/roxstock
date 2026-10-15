import {dartDiagnostic} from '@roxstock/shared/collection/dart-diagnostics';
import 'dotenv/config';
import { prisma } from '@roxstock/shared/lib/prisma';
import { loadCollectorConfig } from '@roxstock/shared/collection/config';
import { processManualRefresh } from './dart-manual-refresh.js';
import { runDartCollectorCycle } from './dart-collector.js';
import { publicHolidayDates } from '@roxstock/shared/collection/dart-policy';
import { collectorLog as log } from '@roxstock/shared/collection/logger';

const config = loadCollectorConfig();
let running = false;
let stopping = false;
const tick = async () => {
  if (running || stopping) return;
  running = true;
  try {
    const state = await prisma.dartCollectorState.findUnique({where:{id:1}});
    const backfill = !state?.backfillCompletedAt;
    const dartConfig = {
      enabled: config.dartEnabled, apiKey: process.env.DART_API_KEY?.trim() ?? '', dailyCallLimit: backfill ? config.dartBackfillDailyCallLimit : config.dartDailyCallLimit,
      minDelayMs: backfill ? config.dartBackfillMinDelayMs : config.dartMinDelayMs, backfillStartYear: config.dartBackfillStartYear,
      backfillCompanyLimit: config.dartBackfillCompanyLimit, universeBatchSize: config.dartUniverseBatchSize,
      priorityWindowStartHour: config.dartPriorityWindowStartHour, priorityWindowEndHour: config.dartPriorityWindowEndHour,
      windowStartHour: config.dartWindowStartHour, windowEndHour: config.dartWindowEndHour,
      corpRefreshHours: config.dartCorpRefreshHours,
      restDayAllDay: config.dartRestDayAllDay, holidayDates: await publicHolidayDates(),
    };
    if (await processManualRefresh(prisma, dartConfig)) return;
    const result = await runDartCollectorCycle(prisma, dartConfig);
    if (result.status === 'NOT_CONFIGURED') log('warn', 'DART collector is not configured; schedule is inactive', {});
    else if (!['LOCKED', 'DISABLED', 'QUOTA_BLOCKED', 'OUTSIDE_WINDOW'].includes(result.status)) log('info', 'DART collector cycle finished', result);
  } catch (error) {
    log('error', 'DART collector worker tick failed', dartDiagnostic(error,'WORKER_TICK'));
  } finally { running = false; }
};

const timer = setInterval(() => void tick(), 60_000);
const stop = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 100));
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());



await tick();
