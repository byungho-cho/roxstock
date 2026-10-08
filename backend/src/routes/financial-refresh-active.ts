import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { id } from '../lib/input.js';
import type { ManualRefreshMetadata } from '../collector/dart-manual-refresh.js';

/** Read only: follows the worker's existing durable run and does not enqueue or alter it. */
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
    const m = run?.metadata as unknown as ManualRefreshMetadata | undefined;
    if (!run || !m || m.phase !== 'MANUAL' || m.securityId !== securityId || m.manualState === 'FINISHED') return { data: null };
    return { data: {
      requestId: run.id.toString(), state: m.manualState, status: run.status,
      fiscalYear: m.fiscalYear, startYear: m.startYear ?? m.fiscalYear,
      endYear: m.endYear ?? m.fiscalYear, period: m.period,
      startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null,
      progress: m.progress ?? null, results: m.results ?? [],
    } };
  });
}
