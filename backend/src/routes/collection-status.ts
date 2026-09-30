import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function collectionStatusRoutes(app: FastifyInstance) {
  app.get('/collection/status', async () => {
    const [run, price] = await Promise.all([
      prisma.collectorRun.findFirst({ where: { jobType: 'market-prices' }, orderBy: { startedAt: 'desc' } }),
      prisma.marketPrice.findFirst({ orderBy: { priceUpdatedAt: 'desc' }, select: { priceUpdatedAt: true } }),
    ]);
    return { data: {
      latestRun: run ? {
        id: run.id.toString(), status: run.status, startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null, successCount: run.successCount,
        failureCount: run.failureCount, failureReason: run.failureReason,
      } : null,
      latestPriceAt: price?.priceUpdatedAt.toISOString() ?? null,
      manualRunAvailable: false,
      settingsAvailable: false,
    } };
  });
}
