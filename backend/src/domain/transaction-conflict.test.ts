import test from 'node:test';import assert from 'node:assert/strict';
import {Prisma} from '@roxstock/shared/prisma';import {isMariaDbSnapshotConflict} from './transaction-conflict.js';
const unknown=(message:string)=>new Prisma.PrismaClientUnknownRequestError(message,{clientVersion:'6.19.3'});
test('only confirmed MariaDB 1020 snapshot conflicts may retry after callback rollback',()=>{
 assert.equal(isMariaDbSnapshotConflict(unknown('MysqlError { code: 1020, message: "Record has changed since last read in table cash_transactions" }')),true);
 for(const error of [unknown('network timeout'),unknown('MysqlError { code: 1062, message: "duplicate" }'),unknown('1020 application string'),new Error('MysqlError { code: 1020, Record has changed since last read')])assert.equal(isMariaDbSnapshotConflict(error),false);
});
