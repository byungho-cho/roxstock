import {PrismaClient} from '@roxstock/shared/prisma';
import {CollectionJobRepository} from '@roxstock/shared/collection/job-repository';
import {claimSupplement} from '../src/valuation-supplement-queue.js';
const url=new URL(process.env.DATABASE_URL??'');if(!url.pathname.endsWith('_valuation_queue_phase16_test')||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Fixture only');
const db=new PrismaClient(),owner='fixture-crashed-owner',repo=new CollectionJobRepository(db);
if(!await repo.acquireLock(owner,900))throw Error('Fixture lock unavailable');
if(!await claimSupplement(db,BigInt(process.argv[2]!),owner,new Date()))throw Error('Fixture task unavailable');
// No finally, disconnect or release. Parent verifies real elapsed lease expiry and recovery.
process.exit(0);
