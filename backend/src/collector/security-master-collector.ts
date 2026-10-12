import { randomUUID } from 'node:crypto';
import { collectorLog as log } from './logger.js';
import type { CollectorRepository, SecurityMasterProvider } from './types.js';
import { emptyCounters } from './types.js';

export interface SecurityMasterCollectorOptions {
  lockTtlSeconds: number;
  deactivateMissing: boolean;
  minimumExpectedCount: number;
}

export const collectSecurityMaster = async (
  repository: CollectorRepository,
  provider: SecurityMasterProvider,
  options: SecurityMasterCollectorOptions,
): Promise<void> => {
  const jobName = 'security-master';
  const ownerToken = randomUUID();
  if (!await repository.acquireLock(jobName, ownerToken, options.lockTtlSeconds)) {
    log('warn', 'security master collection skipped: already running');
    return;
  }
  const counters = emptyCounters();
  let runId: bigint | null = null;
  try {
    runId = await repository.createRun(jobName, provider.name);
    const batch = await provider.fetchLatest();
    if (batch.items.length < options.minimumExpectedCount) {
      throw new Error(`safety check failed: only ${batch.items.length} securities returned`);
    }
    const outcomes=await repository.upsertSecurityMaster(batch.items);
    if(outcomes){if(repository.addRunItems)await repository.addRunItems(runId,outcomes);else for(const item of outcomes)await repository.addRunItem(runId,item);}
    let deactivated = 0;
    if (options.deactivateMissing) deactivated = await repository.deactivateMissingSecurities(batch.items);
    counters.success = outcomes?outcomes.filter(r=>r.status==='SUCCESS').length:batch.items.length;
    counters.skipped = outcomes?outcomes.filter(r=>r.status==='SKIPPED').length:0;
    await repository.addRunItem(runId, {
      symbol: `MASTER:${batch.baseDate}`,
      status: 'SUCCESS',
      message: `upserted=${counters.success}, excluded=${counters.skipped}, deactivated=${deactivated}`,
      observedAt: new Date(),
    });
    await repository.finishRun(runId, counters.success===0&&counters.skipped>0?'SKIPPED':'SUCCESS', counters);
    log('info', 'security master collection completed', { baseDate: batch.baseDate, count: batch.items.length, deactivated });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    counters.failed = 1;
    if (runId !== null) {
      await repository.addRunItem(runId, { symbol: 'MASTER', status: 'FAILED', message: reason });
      await repository.finishRun(runId, 'FAILED', counters, reason);
    }
    log('error', 'security master collection failed', { reason });
    throw error;
  } finally {
    await repository.releaseLock(jobName, ownerToken);
  }
};
