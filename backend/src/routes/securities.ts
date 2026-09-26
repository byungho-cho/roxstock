import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';

export async function securityRoutes(app: FastifyInstance) {
  app.get('/securities', async () => {
    const securities = await prisma.security.findMany({
      where: { isActive: true },
      include: { watchlistItem: true, marketPrice: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return {
      data: securities.map((security) => ({
        id: security.id.toString(),
        symbol: security.symbol,
        name: security.name,
        marketType: security.marketType,
        securityType: security.securityType,
        listType: security.watchlistItem?.listType ?? null,
        currentPrice: security.marketPrice?.currentPrice.toString() ?? null,
        previousClosePrice: security.marketPrice?.previousClosePrice?.toString() ?? null,
        priceUpdatedAt: security.marketPrice?.priceUpdatedAt.toISOString() ?? null,
      })),
    };
  });
}
