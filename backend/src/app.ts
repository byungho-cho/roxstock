import Fastify from 'fastify';

import { prisma } from './lib/prisma.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/health/db', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      app.log.error(error, 'Database health check failed');
      return reply.code(503).send({
        status: 'error',
        database: 'disconnected',
      });
    }
  });

  return app;
}
