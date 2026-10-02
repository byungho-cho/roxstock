import { Prisma } from '../generated/prisma/index.js';
import { prisma } from './prisma.js';

export async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000, timeout: 10_000,
      });
    } catch (error) {
      // Both errors guarantee a rolled-back transaction; never retry uncertain commits.
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : '';
      if (attempt >= 2 || !['P2034', 'P2002'].includes(code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}
