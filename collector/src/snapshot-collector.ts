import { randomUUID } from 'node:crypto';
import { Prisma } from '@roxstock/shared/prisma';
import { collectorLog as log } from '@roxstock/shared/collection/logger';
import { getSeoulClock, toDatabaseDate } from '@roxstock/shared/collection/time';
import type { CollectorRepository, CollectorRunStatus, RunCounters, SnapshotAccount, SnapshotValue } from './types.js';
import { emptyCounters } from './types.js';

export interface SnapshotCalculation {
  value?: SnapshotValue;
  missingSymbols: string[];
}

export const calculateSnapshot = (account: SnapshotAccount): SnapshotCalculation => {
  if (account.cashBalance === null) return { missingSymbols: ['CURRENT_CASH_MISSING'] };
  let stockValue = new Prisma.Decimal(0);
  let purchaseAmount = new Prisma.Decimal(0);
  const missing = new Set<string>();
  for (const lot of account.lots) {
    const remaining = new Prisma.Decimal(lot.quantity).sub(lot.soldQuantity);
    if (remaining.lte(0)) continue;
    purchaseAmount = purchaseAmount.add(remaining.mul(lot.unitPrice));
    if (lot.currentPrice === null) {
      missing.add(lot.symbol);
      continue;
    }
    stockValue = stockValue.add(remaining.mul(lot.currentPrice));
  }
  if (missing.size > 0) return { missingSymbols: [...missing].sort() };
  const cash = new Prisma.Decimal(account.cashBalance);
  return {
    missingSymbols: [],
    value: {
      investmentAmount: cash.add(purchaseAmount).toString(),
      cashBalance: cash.toString(),
      stockValue: stockValue.toString(),
      totalAssetValue: cash.add(stockValue).toString(),
    },
  };
};

export interface SnapshotCollectorResult extends RunCounters { runId: bigint; status: CollectorRunStatus }

export const collectDailyAccountSnapshots = async (
  repository: CollectorRepository,
  options: { lockTtlSeconds: number; now?: Date },
): Promise<SnapshotCollectorResult> => {
  const jobName = 'daily-account-snapshots';
  const owner = randomUUID();
  const now = options.now ?? new Date();
  const clock = getSeoulClock(now);
  const counters = emptyCounters();
  const locked = await repository.acquireLock(jobName, owner, options.lockTtlSeconds);
  const runId = await repository.createRun(jobName, 'database', {
    snapshotDate: clock.dateKey,
    finalScheduledRun: clock.hour === 23,
  });
  if (!locked) {
    counters.skipped = 1;
    await repository.addRunItem(runId, { symbol: '*', status: 'SKIPPED', message: 'another execution holds the snapshot lock' });
    await repository.finishRun(runId, 'SKIPPED', counters);
    return { runId, status: 'SKIPPED', ...counters };
  }

  try {
    const accounts = await repository.listActiveAccountsForSnapshot();
    const snapshotDate = toDatabaseDate(clock.dateKey);
    for (const account of accounts) {
      if (account.cashBalance === null && account.lots.length === 0) {
        counters.skipped += 1;
        await repository.addRunItem(runId, {
          symbol: `account:${account.id}`, status: 'SKIPPED',
          message: '빈 계좌 수집 제외: 예수금과 매수 내역이 없어 스냅샷을 생성하지 않습니다.',
        });
        continue;
      }
      const calculation = calculateSnapshot(account);
      if (!calculation.value) {
        counters.failed += 1;
        const reason = calculation.missingSymbols.includes('CURRENT_CASH_MISSING')
          ? '스냅샷 미생성: 예수금이 등록되지 않았습니다.'
          : `스냅샷 미생성: 보유 종목의 현재가가 없습니다 (${calculation.missingSymbols.join(', ')}).`;
        await repository.addRunItem(runId, { symbol: `account:${account.id}`, status: 'FAILED', message: reason });
        log('warn', 'account snapshot skipped', { runId, accountId: account.id, reason });
        continue;
      }
      await repository.upsertDailyAccountSnapshot(account.id, snapshotDate, calculation.value);
      counters.success += 1;
      await repository.addRunItem(runId, { symbol: `account:${account.id}`, status: 'SUCCESS', observedAt: now });
    }
    const status: CollectorRunStatus = accounts.length === 0 ? 'SKIPPED'
      : counters.failed === 0 ? 'SUCCESS'
      : counters.success > 0 ? 'PARTIAL'
      : 'FAILED';
    await repository.finishRun(runId, status, counters, status === 'FAILED' ? 'no account snapshot was stored' : undefined);
    log('info', 'account snapshot collection finished', { runId, status, snapshotDate: clock.dateKey, ...counters });
    return { runId, status, ...counters };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await repository.finishRun(runId, 'FAILED', counters, reason.slice(0, 1000));
    throw error;
  } finally {
    await repository.releaseLock(jobName, owner);
  }
};

// Phase 2 extension point: daily_position_snapshots should be calculated only
// after the account snapshot has passed the complete-price check above.
