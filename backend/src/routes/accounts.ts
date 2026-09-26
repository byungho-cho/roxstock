import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';

export async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', async () => {
    const accounts = await prisma.account.findMany({ orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] });
    return {
      data: accounts.map((account) => ({
        id: account.id.toString(),
        name: account.name,
        brokerName: account.brokerName,
        accountNumber: account.accountNumber,
        cashBalance: account.cashBalance.toString(),
        isActive: account.isActive,
        displayOrder: account.displayOrder,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      })),
    };
  });
}
