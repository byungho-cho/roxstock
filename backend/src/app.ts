import { annualConsensusRoutes } from './routes/annual-consensus.js';
import { compoundGrowthRoutes } from './routes/compound-growth.js';
import { financialStatementRoutes } from './routes/financial-statements.js';
import Fastify from 'fastify';
import { valueAnalysisRoutes } from './routes/value-analysis.js';
import { financialRefreshRoutes } from './routes/financial-refresh.js';

import { ApiError } from './lib/api-error.js';
import { prisma } from './lib/prisma.js';
import { targetArrivalRoutes } from './routes/target-arrivals.js';
import { accountRoutes } from './routes/accounts.js';
import { securityRoutes } from './routes/securities.js';
import { tradeRoutes } from './routes/trades.js';
import { internalPriceRoutes, priceRoutes } from './routes/prices.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { cashRoutes } from './routes/cash.js';
import { cashMutationRoutes } from './routes/cash-mutations.js';
import { collectionStatusRoutes } from './routes/collection-status.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/health/db', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      app.log.error(error, 'Database health check failed');
      return reply.code(503).send({ status: 'error', database: 'disconnected' });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  void app.register(compoundGrowthRoutes, { prefix: '/api' });
  void app.register(financialStatementRoutes, { prefix: '/api' });
  void app.register(valueAnalysisRoutes, { prefix: '/api' });
  void app.register(annualConsensusRoutes, { prefix: '/api' });
  void app.register(financialRefreshRoutes, { prefix: '/api' });
  void app.register(targetArrivalRoutes, { prefix: '/api' });
  void app.register(accountRoutes, { prefix: '/api' });
  void app.register(securityRoutes, { prefix: '/api' });
  void app.register(tradeRoutes, { prefix: '/api' });
  void app.register(priceRoutes, { prefix: '/api' });
  void app.register(portfolioRoutes, { prefix: '/api' });
  void app.register(cashRoutes, { prefix: '/api' });
  void app.register(cashMutationRoutes, { prefix: '/api' });
  void app.register(collectionStatusRoutes, { prefix: '/api' });
  void app.register(internalPriceRoutes);

  return app;
}
