import {collectionClient} from './collection-client.js';
import { PrismaClient } from '../generated/prisma/index.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const rawPrisma = globalForPrisma.prisma ?? new PrismaClient();
export const prisma = collectionClient(rawPrisma);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = rawPrisma;
}
