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
      // Retry confirmed transaction conflicts only; never retry uncertain commits.
      const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
      const code = known?.code ?? '';
      // MariaDB may report locking conflicts through raw-query P2010 instead of P2034.
      // The interactive callback has failed and Prisma has rolled back before this catch.
      const rawConflict = code === 'P2010' && ['1020', '1213', '1205'].includes(String(known?.meta?.code));
      if (attempt >= 2 || (!['P2034', 'P2002'].includes(code) && !rawConflict)) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}
