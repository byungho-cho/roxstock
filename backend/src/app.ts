import Fastify from 'fastify';

import { ApiError } from './lib/api-error.js';
import { prisma } from './lib/prisma.js';
import { accountRoutes } from './routes/accounts.js';
import { securityRoutes } from './routes/securities.js';
import { tradeRoutes } from './routes/trades.js';
import { internalPriceRoutes, priceRoutes } from './routes/prices.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { cashRoutes } from './routes/cash.js';

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

  void app.register(accountRoutes, { prefix: '/api' });
  void app.register(securityRoutes, { prefix: '/api' });
  void app.register(tradeRoutes, { prefix: '/api' });
  void app.register(priceRoutes, { prefix: '/api' });
  void app.register(portfolioRoutes, { prefix: '/api' });
  void app.register(cashRoutes, { prefix: '/api' });
  void app.register(internalPriceRoutes);

  return app;
}
