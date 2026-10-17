import {manualTrace,expireManualRun} from '@roxstock/shared/collection/manual-requests';
import { refreshSummary } from '@roxstock/shared/collection/refresh-summary';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@roxstock/shared/lib/prisma';
import { id } from '../lib/input.js';
import type { ManualRefreshMetadata } from '@roxstock/shared/collection/manual-requests';

/** Follows durable jobs, repairs expired manual runs, and never enqueues a new collection. */
export async function financialRefreshActiveRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/securities/:id/financial-refresh/active', async request => {
    const securityId = id(request.params.id, 'id').toString();
    const run = await prisma.collectorRun.findFirst({
      where: {
        jobType: 'dart-financial-statements', status: 'RUNNING',
        AND: [
          { metadata: { path: '$.phase', equals: 'MANUAL' } },
          { metadata: { path: '$.securityId', equals: securityId } },
        ],
      },
      orderBy: { startedAt: 'desc' },
    });
    if(run&&(run.metadata as unknown as ManualRefreshMetadata).executionMode==='MANUAL_PROTOTYPE'&&await expireManualRun(prisma,run))return {data:null};
    const m = run?.metadata as unknown as ManualRefreshMetadata | undefined;
    if (!run || !m || m.phase !== 'MANUAL' || m.securityId !== securityId || m.manualState === 'FINISHED') return { data: null };
    return { data: {
      ...await manualTrace(prisma,run), requestId: run.id.toString(), state: m.manualState, status: run.status,
      fiscalYear: m.fiscalYear, startYear: m.startYear ?? m.fiscalYear,
      endYear: m.endYear ?? m.fiscalYear, period: m.period, refreshMode:m.refreshMode??'FULL', terminalCode:m.terminalCode??null,
      startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null,
      progress: m.progress ?? null, counts:refreshSummary(m.results??[]), results: m.results ?? [],
    } };
  });
}
