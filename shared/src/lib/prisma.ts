import {collectionClient} from './collection-client.js';
import { Prisma, PrismaClient } from '../generated/prisma/index.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const rawPrisma = globalForPrisma.prisma ?? new PrismaClient();
export const prisma = collectionClient(rawPrisma);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = rawPrisma;
}

/** Shared administrative data only. No mutation delegates, raw SQL, personal models or writer locks. */
export type SecurityDataReadSnapshot={
  security:Pick<Prisma.TransactionClient['security'],'findMany'>;
  securityDataReceipt:Pick<Prisma.TransactionClient['securityDataReceipt'],'findMany'>;
};
export function securityDataReadSnapshot<T>(read:(view:SecurityDataReadSnapshot)=>Promise<T>):Promise<T>{
 return rawPrisma.$transaction(async tx=>{
  // Retain collection-symbol namespace protection while MVCC supplies a consistent read snapshot.
  const guarded=collectionClient(tx,rawPrisma,true);
  const view=Object.freeze({security:Object.freeze({findMany:guarded.security.findMany.bind(guarded.security)}),securityDataReceipt:Object.freeze({findMany:guarded.securityDataReceipt.findMany.bind(guarded.securityDataReceipt)})});
  return read(view);
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:30000});
}
