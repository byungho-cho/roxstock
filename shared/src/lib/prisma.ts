import {collectionClient} from './collection-client.js';
import { Prisma, PrismaClient } from '../generated/prisma/index.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  securityDataReader: PrismaClient | undefined;
};

const rawPrisma = globalForPrisma.prisma ?? new PrismaClient();
export const prisma = collectionClient(rawPrisma);
// Administrative snapshots cannot compete for the pool used by writes/cache rebuilds.
// The small independent pool remains bounded; no credentials leave this module.
function snapshotReader(){
 if(globalForPrisma.securityDataReader)return globalForPrisma.securityDataReader;
 const readerUrl=new URL(process.env.DATABASE_URL!);readerUrl.searchParams.set('connection_limit','2');
 return globalForPrisma.securityDataReader=new PrismaClient({datasources:{db:{url:readerUrl.toString()}}});
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = rawPrisma;
}

/** Shared administrative data only. No mutation delegates, raw SQL, personal models or writer locks. */
export type SecurityDataReadSnapshot={
  security:Pick<Prisma.TransactionClient['security'],'findMany'>;
  securityDataReceipt:Pick<Prisma.TransactionClient['securityDataReceipt'],'findMany'>;
};
export function securityDataReadSnapshot<T>(read:(view:SecurityDataReadSnapshot)=>Promise<T>):Promise<T>{
 const securityDataReader=snapshotReader();
 return securityDataReader.$transaction(async tx=>{
  // Retain collection-symbol namespace protection while MVCC supplies a consistent read snapshot.
  const guarded=collectionClient(tx,securityDataReader,true);
  const view=Object.freeze({security:Object.freeze({findMany:guarded.security.findMany.bind(guarded.security)}),securityDataReceipt:Object.freeze({findMany:guarded.securityDataReceipt.findMany.bind(guarded.securityDataReceipt)})});
  return read(view);
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:30000});
}
