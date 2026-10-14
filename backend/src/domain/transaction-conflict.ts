import {Prisma} from '../generated/prisma/index.js';
/** Only a confirmed MariaDB snapshot conflict; caller invokes this after transaction rollback. */
export function isMariaDbSnapshotConflict(error:unknown){
 return error instanceof Prisma.PrismaClientUnknownRequestError&&/MysqlError \{ code: 1020,/.test(error.message)&&/Record has changed since last read/.test(error.message);
}
